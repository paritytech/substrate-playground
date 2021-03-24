use crate::{
    error::{Error, Result},
    kubernetes::{Configuration, Engine, Environment},
    metrics::Metrics,
    types::{
        LoggedUser, Phase, Pool, Session, SessionConfiguration, SessionUpdateConfiguration,
        Template, User, UserConfiguration, UserUpdateConfiguration,
    },
};
use log::{error, info, warn};
use serde::Serialize;
use std::{
    collections::{BTreeMap, HashSet},
    sync::{Arc, Mutex},
    thread::{self, JoinHandle},
    time::Duration,
};
use tokio::runtime::Runtime;

fn running_sessions(sessions: Vec<&Session>) -> Vec<&Session> {
    sessions
        .into_iter()
        .filter(|session| session.pod.phase == Phase::Running)
        .collect()
}

#[derive(Clone)]
pub struct Manager {
    pub engine: Engine,
    pub metrics: Metrics,
    sessions: Arc<Mutex<HashSet<String>>>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Playground {
    pub env: Environment,
    pub configuration: Configuration,
    pub templates: BTreeMap<String, Template>,
    pub user: Option<LoggedUser>,
}

impl Manager {
    const SLEEP_TIME: Duration = Duration::from_secs(60);

    pub async fn new() -> Result<Self> {
        let metrics = Metrics::new().map_err(|err| Error::Failure(err.into()))?;
        let engine = Engine::new().await?;
        // Go through all existing sessions and update the ingress
        match engine.clone().list_sessions().await {
            Ok(sessions) => {
                let running = running_sessions(sessions.values().collect())
                    .iter()
                    .map(|i| (i.user_id.clone(), &i.template))
                    .collect();
                engine.clone().patch_ingress(&running).await?;

                if running.is_empty() {
                    info!("No sesssions restored");
                } else {
                    info!("Restored sesssions for {:?}", running.keys());
                }
            }
            Err(err) => error!(
                "Failed to call list_all: {}. Existing sessions won't be accessible",
                err
            ),
        }
        Ok(Manager {
            engine,
            metrics,
            sessions: Arc::new(Mutex::new(HashSet::new())), // Temp map used to track session deployment time
        })
    }

