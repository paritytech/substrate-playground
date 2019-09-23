use crate::platform::Platform;
use log::{error, info};
use kube::{
    api::{Api, PostParams},
    client::{APIClient},
    config::{self, Configuration},
};
use serde_json::json;

pub struct K8s {}

fn deploy_pod(client: APIClient,image: &str) {
    let pods = Api::v1Pod(client).within("default");
    let p = json!({
        "apiVersion": "v1",
        "kind": "Pod",
        "metadata": { "name": image },
        "spec": {
            "containers": [{
            "name": image,
            "image": image
            }],
        }
    });
    let pp = PostParams::default();
    match pods.create(&pp, serde_json::to_vec(&p).unwrap()) {
        Ok(o) => {
            assert_eq!(p["metadata"]["name"], o.metadata.name);
            error!("Created {}", o.metadata.name);
            // wait for it..
            std::thread::sleep(std::time::Duration::from_millis(5_000));
        }
        Err(e) => {
            error!("Err {}", e);
            if let Some(ae) = e.api_error() {
                error!("Err {}", ae);
            }
        },
    }
}

fn get_service(client: APIClient,name: &str) {
    let service = Api::v1Service(client).within("default");
    match service.get(name) {
        Ok(o) => {
            error!("Got {}", o.metadata.name);
        }
        Err(e) => {
            error!("Err {}", e);
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
        let client = create_client();
        K8s{}
    }
}

impl Platform for K8s {

    fn deploy(&self, image: & str) -> Result<String, String> {
        match create_client(){
            Ok(client) => {
                deploy_pod(client, image);
                Ok("playground".to_string())
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
        /*let client = create_client()?;
        let service = get_service(client, &"playground-http".to_string());
        Ok(format!("//localhost:{}/#/home/project", ""))*/
        unimplemented!();
    }

}
