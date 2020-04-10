//! Find more details here:
//! * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceStatus.html
//! * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceSpec.html

use log::info;
use k8s_openapi::api::core::v1::{ConfigMap, Pod, Service};
use k8s_openapi::api::extensions::v1beta1::Ingress;
use kube::{
    api::{
        Api, DeleteParams, ListParams, Meta, PatchParams, PatchStrategy, PostParams, Resource,
        WatchEvent,
    },
    client::APIClient,
    config,
    runtime::Informer,
};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::{collections::BTreeMap, error::Error, fs, path::Path};
use uuid::Uuid;

fn error_to_string<T: std::fmt::Display>(err: T) -> String {
    format!("{}", err)
}

fn read_deployment(user_uuid: &str, instance_uuid: &str, image: &str) -> Result<Value, String> {
    fs::read_to_string(&Path::new("conf/deployment.json"))
        .map_err(error_to_string)
        .and_then(|s| {
            serde_json::from_str(
                &s.replace("%IMAGE_NAME%", image)
                    .replace("%USER_UUID%", user_uuid)
                    .replace("%INSTANCE_UUID%", instance_uuid),
            )
            .map_err(error_to_string)
        })
}

fn read_service(instance_uuid: &str) -> Result<Value, String> {
    fs::read_to_string(&Path::new("conf/service.json"))
        .map_err(error_to_string)
        .and_then(|s| {
            serde_json::from_str(&s.replacen("%INSTANCE_UUID%", instance_uuid, 2))
                .map_err(error_to_string)
        })
}

fn read_add_path(host: &str, instance_uuid: &str, service_name: &str) -> Result<Value, String> {
    let subdomain = format!("{}.{}", instance_uuid, host);
    fs::read_to_string(&Path::new("conf/add-theia-path.json"))
        .map_err(error_to_string)
        .and_then(|s| {
            serde_json::from_str(
                &s.replacen("%SERVICE_NAME%", service_name, 3)
                    .replacen("%HOST%", &subdomain, 1),
            )
            .map_err(error_to_string)
        })
}

/*
fn read_remove_path(index: &str) -> Result<Value, String> {
    utils::read(&Path::new("conf/remove-theia-path.json"))
      .map_err(error_to_string)
      .and_then(|s| serde_json::from_str(&s.replace("%INDEX%", &index)).map_err(error_to_string))
}
*/

async fn config() -> Result<kube::config::Configuration, String> {
    config::load_kube_config()
        .await
        .or_else(|_| config::incluster_config())
        .map_err(error_to_string)
}

async fn images_from_template(
    client: APIClient,
    namespace: &str,
) -> Result<BTreeMap<String, String>, String> {
    let config_map_api: Api<ConfigMap> = Api::namespaced(client, namespace);
    config_map_api
        .get("theia-images")
        .await
        .map_err(error_to_string)
        .and_then(|o: ConfigMap| o.data.ok_or_else(|| "No data field".to_string()))
}

#[derive(Debug, Clone)]
pub struct Engine {
    host: Option<String>,
}

impl Engine {

    pub async fn new() -> Result<Self, Box<dyn Error>> {
        let config = config().await?;
        let namespace = &config.clone().default_ns;
        let client = APIClient::new(config);
        let ingress_api: Api<Ingress> = Api::namespaced(client.clone(), namespace);
        let host: String = ingress_api.get("playground-ingress").await?.spec.ok_or("message")?.rules.ok_or("message")?.first().ok_or("message")?.host.clone().ok_or("message")?;
        // TODO failsafe
        info!("HOST: {}", host);

        // TODO load and monitor images

        Ok(Engine {host: Some(host)})
    }

    pub async fn get(self, instance_uuid: &str) -> Result<String, String> {
        let config = config().await?;
        let namespace = &config.clone().default_ns;
        let client = APIClient::new(config);
        let pod_api: Api<Pod> = Api::namespaced(client.clone(), namespace);
        let selector = format!("instance-uuid={}", instance_uuid);
        let pods = list_by_selector(&pod_api, selector).await?;
        let phase = pods
            .first()
            .ok_or_else(|| format!("No matching service for {}", instance_uuid))?
            .status // https://docs.rs/k8s-openapi/0.7.1/k8s_openapi/api/core/v1/struct.PodStatus.html
            .as_ref()
            .ok_or_else(|| format!("No metadata for {}", instance_uuid))?
            .phase
            .clone()
            .ok_or_else(|| format!("No name for {}", instance_uuid))?;
    
        Ok(phase)
    }

    /// Lists all currently running instances for an identified user
    pub async fn list(self, user_uuid: &str) -> Result<Vec<String>, String> {
        let config = config().await?;
        let namespace = &config.clone().default_ns;
        let client = APIClient::new(config);
        let pod_api: Api<Pod> = Api::namespaced(client.clone(), namespace);
        let selector = format!("user-uuid={}", user_uuid);
        let pods = list_by_selector(&pod_api, selector).await?;
        let names: Vec<String> = pods
            .iter()
            .flat_map(|pod| {
                pod.metadata
                    .as_ref()
                    .and_then(|md| Some(md.labels.clone()?.get("instance-uuid")?.to_string()))
            })
            .collect::<Vec<_>>();

        Ok(names)
    }

