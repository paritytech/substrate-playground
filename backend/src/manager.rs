/// Abstratcs k8s interaction by handling permissions, logging, etc..
///
use crate::{
    error::{Error, Parameter, Permission, Result},
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
        LoggedUser, Phase, Playground, Pool, Repository, RepositoryConfiguration,
        RepositoryUpdateConfiguration, RepositoryVersion, RepositoryVersionConfiguration, Session,
        SessionConfiguration, SessionExecution, SessionExecutionConfiguration,
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

// TODO remove, let client handle
fn session_id(id: &str) -> String {
    // Create a unique ID for this session. Use lowercase to make sure the result can be used as part of a DNS
    id.to_string().to_lowercase()
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
                    .flat_map(|i| match &i.pod.phase {
                        Phase::Running { .. } => Some((i.id.clone(), vec![])),
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

    pub fn spawn_background_thread(self) -> JoinHandle<()> {
        thread::spawn(move || loop {
            thread::sleep(Manager::SLEEP_TIME);

            // Track some deployments metrics
            if let Ok(runtime) = new_runtime() {
                // Go through all Running pods and figure out if they have to be undeployed
                match runtime.block_on(list_sessions()) {
                    Ok(sessions) => {
                        for session in sessions {
                            if let Phase::Running = session.pod.phase {
                                if let Some(duration) =
                                    &session.pod.start_time.unwrap().elapsed().ok()
                                {
                                    if duration > &session.duration {
                                        info!(
                                            "Undeploying {} after {}",
                                            session.user_id,
                                            duration.as_secs() / 60
                                        );

                                        match runtime
                                            .block_on(delete_session(&session_id(&session.user_id)))
                                        {
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
                    }
                    Err(err) => error!("Failed to call list_sessions: {}", err),
                }
            }
        })
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

    // Workspaces

    /*     pub fn get_workspace(&self, user: &LoggedUser, id: &str) -> Result<Option<Workspace>> {
            if workspace_id(&user.id) != id && !user.has_admin_read_rights() {
                return Err(Error::Unauthorized(Permission::AdminRead));
            }

            new_runtime()?.block_on(self.engine.get_workspace(&workspace_id(id)))
        }

        pub fn list_workspaces(&self, user: &LoggedUser) -> Result<Vec<Workspace>> {
            if !user.has_admin_read_rights() {
                return Err(Error::Unauthorized(Permission::AdminRead));
            }

            new_runtime()?.block_on(self.engine.list_workspaces())
        }

        pub fn create_workspace(
            &self,
            user: &LoggedUser,
            id: &str,
            conf: WorkspaceConfiguration,
        ) -> Result<()> {
            // Id can only be customized by users with proper rights
            if workspace_id(&user.id) != id && !user.has_admin_edit_rights() {
                return Err(Error::Unauthorized(Permission::AdminEdit));
            }

            if conf.duration.is_some() {
                // Duration can only customized by users with proper rights
                if !user.can_customize_duration() {
                    return Err(Error::Unauthorized(Permission::Customize {
                        what: Parameter::WorkflowDuration,
                    }));
                }
            }
            if conf.pool_affinity.is_some() {
                // Duration can only customized by users with proper rights
                if !user.can_customize_pool_affinity() {
                    return Err(Error::Unauthorized(Permission::Customize {
                        what: Parameter::WorkflowPoolAffinity,
                    }));
                }
            }

            let workspace_id = workspace_id(id);
            // Ensure a workspace with the same id is not alread running
            if new_runtime()?
                .block_on(self.engine.get_workspace(&workspace_id))?
                .is_some()
            {
                return Err(Error::WorkspaceIdAlreayUsed);
            }

            let result =
                new_runtime()?.block_on(self.engine.create_workspace(user, &workspace_id, conf));
            match &result {
                Ok(()) => {
                    info!("Created workspace {}", workspace_id);

                    self.metrics.inc_deploy_counter();
                }
                Err(e) => {
                    self.metrics.inc_deploy_failures_counter();
                    error!("Error during deployment {}", e);
                }
            }
            result
        }

        pub fn update_workspace(
            &self,
            id: &str,
            user: &LoggedUser,
            conf: WorkspaceUpdateConfiguration,
        ) -> Result<()> {
            if conf.duration.is_some() {
                // Duration can only customized by users with proper rights
                if workspace_id(&user.id) != id && !user.can_customize_duration() {
                    return Err(Error::Unauthorized(Permission::Customize {
                        what: Parameter::WorkflowDuration,
                    }));
                }
            }

            new_runtime()?.block_on(self.engine.update_workspace(&workspace_id(id), conf))
        }

        pub fn delete_workspace(&self, user: &LoggedUser, id: &str) -> Result<()> {
            if workspace_id(&user.id) != id && !user.has_admin_edit_rights() {
                return Err(Error::Unauthorized(Permission::AdminEdit));
            }

            let workspace_id = workspace_id(id);
            let result = new_runtime()?.block_on(self.engine.delete_workspace(&workspace_id));
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
    */
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

    pub fn get_session(&self, user: &LoggedUser, id: &str) -> Result<Option<Session>> {
        if user.id != id && !user.has_admin_read_rights() {
            return Err(Error::Unauthorized(Permission::AdminRead));
        }

        new_runtime()?.block_on(get_session(&session_id(id)))
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
        // TODO fail if id is incorrect
        if user.id != id && !user.has_admin_edit_rights() {
            return Err(Error::Unauthorized(Permission::AdminEdit));
        }

        if session_configuration.duration.is_some() {
            // Duration can only customized by users with proper rights
            if !user.can_customize_duration() {
                return Err(Error::Unauthorized(Permission::Customize {
                    what: Parameter::WorkflowDuration,
                }));
            }
        }
        if session_configuration.pool_affinity.is_some() {
            // Duration can only customized by users with proper rights
            if !user.can_customize_pool_affinity() {
                return Err(Error::Unauthorized(Permission::Customize {
                    what: Parameter::WorkflowPoolAffinity,
                }));
            }
        }

        let session_id = session_id(id);
        if self.get_session(user, &session_id)?.is_some() {
            return Err(Error::Unauthorized(Permission::AdminEdit));
        }

        let template = session_configuration.clone().template;
        let configuration = new_runtime()?.block_on(get_configuration())?;
        let result = new_runtime()?.block_on(create_session(
            user,
            &session_id,
            configuration,
            session_configuration,
        ));

        info!("Created session {} with template {}", session_id, template);

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
        if session_update_configuration.duration.is_some() {
            // Duration can only customized by users with proper rights
            if id != user.id && !user.can_customize_duration() {
                return Err(Error::Unauthorized(Permission::AdminEdit));
            }
        }

        let configuration = new_runtime()?.block_on(get_configuration())?;
        new_runtime()?.block_on(update_session(
            &session_id(id),
            configuration,
            session_update_configuration,
        ))
    }

    pub fn delete_session(&self, user: &LoggedUser, id: &str) -> Result<()> {
        if user.id != id && !user.has_admin_edit_rights() {
            return Err(Error::Unauthorized(Permission::AdminEdit));
        }

        let session_id = session_id(id);
        let result = new_runtime()?.block_on(delete_session(&session_id));
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
        if let Some(session) = self.get_session(user, session_id)? {
            if user.id != session.user_id {
                return Err(Error::Unauthorized(Permission::ResourceNotOwned));
            }
        } else {
            return Err(Error::UnknownResource);
        }

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
