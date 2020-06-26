use crate::api::User;
use crate::kubernetes::{Engine, InstanceDetails, PodDetails};
use crate::metrics::Metrics;
use crate::template::Template;
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
    engine: Engine,
    pub metrics: Metrics,
    instances: Arc<Mutex<BTreeMap<String, String>>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PlaygroundDetails {
    pub pod: PodDetails,
    pub templates: BTreeMap<String, Template>,
    pub instances: Vec<InstanceDetails>,
    pub user: User,
}

impl Manager {
    const FIVE_SECONDS: Duration = Duration::from_secs(5);
    const THREE_HOURS: Duration = Duration::from_secs(60 * 60 * 3);

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
                            .map(|i| (i.1.instance_uuid.clone(), &i.1.template))
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
                for (id, instance_uuid) in instances3 {
                    match self.clone().get_instance(&id, &instance_uuid) {
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
                                        self.clone().metrics.observe_deploy_duration(
                                            &instance_uuid,
                                            duration.as_secs_f64(),
                                        );
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
                    for (user_id, instance) in running_instances(all_instances) {
                        let instance_uuid = &instance.instance_uuid;
                        if let Some(duration) = elapsed(&instance.pod) {
                            if duration > Manager::THREE_HOURS {
                                match self.clone().undeploy(&user_id, &instance_uuid) {
                                    Ok(()) => (),
                                    Err(err) => {
                                        warn!("Error while undeploying {}: {}", instance_uuid, err)
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
    pub fn get(self) -> Result<String, String> {
        Ok("".to_string())
    }

    pub fn get_logged(self, user: User) -> Result<PlaygroundDetails, String> {
        let pod = new_runtime()?.block_on(self.clone().engine.get())?;
        let templates = new_runtime()?.block_on(self.clone().engine.get_templates())?;
        let instances = new_runtime()?.block_on(self.engine.list(user.username.as_str()))?;
        Ok(PlaygroundDetails {
            pod,
            templates,
            instances,
            user,
        })
    }

    pub fn get_instance(
        self,
        _user_uuid: &str,
        instance_uuid: &str,
    ) -> Result<InstanceDetails, String> {
        new_runtime()?.block_on(self.engine.get_instance(&instance_uuid))
    }

    pub fn list_all(&self) -> Result<BTreeMap<String, InstanceDetails>, String> {
        new_runtime()?.block_on(self.clone().engine.list_all())
    }

    pub fn deploy(self, id: &str, template: &str) -> Result<String, String> {
        let result = new_runtime()?.block_on(self.engine.deploy(&id, &template));
        match result.clone() {
            Ok(instance_uuid) => {
                if let Ok(mut instances) = self.instances.lock() {
                    instances.insert(id.into(), instance_uuid);
                } else {
                    error!("Failed to acquire instances lock");
                }
                self.metrics.inc_deploy_counter(&id, &template);
            }
            Err(_) => self.metrics.inc_deploy_failures_counter(&template),
        }
        result
    }

    pub fn undeploy(self, _user_id: &str, instance_uuid: &str) -> Result<(), String> {
        let result = new_runtime()?.block_on(self.engine.undeploy(&instance_uuid));
        match result {
            Ok(_) => self.metrics.inc_undeploy_counter(&instance_uuid),
            Err(_) => self.metrics.inc_undeploy_failures_counter(&instance_uuid),
        }
        result
    }
}
