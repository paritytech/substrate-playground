/// Abstracts k8s interaction by handling permissions, logging, etc..
///
use crate::{
    error::{Error, Parameter, Permission, ResourceType, Result},
    kubernetes::{
        get_configuration,
        pool::{get_pool, list_pools},
        repository::{
            create_repository, create_repository_version, delete_repository,
            delete_repository_version, get_repository, get_repository_version, list_repositories,
            list_repository_versions, update_repository,
        },
        session::{
            create_session, create_session_execution, delete_session, get_session, list_sessions,
            patch_ingress, update_session,
        },
        template::list_templates,
        user::{create_user, delete_user, get_user, list_users, update_user},
    },
    metrics::Metrics,
    types::{
        LoggedUser, Playground, Pool, Repository, RepositoryConfiguration,
        RepositoryUpdateConfiguration, RepositoryVersion, RepositoryVersionConfiguration, Session,
        SessionConfiguration, SessionExecution, SessionExecutionConfiguration, SessionState,
        SessionUpdateConfiguration, Template, User, UserConfiguration, UserUpdateConfiguration,
    },
};
use log::{error, info, warn};
use std::{
    thread::{self, JoinHandle},
    time::Duration,
};
use tokio::runtime::Runtime;

#[derive(Clone)]
pub struct Manager {
    pub metrics: Metrics,
}

impl Manager {
    const SLEEP_TIME: Duration = Duration::from_secs(60);

    pub async fn new() -> Result<Self> {
        let metrics = Metrics::new().map_err(|err| Error::Failure(err.into()))?;
        // Go through all existing sessions and update the ingress
        // TODO remove once migrated to per session nginx
        match list_sessions().await {
            Ok(sessions) => {
                let running = sessions
                    .iter()
                    .flat_map(|i| match &i.state {
                        SessionState::Running { .. } => Some((i.id.clone(), vec![])),
                        _ => None,
                    })
                    .collect();
                if let Err(err) = patch_ingress(&running).await {
                    error!(
                        "Failed to patch ingress: {}. Existing sessions won't be accessible",
                        err
                    )
                } else if running.is_empty() {
                    info!("No sesssions restored");
                } else {
                    info!("Restored sesssions for {:?}", running.keys());
                }
            }
            Err(err) => error!(
                "Failed to list sessions: {}. Existing sessions won't be accessible",
                err
            ),
        }
        Ok(Manager { metrics })
    }

    pub fn spawn_session_reaper_thread(&self) -> Result<JoinHandle<()>> {
        let runtime = new_runtime()?;
        Ok(thread::spawn(move || loop {
            thread::sleep(Manager::SLEEP_TIME);

            // Go through all Running pods and figure out if they have to be undeployed
            if let Ok(sessions) = runtime.block_on(list_sessions()) {
                for session in sessions {
                    if let SessionState::Running { start_time, .. } = session.state {
                        if let Ok(duration) = start_time.elapsed() {
                            if duration > session.max_duration {
                                info!(
                                    "Undeploying {} after {} mins (target {})",
                                    session.user_id,
                                    duration.as_secs() / 60,
                                    session.max_duration.as_secs() / 60
                                );

                                // Finally delete the session
                                if let Err(err) = runtime.block_on(delete_session(&session.id)) {
                                    warn!("Error while undeploying {}: {}", session.id, err)
                                }
                            }
                        }
                    }
                }
            } else {
                error!("Failed to call list_sessions")
            }
        }))
    }
}

fn new_runtime() -> Result<Runtime> {
    Runtime::new().map_err(|err| Error::Failure(err.into()))
}

impl Manager {
    pub fn get(self, user: LoggedUser) -> Result<Playground> {
        Ok(Playground {
            user: Some(user),
            configuration: new_runtime()?.block_on(get_configuration())?,
        })
    }

    pub fn get_unlogged(&self) -> Result<Playground> {
        Ok(Playground {
            user: None,
            configuration: new_runtime()?.block_on(get_configuration())?,
        })
    }

    // Users

    pub fn get_user(&self, user: &LoggedUser, id: &str) -> Result<Option<User>> {
        if user.id != id && !user.has_admin_read_rights() {
            return Err(Error::Unauthorized(Permission::AdminRead));
        }

        new_runtime()?.block_on(get_user(id))
    }

