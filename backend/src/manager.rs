use crate::{kubernetes::Engine, session::SessionConfiguration};
use crate::{
    kubernetes::Phase,
    user::{User, UserConfiguration},
};
use crate::{
    kubernetes::{Configuration, Environment},
    template::Template,
};
use crate::{metrics::Metrics, session::Session, user::LoggedUser};
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    error::Error,
    sync::{Arc, Mutex},
    thread::{self, JoinHandle},
    time::Duration,
};
use tokio::runtime::Runtime;

fn running_sessions(sessions: Vec<Session>) -> Vec<Session> {
    sessions
        .into_iter()
        .filter(|session| session.pod.phase == Phase::Running)
        .collect()
}

#[derive(Clone)]
pub struct Manager {
    pub engine: Engine,
    pub metrics: Metrics,
    sessions: Arc<Mutex<BTreeMap<String, Session>>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PlaygroundUser {
    pub id: String,
    pub avatar: String,
    pub admin: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct PlaygroundDetails {
    pub env: Environment,
    pub configuration: Configuration,
    pub templates: BTreeMap<String, Template>,
    pub user: Option<PlaygroundUser>,
}

impl Manager {
    const FIVE_SECONDS: Duration = Duration::from_secs(5);

    pub async fn new() -> Result<Self, Box<dyn Error>> {
        let metrics = Metrics::new()?;
        let engine = Engine::new().await?;
        // Go through all existing sessions and update the ingress
        match engine.clone().list_sessions().await {
            Ok(sessions) => {
                engine
                    .clone()
                    .patch_ingress(
                        running_sessions(sessions)
                            .iter()
                            .map(|i| (i.username.clone(), &i.template))
                            .collect(),
                    )
                    .await?;
            }
            Err(err) => error!(
                "Failed to call list_all: {}. Existing sessions won't be accessible",
                err
            ),
        }
        Ok(Manager {
            engine,
            metrics,
            sessions: Arc::new(Mutex::new(BTreeMap::new())), // Temp map used to track session deployment time
        })
    }

    pub fn spawn_background_thread(self) -> JoinHandle<()> {
        thread::spawn(move || loop {
            thread::sleep(Manager::FIVE_SECONDS);

            // Track some deployments metrics
            let sessions_thread = self.clone().sessions.clone();
            if let Ok(mut sessions2) = sessions_thread.lock() {
                let sessions3 = &mut sessions2.clone();
                for (id, _) in sessions3 {
                    match self.clone().get_session(&id) {
                        Ok(Some(session)) => {
                            // Deployed sessions are removed from the set
                            // Additionally the deployment time is tracked
                            match session.pod.phase {
                                Phase::Running | Phase::Failed => {
                                    sessions2.remove(&session.username);
                                    // TODO track success / failure
                                    if let Some(duration) =
                                        &session.pod.start_time.and_then(|p| p.elapsed().ok())
                                    {
                                        self.clone()
                                            .metrics
                                            .observe_deploy_duration(&id, duration.as_secs_f64());
                                    } else {
                                        error!("Failed to compute this session lifetime");
                                    }
                                }
                                _ => {}
                            }
                            // Ignore "Unknown"
                            // "Succeeded" can't happen
                        }
                        Err(err) => warn!("Failed to call get: {}", err),
                        Ok(None) => warn!("No matching pod: {}", id),
                    }
                }
            } else {
                error!("Failed to acquire sessions lock");
            }

            // Go through all Running pods and figure out if they have to be undeployed
            match self.clone().list_sessions() {
                Ok(sessions) => {
                    for session in running_sessions(sessions) {
                        if let Some(duration) =
                            &session.pod.start_time.and_then(|p| p.elapsed().ok())
                        {
                            if duration > &session.duration {
                                info!(
                                    "Undeploying {} {:?} {:?}",
                                    session.username, duration, session.duration
                                );

                                match self.clone().delete_session(&session.username) {
                                    Ok(()) => (),
                                    Err(err) => {
                                        warn!(
                                            "Error while undeploying {}: {}",
                                            session.username, err
                                        )
                                    }
                                }
                            }
                        } else {
                            error!("Failed to compute this session lifetime");
                        }
                    }
                }
                Err(err) => error!("Failed to call list_all: {}", err),
            }
        })
    }
}

fn new_runtime() -> Result<Runtime, String> {
    Runtime::new().map_err(|err| format!("{}", err))
}

impl Manager {
    pub fn get(self, user: LoggedUser) -> Result<PlaygroundDetails, String> {
        let templates = new_runtime()?.block_on(self.clone().engine.list_templates())?;
        Ok(PlaygroundDetails {
            templates,
            user: Some(PlaygroundUser {
                id: user.id,
                avatar: user.avatar,
                admin: user.admin,
            }),
            env: self.engine.env,
            configuration: self.engine.configuration,
        })
    }

    pub fn get_unlogged(self) -> Result<PlaygroundDetails, String> {
        let templates = new_runtime()?.block_on(self.clone().engine.list_templates())?;
        Ok(PlaygroundDetails {
            templates,
            user: None,
            env: self.engine.env,
            configuration: self.engine.configuration,
        })
    }

    // Users

    pub fn list_users(self) -> Result<BTreeMap<String, User>, String> {
        new_runtime()?.block_on(self.engine.list_users())
    }

    pub fn create_or_update_user(
        self,
        id: String,
        user: UserConfiguration,
    ) -> Result<User, String> {
        new_runtime()?.block_on(self.engine.create_or_update_user(id, user))
    }

    pub fn delete_user(self, id: String) -> Result<(), String> {
        new_runtime()?.block_on(self.engine.delete_user(id))
    }

    // Sessions

    pub fn get_session(self, username: &str) -> Result<Option<Session>, String> {
        new_runtime()?.block_on(self.engine.get_session(&username))
    }

    pub fn list_sessions(&self) -> Result<Vec<Session>, String> {
        new_runtime()?.block_on(self.clone().engine.list_sessions())
    }

    pub fn create_or_update_session(
        self,
        username: &str,
        conf: SessionConfiguration,
    ) -> Result<Session, String> {
        let template = conf.clone().template;
        let result = new_runtime()?.block_on(self.engine.create_or_update_session(&username, conf));
        match result.clone() {
            Ok(session) => {
                if let Ok(mut sessions) = self.sessions.lock() {
                    sessions.insert(username.into(), session);
                } else {
                    error!("Failed to acquire sessions lock");
                }
                self.metrics.inc_deploy_counter(&username, &template);
            }
            Err(_) => self
                .metrics
                .inc_deploy_failures_counter(&username, &template),
        }
        result
    }

    pub fn delete_session(self, username: &str) -> Result<(), String> {
        let result = new_runtime()?.block_on(self.engine.delete_session(&username));
        match result {
            Ok(_) => self.metrics.inc_undeploy_counter(&username),
            Err(_) => self.metrics.inc_undeploy_failures_counter(&username),
        }
        result
    }
}
