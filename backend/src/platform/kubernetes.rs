use crate::utils;
use crate::platform::Platform;
use std::fs::File;
use std::path::Path;
use log::{error, info};
use kube::{
    api::{Api, PostParams},
    client::{APIClient},
    config::{self, Configuration},
};
use serde_json::{json, Value};

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

fn get_service(client: APIClient,name: &str) -> Option<String> {
    let service = Api::v1Service(client).within("default");
    match service.get(name) {
        Ok(o) => {
            // https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceStatus.html
            // https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceSpec.html
            error!("Got {:?}", o.status);
            error!("Got {:?}", o.spec.external_ips);
            error!("Got !! {:?}", o.spec.load_balancer_ip);
            error!("Got !!2 {:?}", o.spec.ports);
            if let (Some(load_balancer_ip), Some(ports)) = (o.spec.load_balancer_ip, o.spec.ports) {
                Some(format!("http://{}:{}", load_balancer_ip, /*ports[0].node_port.unwrap())*/ 8080).to_string()) // TODO only the proper port (correct name)
            } else {
                None
            }
        }
        Err(e) => {
            error!("Err {}", e);
            None
        },
    }
}

fn create_client() -> kube::Result<APIClient> {
    let config = match config::incluster_config() {
        Ok(config) => {
            config
        },
        Err(_) => {
            info!("Local");
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
                let service = get_service(client, id);
                service.ok_or("dsfs".to_string())
            },
            Err(error) => {
                Err(format!("{}", error))
            }
        }
    }

}