    pub fn list_users(&self, user: &LoggedUser) -> Result<Vec<User>> {
        if !user.has_admin_read_rights() {
            return Err(Error::Unauthorized(Permission::AdminRead));
        }

        new_runtime()?.block_on(list_users())
    }

    pub fn create_user(self, user: &LoggedUser, id: String, conf: UserConfiguration) -> Result<()> {
        if !user.has_admin_edit_rights() {
            return Err(Error::Unauthorized(Permission::AdminEdit));
        }

        new_runtime()?.block_on(create_user(&id, conf))
    }

    pub fn update_user(
        self,
        user: LoggedUser,
        id: String,
        conf: UserUpdateConfiguration,
    ) -> Result<()> {
        if user.id != id && !user.has_admin_edit_rights() {
            return Err(Error::Unauthorized(Permission::AdminEdit));
        }

        new_runtime()?.block_on(update_user(&id, conf))
    }

    pub fn delete_user(self, user: &LoggedUser, id: String) -> Result<()> {
        if user.id != id && !user.has_admin_edit_rights() {
            return Err(Error::Unauthorized(Permission::AdminEdit));
        }

        new_runtime()?.block_on(delete_user(&id))
    }

    //Repositories

    pub fn get_repository(&self, id: &str) -> Result<Option<Repository>> {
        new_runtime()?.block_on(get_repository(id))
    }

    pub fn list_repositories(&self) -> Result<Vec<Repository>> {
        new_runtime()?.block_on(list_repositories())
    }

    pub fn create_repository(
        &self,
        user: &LoggedUser,
        id: &str,
        conf: RepositoryConfiguration,
    ) -> Result<()> {
        if !user.has_admin_edit_rights() {
            return Err(Error::Unauthorized(Permission::AdminEdit));
        }

        new_runtime()?.block_on(create_repository(id, conf))
    }

    pub fn update_repository(
        &self,
        id: &str,
        user: &LoggedUser,
        conf: RepositoryUpdateConfiguration,
    ) -> Result<()> {
        if !user.has_admin_edit_rights() {
            return Err(Error::Unauthorized(Permission::AdminEdit));
        }

        new_runtime()?.block_on(update_repository(id, conf))
    }

    pub fn delete_repository(&self, user: &LoggedUser, id: &str) -> Result<()> {
        if !user.has_admin_edit_rights() {
            return Err(Error::Unauthorized(Permission::AdminEdit));
        }

        new_runtime()?.block_on(delete_repository(id))
    }

    //Repository versions

    pub fn get_repository_version(
        &self,
        _user: &LoggedUser,
        repository_id: &str,
        id: &str,
    ) -> Result<Option<RepositoryVersion>> {
        new_runtime()?.block_on(get_repository_version(repository_id, id))
    }

    pub fn list_repository_versions(
        &self,
        _user: &LoggedUser,
        repository_id: &str,
    ) -> Result<Vec<RepositoryVersion>> {
        new_runtime()?.block_on(list_repository_versions(repository_id))
    }

    pub fn create_repository_version(
        &self,
        user: &LoggedUser,
        repository_id: &str,
        id: &str,
        conf: RepositoryVersionConfiguration,
    ) -> Result<()> {
        if !user.has_admin_edit_rights() {
            return Err(Error::Unauthorized(Permission::AdminEdit));
        }

        new_runtime()?.block_on(create_repository_version(repository_id, id, conf))
    }

    pub fn delete_repository_version(
        &self,
        user: &LoggedUser,
        repository_id: &str,
        id: &str,
    ) -> Result<()> {
        if !user.has_admin_edit_rights() {
            return Err(Error::Unauthorized(Permission::AdminEdit));
        }

        new_runtime()?.block_on(delete_repository_version(repository_id, id))
    }

    // Pools

    pub fn get_pool(&self, user: &LoggedUser, pool_id: &str) -> Result<Option<Pool>> {
        if !user.has_admin_read_rights() {
            return Err(Error::Unauthorized(Permission::AdminRead));
        }

        new_runtime()?.block_on(get_pool(pool_id))
    }

