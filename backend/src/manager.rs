use crate::template::Template;
use crate::user::{User, UserConfiguration};
use crate::{
    kubernetes::{Engine, PodDetails},
    session::SessionConfiguration,
};
use crate::{metrics::Metrics, session::Session, user::LoggedUser};
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    error::Error,
    sync::{Arc, Mutex},
    thread::{self, JoinHandle},
    time::{Duration, SystemTime},
};
use tokio::runtime::Runtime;

fn phase(pod: &PodDetails) -> Option<String> {
    pod.details
        .status
        .as_ref()
        .and_then(|status| status.phase.clone())
}

fn elapsed(pod: &PodDetails) -> Option<Duration> {
    pod.details
        .status
        .as_ref()
        .and_then(|status| status.start_time.as_ref())
        .and_then(|time| {
            let time: SystemTime = time.0.into();
            time.elapsed().ok()
        })
}

fn is_running(pod: &PodDetails) -> bool {
    phase(pod).map_or(false, |phase| phase == "Running")
}

fn running_sessions(sessions: Vec<Session>) -> Vec<Session> {
    sessions
        .into_iter()
        .filter(|session| is_running(&session.pod))
        .collect()
}

#[derive(Clone)]
pub struct Manager {
    pub engine: Engine,
    pub metrics: Metrics,
    instances: Arc<Mutex<BTreeMap<String, String>>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PlaygroundUser {
    pub id: String,
    pub avatar: String,
    pub admin: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PlaygroundDetails {
    pub templates: Vec<Template>,
    pub session: Option<Session>,
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
            instances: Arc::new(Mutex::new(BTreeMap::new())), // Temp map used to track instance deployment time
        })
    }

    pub fn spawn_background_thread(self) -> JoinHandle<()> {
        thread::spawn(move || loop {
            thread::sleep(Manager::FIVE_SECONDS);

            // Track some deployments metrics
            let instances_thread = self.clone().instances.clone();
            if let Ok(mut instances2) = instances_thread.lock() {
                let instances3 = &mut instances2.clone();
                for id in instances3 {
                    match self.clone().get_session(&id.0) {
                        Ok(session) => {
                            let phase =
                                phase(&session.pod).unwrap_or_else(|| "Unknown".to_string());
                            // Deployed instances are removed from the set
                            // Additionally the deployment time is tracked
                            match phase.as_str() {
                                "Running" | "Failed" => {
                                    instances2.remove(&session.username);
                                    // TODO track success / failure
                                    if let Some(duration) = elapsed(&session.pod) {
                                        self.clone()
                                            .metrics
                                            .observe_deploy_duration(&id.0, duration.as_secs_f64());
                                    } else {
                                        error!("Failed to compute this instance lifetime");
                                    }
                                }
                                _ => {}
                            }
                            // Ignore "Unknown"
                            // "Succeeded" can't happen
                        }
                        Err(err) => warn!("Failed to call get: {}", err),
                    }
                }
            } else {
                error!("Failed to acquire instances lock");
            }

            // Go through all Running pods and figure out if they have to be undeployed
            match self.clone().list_sessions() {
                Ok(sessions) => {
                    for session in running_sessions(sessions) {
                        if let Some(duration) = elapsed(&session.pod) {
                            if duration > session.session_duration {
                                info!(
                                    "Undeploying {} {:?} {:?}",
                                    session.username, duration, session.session_duration
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
            session: new_runtime()?
                .block_on(self.engine.get_session(user.id.as_str()))
                .ok(),
            user: Some(PlaygroundUser {
                id: user.id,
                avatar: user.avatar,
                admin: false,
            }),
        })
    }

    pub fn get_unlogged(self) -> Result<PlaygroundDetails, String> {
        let templates = new_runtime()?.block_on(self.engine.list_templates())?;
        Ok(PlaygroundDetails {
            templates,
            session: None,
            user: None,
        })
    }

    // Users

    pub fn list_users(self) -> Result<Vec<User>, String> {
        new_runtime()?.block_on(self.engine.list_users())
    }

    pub fn create_or_update_user(self, id: String, user: UserConfiguration) -> Result<(), String> {
        new_runtime()?.block_on(self.engine.create_or_update_user(id, user))
    }

    pub fn delete_user(self, id: String) -> Result<(), String> {
        new_runtime()?.block_on(self.engine.delete_user(id))
    }

    // Sessions

    pub fn get_session(self, username: &str) -> Result<Session, String> {
        new_runtime()?.block_on(self.engine.get_session(&username))
    }

    pub fn list_sessions(&self) -> Result<Vec<Session>, String> {
        new_runtime()?.block_on(self.clone().engine.list_sessions())
    }

    pub fn create_or_update_session(
        self,
        username: &str,
        session: SessionConfiguration,
    ) -> Result<String, String> {
        let template = session.clone().template;
        let result =
            new_runtime()?.block_on(self.engine.create_or_update_session(&username, session));
        match result.clone() {
            Ok(instance_uuid) => {
                if let Ok(mut instances) = self.instances.lock() {
                    instances.insert(username.into(), instance_uuid);
                } else {
                    error!("Failed to acquire instances lock");
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
