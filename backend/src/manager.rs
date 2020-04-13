use crate::kubernetes::{Engine, InstanceDetails};
use crate::metrics::Metrics;
use log::{info, warn};
use std::{
    collections::HashMap,
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
    instances: Arc<Mutex<HashMap<String, String>>>,
}

impl Manager {

    pub async fn new() -> Result<Self, Box<dyn Error>> {
        let metrics =  Metrics::new()?;
        let manager = Manager {
            engine: Engine::new().await?,
            metrics: metrics,
            instances: Arc::new(Mutex::new(HashMap::new())),
        };
        Ok(manager)
    }

    pub fn spawn_reaper(self) -> JoinHandle<()> {
        let instances_thread = self.instances.clone();
        thread::spawn(move || {
            info!("New thread");
            loop {
                thread::sleep(Duration::from_secs(5));

                let instances2 = &mut *instances_thread.lock().unwrap();
                let instances3 = instances2.clone();
                info!("Loop! {}", instances2.len());
                let keys: Vec<&String> = instances3.iter().filter_map(|p| Some(p.0)).collect();
                info!("Keys: {:?}", keys);
                for key in keys {
                    let res = instances2.remove(key);
                    info!("Remove: {} {:?}", key, res);
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

    pub fn list(self, user_uuid: &str) -> Result<Vec<String>, String> {
        new_runtime()?.block_on(self.engine.list(&user_uuid))
    }

    pub fn list_all(self, user_uuid: &str, instance_uuid: &str) -> Result<Vec<String>, String> {
        new_runtime()?.block_on(self.engine.list_all())
    }

                /*let timer = state.timer.lock().unwrap();
                timer
                    .schedule_with_delay(delay, move || {
                        info!("#Deleting! {}", instance_uuid);
                        if let Err(s) = block_on(kubernetes::undeploy(&host, &instance_uuid)) {
                            warn!("Failed to undeploy {}: {}", instance_uuid, s);
                            metrics::inc_undeploy_failures_counter(&template, &user_uuid);
                        } else {
                            metrics::inc_undeploy_counter(&template, &user_uuid);
                        }
                    })
                    .ignore();*/

    pub fn deploy(self, user_uuid: &str, template: &str) -> Result<String, String> {
        let result = new_runtime()?.block_on(self.engine.deploy(&user_uuid, &template));
        match result.clone() {
            Ok(instance_uuid) => {
                self.instances.lock().unwrap().insert(instance_uuid.into(), template.into());
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
                self.instances.lock().unwrap().remove(&instance_uuid.to_string());
                self.metrics.inc_undeploy_counter(&instance_uuid);
            }
            Err(_) => {
                self.metrics.inc_undeploy_failures_counter(&instance_uuid);
            }
        }
        result
    }

}