    pub fn list_pools(&self, user: &LoggedUser) -> Result<Vec<Pool>> {
        if !user.has_admin_read_rights() {
            return Err(Error::Unauthorized(Permission::AdminRead));
        }

        new_runtime()?.block_on(list_pools())
    }

    // Sessions

    fn ensure_session_ownership(&self, user_id: &str, session_id: &str) -> Result<Session> {
        if let Some(session) = new_runtime()?.block_on(get_session(session_id))? {
            if user_id != session.user_id {
                return Err(Error::Unauthorized(Permission::ResourceNotOwned));
            }
            Ok(session)
        } else {
            Err(Error::UnknownResource(
                ResourceType::Session,
                session_id.to_string(),
            ))
        }
    }

    pub fn get_session(&self, user: &LoggedUser, id: &str) -> Result<Option<Session>> {
        match self.ensure_session_ownership(&user.id, id) {
            Err(Error::Failure(from)) => Err(Error::Failure(from)),
            Err(_) => Ok(None),
            Ok(session) => Ok(Some(session)),
        }
    }

    pub fn list_sessions(&self, user: &LoggedUser) -> Result<Vec<Session>> {
        if !user.has_admin_read_rights() {
            return Err(Error::Unauthorized(Permission::AdminRead));
        }

        new_runtime()?.block_on(list_sessions())
    }

    pub fn create_session(
        &self,
        user: &LoggedUser,
        id: &str,
        session_configuration: SessionConfiguration,
    ) -> Result<()> {
        // Non admin can only create session whose id matches their name
        if !user.has_admin_edit_rights() && user.id.to_ascii_lowercase() != id {
            return Err(Error::Unauthorized(Permission::InvalidSessionId));
        }

        if session_configuration.duration.is_some() {
            // Duration can only customized by users with proper rights
            if !user.can_customize_duration() {
                return Err(Error::Unauthorized(Permission::Customize {
                    what: Parameter::SessionDuration,
                }));
            }
        }
        if session_configuration.pool_affinity.is_some() {
            // Pool affinity can only customized by users with proper rights
            if !user.can_customize_pool_affinity() {
                return Err(Error::Unauthorized(Permission::Customize {
                    what: Parameter::SessionPoolAffinity,
                }));
            }
        }

        // Check that the session doesn't already exists
        if self.get_session(user, id)?.is_some() {
            return Err(Error::SessionIdAlreayUsed);
        }

        let template = session_configuration.clone().template;
        let configuration = new_runtime()?.block_on(get_configuration())?;
        let result = new_runtime()?.block_on(create_session(
            user,
            id,
            configuration,
            session_configuration,
        ));

        info!("Created session {} with template {}", id, template);

        match &result {
            Ok(_session) => {
                self.metrics.inc_deploy_counter();
            }
            Err(e) => {
                self.metrics.inc_deploy_failures_counter();
                error!("Error during deployment {}", e);
            }
        }
        result
    }

    pub fn update_session(
        &self,
        id: &str,
        user: &LoggedUser,
        session_update_configuration: SessionUpdateConfiguration,
    ) -> Result<()> {
        self.ensure_session_ownership(&user.id, id)?;

        let configuration = new_runtime()?.block_on(get_configuration())?;
        new_runtime()?.block_on(update_session(
            id,
            configuration,
            session_update_configuration,
        ))
    }

    pub fn delete_session(&self, user: &LoggedUser, id: &str) -> Result<()> {
        self.ensure_session_ownership(&user.id, id)?;

        let result = new_runtime()?.block_on(delete_session(id));
        match &result {
            Ok(_) => {
                self.metrics.inc_undeploy_counter();
            }
            Err(e) => {
                self.metrics.inc_undeploy_failures_counter();
                error!("Error during undeployment {}", e);
            }
        }
        result
    }

    // Session executions

    pub fn create_session_execution(
        &self,
        user: &LoggedUser,
        session_id: &str,
        session_execution_configuration: SessionExecutionConfiguration,
    ) -> Result<SessionExecution> {
        self.ensure_session_ownership(&user.id, session_id)?;

        new_runtime()?.block_on(create_session_execution(
            session_id,
            session_execution_configuration,
        ))
    }

    // Templates

    pub fn list_templates(&self) -> Result<Vec<Template>> {
        new_runtime()?.block_on(list_templates())
    }
}
