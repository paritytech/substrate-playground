use crate::kubernetes::{Engine, InstanceDetails, PodDetails};
use crate::metrics::Metrics;
use crate::template::Template;
use crate::user::{Admin, User, UserConfiguration};
use log::{error, warn};
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

fn running_instances(
    instances: BTreeMap<String, InstanceDetails>,
) -> BTreeMap<String, InstanceDetails> {
    instances
        .into_iter()
        .filter(|instance| is_running(&instance.1.pod))
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
    pub pod: PodDetails,
    pub templates: BTreeMap<String, Template>,
    pub users: Option<BTreeMap<String, UserConfiguration>>,
    pub instance: Option<InstanceDetails>,
    pub all_instances: Option<BTreeMap<String, InstanceDetails>>,
    pub user: Option<PlaygroundUser>,
}

impl Manager {
    const FIVE_SECONDS: Duration = Duration::from_secs(5);

    pub async fn new() -> Result<Self, Box<dyn Error>> {
        let metrics = Metrics::new()?;
        let engine = Engine::new().await?;
        // Go through all existing instances and update the ingress
        match engine.clone().list_all().await {
            Ok(all_instances) => {
                engine
                    .clone()
                    .patch_ingress(
                        running_instances(all_instances)
                            .iter()
                            .map(|i| (i.1.user_uuid.clone(), &i.1.template))
                            .collect(),
                    )
                    .await?;
            }
            Err(err) => error!(
                "Failed to call list_all: {}. Existing instances won't be accessible",
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
            // TODO can't this be merged with the reaping logic bellow?
            let instances_thread = self.clone().instances.clone();
            if let Ok(mut instances2) = instances_thread.lock() {
                let instances3 = &mut instances2.clone();
                for id in instances3 {
                    match self.clone().get_instance(&id.0) {
                        Ok(details) => {
                            let phase =
                                phase(&details.pod).unwrap_or_else(|| "Unknown".to_string());
                            // Deployed instances are removed from the set
                            // Additionally the deployment time is tracked
                            match phase.as_str() {
                                "Running" | "Failed" => {
                                    instances2.remove(&details.user_uuid);
                                    // TODO track success / failure
                                    if let Some(duration) = elapsed(&details.pod) {
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
            match self.clone().list_all() {
                Ok(all_instances) => {
                    for (username, instance) in running_instances(all_instances) {
                        if let Some(duration) = elapsed(&instance.pod) {
                            if duration > instance.session_duration {
                                match self.clone().undeploy(&username) {
                                    Ok(()) => (),
                                    Err(err) => {
                                        warn!("Error while undeploying {}: {}", username, err)
                                    }
                                }
                            }
                        } else {
                            error!("Failed to compute this instance lifetime");
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
    pub fn get(self, user: User) -> Result<PlaygroundDetails, String> {
        let pod = new_runtime()?.block_on(self.clone().engine.get())?;
        let templates = new_runtime()?.block_on(self.clone().engine.get_templates())?;
        let users = new_runtime()?.block_on(self.clone().engine.list_users())?;
        Ok(PlaygroundDetails {
            pod,
            templates,
            users: Some(users),
            instance: new_runtime()?
                .block_on(self.engine.get_instance(user.id.as_str()))
                .ok(),
            all_instances: None,
            user: Some(PlaygroundUser{id: user.id, avatar: user.avatar, admin: false}),
        })
    }

    pub fn get_admin(self, admin: Admin) -> Result<PlaygroundDetails, String> {
        let pod = new_runtime()?.block_on(self.clone().engine.get())?;
        let templates = new_runtime()?.block_on(self.clone().engine.get_templates())?;
        let users = new_runtime()?.block_on(self.clone().engine.list_users())?;
        Ok(PlaygroundDetails {
            pod,
            templates,
            users: Some(users),
            instance: new_runtime()?
                .block_on(self.clone().engine.get_instance(admin.id.as_str()))
                .ok(),
            all_instances: Some(new_runtime()?.block_on(self.clone().engine.list_all())?),
            user: Some(PlaygroundUser{id: admin.id, avatar: admin.avatar, admin: true}),
        })
    }

    pub fn get_unlogged(self) -> Result<PlaygroundDetails, String> {
        let pod = new_runtime()?.block_on(self.clone().engine.get())?;
        let templates = new_runtime()?.block_on(self.engine.get_templates())?;
        Ok(PlaygroundDetails {
            pod,
            templates,
            users: None,
            instance: None,
            all_instances: None,
            user: None,
        })
    }

    // Users

    pub fn list_users(self) -> Result<BTreeMap<String, UserConfiguration>, String> {
        new_runtime()?.block_on(self.clone().engine.list_users())
    }

    pub fn create_or_update_user(self, id: String, user: UserConfiguration) -> Result<(), String> {
        new_runtime()?.block_on(self.clone().engine.create_or_update_user(id, user))
    }

    pub fn delete_user(self, id: String) -> Result<(), String> {
        new_runtime()?.block_on(self.clone().engine.delete_user(id))
    }

    pub fn get_instance(self, instance_uuid: &str) -> Result<InstanceDetails, String> {
        new_runtime()?.block_on(self.engine.get_instance(&instance_uuid))
    }

    pub fn list_all(&self) -> Result<BTreeMap<String, InstanceDetails>, String> {
        new_runtime()?.block_on(self.clone().engine.list_all())
    }

    pub fn deploy(self, username: &str, template: &str) -> Result<String, String> {
        let result = new_runtime()?.block_on(self.engine.deploy(&username, &template));
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

    pub fn undeploy(self, username: &str) -> Result<(), String> {
        let result = new_runtime()?.block_on(self.engine.undeploy(&username));
        match result {
            Ok(_) => self.metrics.inc_undeploy_counter(&username),
            Err(_) => self.metrics.inc_undeploy_failures_counter(&username),
        }
        result
    }
}
