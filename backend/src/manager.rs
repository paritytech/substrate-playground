use crate::kubernetes::{Engine, InstanceDetails};
use crate::metrics::Metrics;
use log::{info, warn};
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
}

impl Manager {

    const THREE_HOURS: Duration = Duration::from_secs(60 * 60 * 3);

    pub async fn new() -> Result<Self, Box<dyn Error>> {
        let metrics = Metrics::new()?;
        let engine = Engine::new().await?;
        let manager = Manager {
            engine,
            metrics: metrics,
        };
        Ok(manager)
    }

    pub fn spawn_reaper(self) -> JoinHandle<()> {
        thread::spawn(move || {
            loop {
                thread::sleep(Duration::from_secs(5));

                let instances = self.clone().list_all().unwrap();
                info!("Map: {:?}", instances);
                for (_user_uuid, instance) in instances {
                    info!("Undeploying {}", instance.instance_uuid);
                    
                    if let Ok(duration) = instance.started_at.elapsed() {
                        if duration > Manager::THREE_HOURS {
                            match self.clone().undeploy(&instance.instance_uuid) {
                                Ok(()) => info!("Removed: {}", instance.instance_uuid),
                                Err(_) => info!("Failed to remove: {}", instance.instance_uuid),
                            }
                        }
                    }
                }
            }
        })
    }
}

fn new_runtime() -> Result<Runtime, String> {
    Runtime::new().map_err(|err| "".to_string())
}

impl Manager {

    pub fn get(self, user_uuid: &str, instance_uuid: &str) -> Result<InstanceDetails, String> {
        new_runtime()?.block_on(self.engine.get(&instance_uuid))
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
                self.metrics.inc_deploy_counter(&user_uuid, &template);
            }
            Err(_) => {
                self.metrics.inc_deploy_failures_counter(&template);
            }
        }
        result
    }

    pub fn undeploy(self, instance_uuid: &str) -> Result<(), String> {
        let result = new_runtime()?.block_on(self.engine.undeploy(&instance_uuid));
        match result {
            Ok(_) => {
                self.metrics.inc_undeploy_counter(&instance_uuid);
            }
            Err(_) => {
                self.metrics.inc_undeploy_failures_counter(&instance_uuid);
            }
        }
        result
    }
}
