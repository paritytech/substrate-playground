use crate::utils;
use crate::platform::Platform;
use std::path::Path;
use log::{error, info};
use kube::{
    api::{Api, PostParams},
    client::{APIClient},
    config,
};
use serde_json::Value;

pub struct K8s {}

fn read_deployment(image: &str) -> Result<Value, String> {
    match utils::read(&Path::new("conf/deployment.yaml")) {
        Err(why) => {
            error!("! {:?}", why.kind());
            Err("".to_string())
        },
        Ok(s) => serde_json::from_str(&s.replace("%IMAGE_NAME%", image)).map_err(|err| -> String {format!("{}", err)})
    }
}

fn read_service(pod: &str) -> Result<Value, String> {
    match utils::read(&Path::new("conf/service.yaml")) {
        Err(why) => {
            error!("! {:?}", why.kind());
            Err("".to_string())
        },
        Ok(s) => serde_json::from_str(&s.replace("%POD_NAME%", pod)).map_err(|err| -> String {format!("{}", err)})
    }
}

fn deploy_pod(client: APIClient,image: &str) -> Result<String, String> {
    let p: Value = read_deployment(image).unwrap(); // TODO better error handling

    let pp = PostParams::default();
    let pods = Api::v1Pod(client.clone()).within("default");
    let name = match pods.create(&pp, serde_json::to_vec(&p).unwrap()) {
        Ok(o) => {
            info!("Created {}", o.metadata.name);
            info!("Created {}", o.metadata.uid.unwrap());
            //Ok(o.metadata.name)
            o.metadata.name
        }
        Err(e) => {
            error!("Err {}", e);
            "".to_string()
        },
    };

    let p2: Value = read_service(&name).unwrap();

    let services = Api::v1Service(client).within("default");
    match services.create(&pp, serde_json::to_vec(&p2).unwrap()) {
        Ok(o) => {
            info!("Created {}", o.metadata.name);
            info!("Created {}", o.metadata.uid.unwrap());
            Ok(o.metadata.name)
        }
        Err(e) => {
            error!("Err {}", e);
            Err(format!("{}", e))
        },
    }
}

fn get_service(client: APIClient,name: &str) -> Result<String, String> {
    let service = Api::v1Service(client).within("default");
    match service.get(name) {
        Ok(o) => {
            // Find more details here:
            // * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceStatus.html
            // * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceSpec.html
            if let (Some(status), Some(ports)) = (o.status, o.spec.ports) {
                if let Some (ingress) = status.load_balancer.unwrap().ingress {
                  Ok(format!("http://{}:{}", ingress[0].ip.as_ref().unwrap(), 8080).to_string()) // TODO only the proper port (correct name)
                } else {
                    Ok("".to_string())
                }
            } else {
                Err("Failed to access service endpoint".to_string())
            }
        }
        Err(e) => {
            error!("Err {}", e);
            Err("Failed to access service endpoint".to_string())
        },
    }
}

fn create_client() -> kube::Result<APIClient> {
    let config = match config::incluster_config() {
        Ok(config) => {
            config
        },
        Err(_) => {
            info!("Use local configuration");
            config::load_kube_config().unwrap()
        },
    };
    Ok(APIClient::new(config))
}

impl K8s {
    pub fn new() -> Self {
        K8s{}
    }
}

impl Platform for K8s {

    fn deploy(&self, image: & str) -> Result<String, String> {
        match create_client() {
            Ok(client) => {
                deploy_pod(client, image)
            },
            Err(error) => {
                Err(format!("{}", error))
            }
        }
    }

    fn undeploy(&self, id: & str) -> Result<String, String> {
        unimplemented!();
    }

    fn url(&self, id: & str) -> Result<String, String> {
        match create_client() {
            Ok(client) => {
                get_service(client, id)
            },
            Err(error) => {
                Err(format!("{}", error))
            }
        }
    }

}