    pub async fn list_all(self) -> Result<Vec<String>, String> {
        let config = config().await?;
        let namespace = &config.clone().default_ns;
        let client = APIClient::new(config);
        let pod_api: Api<Pod> = Api::namespaced(client.clone(), namespace);
        let pods = list_by_selector(&pod_api, "app=theia-substrate".to_string()).await?;
        let names: Vec<String> = pods
            .iter()
            .flat_map(|pod| {
                pod.metadata
                    .as_ref()
                    .and_then(|md| Some(md.labels.clone()?.get("instance-uuid")?.to_string()))
            })
            .collect::<Vec<_>>();
    
        Ok(names)
    }

    pub async fn deploy(self, user_uuid: &str, template: &str) -> Result<String, String> {
        let config = config().await?;
        let namespace = &config.clone().default_ns;
        let client = APIClient::new(config);
    
        let instance_uuid = format!("{}", Uuid::new_v4());
        // Access the right image id
        let images = images_from_template(client.clone(), &namespace).await?;
        let image = images
            .get(&template.to_string())
            .ok_or_else(|| format!("Unknow image {}", template))?;
    
        // Deploy a new pod for this image
        let pod_api: Api<Pod> = Api::namespaced(client.clone(), namespace);
        let pod_name = pod_api
            .create(
                &PostParams::default(),
                &serde_json::from_value(read_deployment(&user_uuid, &instance_uuid, image)?)
                    .map_err(error_to_string)?,
            )
            .await
            .map(|o| o.metadata.unwrap().name.unwrap())
            .map_err(error_to_string)?;
    
        /*info!("Spawning");
        let thread = thread::spawn(async move || {
            info!("New thread");
            let namespace = &config2.clone().default_ns;
            let client = APIClient::new(config2);
    
            loop {
                info!("Loop!");
                let pod_api: Api<Pod> = Api::namespaced(client.clone(), namespace);
                let p1cpy = pod_api.get(&pod_name).await.map_err(error_to_string).unwrap();
                if let Some(status) = &p1cpy.status {
                    info!("Got blog pod with containers: {:?}", status.phase);
                }
                thread::sleep(Duration::from_millis(1000));
            }
        });
        info!("{:?}", thread.join().unwrap().await);*/
    
        // Deploy the associated service
        let service: Value = read_service(&instance_uuid)?;
        let service_api: Api<Service> = Api::namespaced(client.clone(), namespace);
        let service_name = service_api
            .create(
                &PostParams::default(),
                &serde_json::from_value(service).map_err(error_to_string)?,
            )
            .await
            .map(|o| o.metadata.unwrap().name.unwrap())
            .map_err(error_to_string)?;
    
        // Patch the ingress configuration to add the new path, if host is defined
        if let Some(host) = self.host {
            let add_path: Value = read_add_path(&host, &instance_uuid, &service_name)?;
            let patch_params = PatchParams {
                patch_strategy: PatchStrategy::JSON,
                ..PatchParams::default()
            };
            let ingress_api: Api<Ingress> = Api::namespaced(client.clone(), namespace);
            ingress_api
            .patch(
                "playground-ingress",
                &patch_params,
                serde_json::to_vec(&add_path).map_err(error_to_string)?,
            )
            .await
            .map_err(error_to_string)?;
        }
    
        Ok(instance_uuid)
    }
    
    pub async fn undeploy(self, instance_uuid: &str) -> Result<(), String> {
        let config = config().await?;
        let namespace = &config.clone().default_ns;
        let client = APIClient::new(config);
    
        // Undeploy the service from its id
        let service_api: Api<Service> = Api::namespaced(client.clone(), namespace);
        let selector = format!("instance-uuid={}", instance_uuid);
        let services = list_by_selector(&service_api, selector.clone()).await?;
        let service_name = services
            .first()
            .ok_or_else(|| format!("No matching service for {}", instance_uuid))?
            .metadata
            .as_ref()
            .ok_or_else(|| format!("No metadata for {}", instance_uuid))?
            .name
            .as_ref()
            .ok_or_else(|| format!("No name for {}", instance_uuid))?;
        service_api
            .delete(&service_name, &DeleteParams::default())
            .await
            .map_err(|s| format!("Error {}", s))?;
    
        let pod_api: Api<Pod> = Api::namespaced(client.clone(), namespace);
        let pods = list_by_selector(&pod_api, selector).await?;
        let pod_name = pods
            .first()
            .ok_or_else(|| format!("No matching pod for {}", instance_uuid))?
            .metadata
            .as_ref()
            .ok_or_else(|| format!("No metadata for {}", instance_uuid))?
            .name
            .as_ref()
            .ok_or_else(|| format!("No name for {}", instance_uuid))?;
        pod_api
            .delete(&pod_name, &DeleteParams::default())
            .await
            .map_err(|s| format!("Error {}", s))?;
    
        /*let _ingress = Api::v1beta1Ingress(client).within(namespace);
        //let aa: Value = ingress.get("playground-ingress").map_err(error_to_string)?;
        let index = format!("{}", 0);
        let remove_path: Value = read_remove_path(&index)?;
        let patch_params = PatchParams{ patch_strategy: PatchStrategy::JSON , ..PatchParams::default() };
        ingress.patch("playground-ingress", &patch_params, serde_json::to_vec(&remove_path).map_err(error_to_string)?).map_err(error_to_string)?;*/
    
        Ok(())
    }

}

async fn list_by_selector<K: Clone + DeserializeOwned + Meta>(
    api: &Api<K>,
    selector: String,
) -> Result<Vec<K>, String> {
    let params = ListParams {
        label_selector: Some(selector),
        ..ListParams::default()
    };
    api.list(&params)
        .await
        .map(|l| l.items)
        .map_err(|s| format!("Error {}", s))
}
