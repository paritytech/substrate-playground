use crate::{
    error::{Error, Result},
    kubernetes::Engine,
    metrics::Metrics,
    types::{
        Configuration, Environment, LoggedUser, Pool, User, UserConfiguration,
        UserUpdateConfiguration, Workspace, WorkspaceConfiguration, WorkspaceState,
        WorkspaceUpdateConfiguration,
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

#[derive(Clone)]
pub struct Manager {
    pub engine: Engine,
    pub metrics: Metrics,
    workspaces: Arc<Mutex<HashSet<String>>>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Playground {
    pub env: Environment,
    pub configuration: Configuration,
    pub user: Option<LoggedUser>,
}

impl Manager {
    const SLEEP_TIME: Duration = Duration::from_secs(60);

    pub async fn new() -> Result<Self> {
        let metrics = Metrics::new().map_err(|err| Error::Failure(err.into()))?;
        let engine = Engine::new().await?;
        // Go through all existing workspaces and update the ingress
        match engine.clone().list_workspaces().await {
            Ok(workspaces) => {
                let running = workspaces
                    .iter()
                    .flat_map(|i| match &i.1.state {
                        WorkspaceState::Running { .. } => {
                            Some((i.0.clone(), &i.1.repository_version.runtime))
                        }
                        _ => None,
                    })
                    .collect();
                engine.clone().patch_ingress(&running).await?;

                if running.is_empty() {
                    info!("No sesssions restored");
                } else {
                    info!("Restored sesssions for {:?}", running.keys());
                }
            }
            Err(err) => error!(
                "Failed to call list_all: {}. Existing workspaces won't be accessible",
                err
            ),
        }
        Ok(Manager {
            engine,
            metrics,
            workspaces: Arc::new(Mutex::new(HashSet::new())), // Temp map used to track workspaces deployment time
        })
    }

    pub fn spawn_background_thread(self) -> JoinHandle<()> {
        thread::spawn(move || loop {
            thread::sleep(Manager::SLEEP_TIME);

            // Track some deployments metrics
            if let Ok(runtime) = new_runtime() {
                let workspaces_thread = self.clone().workspaces.clone();
                if let Ok(mut workspaces2) = workspaces_thread.lock() {
                    let workspaces3 = &mut workspaces2.clone();
                    for id in workspaces3.iter() {
                        match runtime.block_on(self.engine.get_workspace(&workspace_id(id))) {
                            Ok(Some(workspace)) => {
                                // Deployed workspaces are removed from the set
                                // Additionally the deployment time is tracked
                                match workspace.state {
                                    WorkspaceState::Running { start_time, .. } => {
                                        workspaces2.remove(&workspace.user_id);
                                        if let Some(duration) = start_time.elapsed().ok() {
                                            self.clone()
                                                .metrics
                                                .observe_deploy_duration(duration.as_secs_f64());
                                        } else {
                                            error!("Failed to compute this workspace lifetime");
                                        }
                                    }
                                    WorkspaceState::Failed { .. } => {
                                        workspaces2.remove(&workspace.user_id);
                                    }
                                    _ => {}
                                }
                            }
                            Err(err) => {
                                warn!("Failed to call get: {}", err);
                                workspaces2.remove(id);
                            }
                            Ok(None) => warn!("No matching pod: {}", id),
                        }
                    }
                } else {
                    error!("Failed to acquire workspaces lock");
                }

                // Go through all Running pods and figure out if they have to be undeployed
                match runtime.block_on(self.engine.list_workspaces()) {
                    Ok(workspaces) => {
                        for workspace in workspaces.values() {
                            match workspace.state {
                                WorkspaceState::Running { start_time, .. } => {
                                    if let Some(duration) = &start_time.elapsed().ok() {
                                        if duration > &workspace.max_duration {
                                            info!(
                                                "Undeploying {} after {}",
                                                workspace.user_id,
                                                duration.as_secs() / 60
                                            );

                                            match runtime.block_on(self.engine.delete_workspace(
                                                &workspace_id(&workspace.user_id),
                                            )) {
                                                Ok(()) => (),
                                                Err(err) => {
                                                    warn!(
                                                        "Error while undeploying {}: {}",
                                                        workspace.user_id, err
                                                    )
                                                }
                                            }
                                        }
                                    } else {
                                        error!("Failed to compute this workspace lifetime");
                                    }
                                }
                                _ => {}
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

fn workspace_id(id: &str) -> String {
    // Create a unique ID for this workspace. Use lowercase to make sure the result can be used as part of a DNS
    id.to_string().to_lowercase()
}

impl Manager {
    pub fn get(self, user: LoggedUser) -> Result<Playground> {
        Ok(Playground {
            user: Some(user),
            env: self.engine.env,
            configuration: self.engine.configuration,
        })
    }

    pub fn get_unlogged(&self) -> Result<Playground> {
        Ok(Playground {
            user: None,
            env: self.clone().engine.env,
            configuration: self.clone().engine.configuration,
        })
    }

    // Users

    pub fn get_user(&self, user: &LoggedUser, id: &str) -> Result<Option<User>> {
        if user.id != id && !user.has_admin_read_rights() {
            return Err(Error::Unauthorized());
        }

        new_runtime()?.block_on(self.engine.get_user(&id))
    }

    pub fn list_users(&self, user: &LoggedUser) -> Result<BTreeMap<String, User>> {
        if !user.has_admin_read_rights() {
            return Err(Error::Unauthorized());
        }

        new_runtime()?.block_on(self.engine.list_users())
    }

    pub fn create_user(self, user: &LoggedUser, id: String, conf: UserConfiguration) -> Result<()> {
        if !user.has_admin_edit_rights() {
            return Err(Error::Unauthorized());
        }

        new_runtime()?.block_on(self.engine.create_user(id, conf))
    }

    pub fn update_user(
        self,
        user: LoggedUser,
        id: String,
        conf: UserUpdateConfiguration,
    ) -> Result<()> {
        if user.id != id && !user.has_admin_edit_rights() {
            return Err(Error::Unauthorized());
        }

        new_runtime()?.block_on(self.engine.update_user(id, conf))
    }

    pub fn delete_user(self, user: &LoggedUser, id: String) -> Result<()> {
        if user.id != id && !user.has_admin_edit_rights() {
            return Err(Error::Unauthorized());
        }

        new_runtime()?.block_on(self.engine.delete_user(id))
    }

    // Workspaces

    pub fn get_workspace(&self, user: &LoggedUser, id: &str) -> Result<Option<Workspace>> {
        if user.id != id && !user.has_admin_read_rights() {
            return Err(Error::Unauthorized());
        }

        new_runtime()?.block_on(self.engine.get_workspace(&workspace_id(id)))
    }

    pub fn list_workspaces(&self, user: &LoggedUser) -> Result<BTreeMap<String, Workspace>> {
        if !user.has_admin_read_rights() {
            return Err(Error::Unauthorized());
        }

        new_runtime()?.block_on(self.engine.list_workspaces())
    }

    pub fn create_workspace(
        &self,
        user: &LoggedUser,
        id: &str,
        conf: WorkspaceConfiguration,
    ) -> Result<()> {
        if user.id != id && !user.has_admin_edit_rights() {
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

        let workspace_id = workspace_id(id);
        if self.get_workspace(user, &workspace_id)?.is_some() {
            return Err(Error::Unauthorized());
        }

        let result =
            new_runtime()?.block_on(self.engine.create_workspace(user, &workspace_id, conf));
        match &result {
            Ok(()) => {
                info!("Created workspace {}", workspace_id);

                if let Ok(mut workspaces) = self.workspaces.lock() {
                    workspaces.insert(workspace_id);
                } else {
                    error!("Failed to acquire workspaces lock");
                }
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
            if id != user.id && !user.can_customize_duration() {
                return Err(Error::Unauthorized());
            }
        }

        new_runtime()?.block_on(self.engine.update_workspace(&workspace_id(id), conf))
    }

    pub fn delete_workspace(&self, user: &LoggedUser, id: &str) -> Result<()> {
        if user.id != id && !user.has_admin_edit_rights() {
            return Err(Error::Unauthorized());
        }

        let workspace_id = workspace_id(id);
        let result = new_runtime()?.block_on(self.engine.delete_workspace(&workspace_id));
        match &result {
            Ok(_) => {
                self.metrics.inc_undeploy_counter();
                if let Ok(mut workspaces) = self.workspaces.lock() {
                    workspaces.remove(workspace_id.as_str());
                } else {
                    error!("Failed to acquire workspaces lock");
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
