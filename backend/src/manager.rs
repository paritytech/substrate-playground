use crate::kubernetes::{Engine, InstanceDetails};
use crate::metrics::Metrics;
use crate::template::Template;
use log::{error, warn};
use std::{
    collections::BTreeMap,
    error::Error,
    sync::{Arc, Mutex},
    thread::{self, JoinHandle},
    time::Duration,
};
use tokio::runtime::Runtime;

#[derive(Clone)]
pub struct Manager {
    engine: Engine,
    pub metrics: Metrics,
    instances: Arc<Mutex<BTreeMap<String, String>>>,
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
                let instances = all_instances
                    .iter()
                    .filter(|instance| instance.1.phase == "Running")
                    .collect::<BTreeMap<&String, &InstanceDetails>>();
                engine
                    .clone()
                    .patch_ingress(
                        instances
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
            let instances_thread = self.clone().instances.clone();
            if let Ok(mut instances2) = instances_thread.lock() {
                let instances3 = &mut instances2.clone();
                for (user_uuid, instance_uuid) in instances3 {
                    match self.clone().get(&user_uuid, &instance_uuid) {
                        Ok(details) => {
                            let phase = details.phase;
                            if phase != "Pending" && phase != "Unknown" {
                                instances2.remove(user_uuid);
                                if let Ok(duration) = details.started_at.elapsed() {
                                    self.clone().metrics.observe_deploy_duration(
                                        &instance_uuid,
                                        duration.as_secs_f64(),
                                    );
                                } else {
                                    error!("Failed to compute this instance lifetime");
                                }
                            }
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
                    let instances = all_instances
                        .iter()
                        .filter(|instance| instance.1.phase == "Running")
                        .collect::<BTreeMap<&String, &InstanceDetails>>();
                    for (_user_uuid, instance) in instances {
                        let uuid = &instance.instance_uuid;
                        if let Ok(duration) = instance.started_at.elapsed() {
                            if duration > Manager::THREE_HOURS {
                                match self.clone().undeploy(&uuid) {
                                    Ok(()) => (),
                                    Err(err) => warn!("Error while undeploying {}: {}", uuid, err),
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
    pub fn get(self, _user_uuid: &str, instance_uuid: &str) -> Result<InstanceDetails, String> {
        new_runtime()?.block_on(self.engine.get(&instance_uuid))
    }

    pub fn get_templates(self) -> Result<BTreeMap<String, Template>, String> {
        new_runtime()?.block_on(self.engine.get_templates())
    }

    pub fn list(&self, user_uuid: &str) -> Result<Vec<String>, String> {
        new_runtime()?.block_on(self.clone().engine.list(&user_uuid))
    }

    pub fn list_all(&self) -> Result<BTreeMap<String, InstanceDetails>, String> {
        new_runtime()?.block_on(self.clone().engine.list_all())
    }

    pub fn deploy(self, user_uuid: &str, template: &str) -> Result<String, String> {
        let result = new_runtime()?.block_on(self.engine.deploy(&user_uuid, &template));
        match result.clone() {
            Ok(instance_uuid) => {
                if let Ok(mut instances) = self.instances.lock() {
                    instances.insert(user_uuid.into(), instance_uuid.into());
                } else {
                    error!("Failed to acquire instances lock");
                }
                self.metrics.inc_deploy_counter(&user_uuid, &template);
            }
            Err(_) => self.metrics.inc_deploy_failures_counter(&template),
        }
        result
    }

    pub fn undeploy(self, instance_uuid: &str) -> Result<(), String> {
        let result = new_runtime()?.block_on(self.engine.undeploy(&instance_uuid));
        match result {
            Ok(_) => self.metrics.inc_undeploy_counter(&instance_uuid),
            Err(_) => self.metrics.inc_undeploy_failures_counter(&instance_uuid),
        }
        result
    }
}