    pub fn spawn_background_thread(self) -> JoinHandle<()> {
        thread::spawn(move || loop {
            thread::sleep(Manager::SLEEP_TIME);

            // Track some deployments metrics
            if let Ok(runtime) = new_runtime() {
                let sessions_thread = self.clone().sessions.clone();
                if let Ok(mut sessions2) = sessions_thread.lock() {
                    let sessions3 = &mut sessions2.clone();
                    for id in sessions3.iter() {
                        match runtime.block_on(self.engine.get_session(&session_id(id))) {
                            Ok(Some(session)) => {
                                // Deployed sessions are removed from the set
                                // Additionally the deployment time is tracked
                                match session.pod.phase {
                                    Phase::Running | Phase::Failed => {
                                        sessions2.remove(&session.user_id);
                                        if let Some(duration) =
                                            &session.pod.start_time.and_then(|p| p.elapsed().ok())
                                        {
                                            self.clone()
                                                .metrics
                                                .observe_deploy_duration(duration.as_secs_f64());
                                        } else {
                                            error!("Failed to compute this session lifetime");
                                        }
                                    }
                                    _ => {}
                                }
                            }
                            Err(err) => {
                                warn!("Failed to call get: {}", err);
                                sessions2.remove(id);
                            }
                            Ok(None) => warn!("No matching pod: {}", id),
                        }
                    }
                } else {
                    error!("Failed to acquire sessions lock");
                }

                // Go through all Running pods and figure out if they have to be undeployed
                match runtime.block_on(self.engine.list_sessions()) {
                    Ok(sessions) => {
                        for session in running_sessions(sessions.values().collect()) {
                            if let Some(duration) =
                                &session.pod.start_time.and_then(|p| p.elapsed().ok())
                            {
                                if duration > &session.duration {
                                    info!("Undeploying {}", session.user_id);

                                    match runtime.block_on(self.engine.delete_session(&session_id(&session.user_id))) {
                                        Ok(()) => (),
                                        Err(err) => {
                                            warn!(
                                                "Error while undeploying {}: {}",
                                                session.user_id, err
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
            }
        })
    }
}

fn new_runtime() -> Result<Runtime> {
    Runtime::new().map_err(|err| Error::Failure(err.into()))
}

fn session_id(id: &str) -> String {
    // Create a unique ID for this session. Use lowercase to make sure the result can be used as part of a DNS
    id.to_string().to_lowercase()
}

impl Manager {
    pub fn get(self, user: LoggedUser) -> Result<Playground> {
        let templates = new_runtime()?.block_on(self.clone().engine.list_templates())?;
        Ok(Playground {
            templates,
            user: Some(user),
            env: self.engine.env,
            configuration: self.engine.configuration,
        })
    }

    pub fn get_unlogged(&self) -> Result<Playground> {
        let templates = new_runtime()?.block_on(self.clone().engine.list_templates())?;
        Ok(Playground {
            templates,
            user: None,
            env: self.clone().engine.env,
            configuration: self.clone().engine.configuration,
        })
    }

    // Users

    pub fn get_user(&self, user: &LoggedUser, id: &str) -> Result<Option<User>> {
        if user.has_admin_read_rights() {
            new_runtime()?.block_on(self.engine.get_user(&id))
        } else {
            Err(Error::Unauthorized())
        }
    }

    pub fn list_users(&self, user: &LoggedUser) -> Result<BTreeMap<String, User>> {
        if user.has_admin_read_rights() {
            new_runtime()?.block_on(self.engine.list_users())
        } else {
            Err(Error::Unauthorized())
        }
    }

    pub fn create_user(self, user: &LoggedUser, id: String, conf: UserConfiguration) -> Result<()> {
        if user.has_admin_edit_rights() {
            new_runtime()?.block_on(self.engine.create_user(id, conf))
        } else {
            Err(Error::Unauthorized())
        }
    }

    pub fn update_user(
        self,
        user: LoggedUser,
        id: String,
        conf: UserUpdateConfiguration,
    ) -> Result<()> {
        if user.has_admin_edit_rights() {
            new_runtime()?.block_on(self.engine.update_user(id, conf))
        } else {
            Err(Error::Unauthorized())
        }
    }

    pub fn delete_user(self, user: &LoggedUser, id: String) -> Result<()> {
        if user.has_admin_edit_rights() {
            new_runtime()?.block_on(self.engine.delete_user(id))
        } else {
            Err(Error::Unauthorized())
        }
    }

    // Sessions

    pub fn get_session(&self, user: &LoggedUser, id: &str) -> Result<Option<Session>> {
        if !user.has_admin_read_rights() {
            return Err(Error::Unauthorized());
        }

        new_runtime()?.block_on(self.engine.get_session(&session_id(id)))
    }

    pub fn list_sessions(&self, user: &LoggedUser) -> Result<BTreeMap<String, Session>> {
        if user.has_admin_read_rights() {
            new_runtime()?.block_on(self.engine.list_sessions())
        } else {
            Err(Error::Unauthorized())
        }
    }

    pub fn create_session(
        &self,
        user: &LoggedUser,
        id: &str,
        conf: SessionConfiguration,
    ) -> Result<()> {
        if !user.has_admin_edit_rights() {
            return Err(Error::Unauthorized());
        }

        if conf.duration.is_some() {
            // Duration can only customized by users with proper rights
            if !user.can_customize_duration() {
                return Err(Error::Unauthorized());
            }
        }
        if conf.pool_affinity.is_some() {
            // Duration can only customized by users with proper rights
            if !user.can_customize_pool_affinity() {
                return Err(Error::Unauthorized());
            }
        }

        let session_id = session_id(id);
        if self.get_session(user, &session_id)?.is_some() {
            return Err(Error::Unauthorized());
        }

        let template = conf.clone().template;
        let result = new_runtime()?.block_on(self.engine.create_session(user, &session_id, conf));

        info!("Created session {} with template {}", session_id, template);

        match &result {
            Ok(_session) => {
                if let Ok(mut sessions) = self.sessions.lock() {
                    sessions.insert(session_id);
                } else {
                    error!("Failed to acquire sessions lock");
                }
                self.metrics.inc_deploy_counter(&template);
            }
            Err(e) => {
                self.metrics.inc_deploy_failures_counter(&template);
                error!("Error during deployment {}", e);
            }
        }
        result
    }

    pub fn update_session(
        &self,
        id: &str,
        user: &LoggedUser,
        conf: SessionUpdateConfiguration,
    ) -> Result<()> {
        if !user.has_admin_edit_rights() {
            return Err(Error::Unauthorized());
        }

        if conf.duration.is_some() {
            // Duration can only customized by users with proper rights
            if !user.can_customize_duration() {
                return Err(Error::Unauthorized());
            }
        }
        new_runtime()?.block_on(self.engine.update_session(&session_id(id), conf))
    }

    pub fn delete_session(&self, user: &LoggedUser, id: &str) -> Result<()> {
        if !user.has_admin_edit_rights() {
            return Err(Error::Unauthorized());
        }

        let session_id = session_id(id);
        let result = new_runtime()?.block_on(self.engine.delete_session(&session_id));
        match &result {
            Ok(_) => {
                self.metrics.inc_undeploy_counter();
                if let Ok(mut sessions) = self.sessions.lock() {
                    sessions.remove(session_id.as_str());
                } else {
                    error!("Failed to acquire sessions lock");
                }
            }
            Err(e) => {
                self.metrics.inc_undeploy_failures_counter();
                error!("Error during undeployment {}", e);
            }
        }
        result
    }

    // Pools

    pub fn get_pool(&self, user: &LoggedUser, pool_id: &str) -> Result<Option<Pool>> {
        if !user.has_admin_read_rights() {
            return Err(Error::Unauthorized());
        }

        new_runtime()?.block_on(self.engine.get_pool(&pool_id))
    }

    pub fn list_pools(&self, user: &LoggedUser) -> Result<BTreeMap<String, Pool>> {
        if !user.has_admin_read_rights() {
            return Err(Error::Unauthorized());
        }

        new_runtime()?.block_on(self.clone().engine.list_pools())
    }
}
