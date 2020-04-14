//! Find more details here:
//! * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceStatus.html
//! * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceSpec.html

use k8s_openapi::api::core::v1::{
    ConfigMap, Container, Pod, PodSpec, Service, ServicePort, ServiceSpec,
};
use k8s_openapi::api::extensions::v1beta1::Ingress;
use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;
use kube::{
    api::{
        Api, DeleteParams, ListParams, Meta, PatchParams, PatchStrategy, PostParams, Resource,
        WatchEvent,
    },
    client::APIClient,
    config,
    runtime::Informer,
};
use log::info;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, error::Error, fs, path::Path, time::SystemTime};
use uuid::Uuid;

const APP_LABEL: &str = "app";
const APP_VALUE: &str = "theia-substrate";
const USER_UUID_LABEL: &str = "user-uuid";
const INSTANCE_UUID_LABEL: &str = "instance-uuid";
const INGRESS_NAME: &str = "playground-ingress";

fn error_to_string<T: std::fmt::Display>(err: T) -> String {
    format!("{}", err)
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

fn create_pod(user_uuid: &str, instance_uuid: &str, image: &str) -> Pod {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(USER_UUID_LABEL.to_string(), user_uuid.to_string());
    labels.insert(INSTANCE_UUID_LABEL.to_string(), instance_uuid.to_string());
    Pod {
        metadata: Some(ObjectMeta {
            generate_name: Some(format!("{}-", APP_VALUE).to_string()),
            labels: Some(labels),
            ..Default::default()
        }),
        spec: Some(PodSpec {
            containers: vec![Container {
                name: format!("{}-container", APP_VALUE).to_string(),
                image: Some(image.to_string()),
                ..Default::default()
            }],
            ..Default::default()
        }),
        ..Default::default()
    }
}

fn create_service(instance_uuid: &str) -> Service {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(INSTANCE_UUID_LABEL.to_string(), instance_uuid.to_string());
    let mut selectors = BTreeMap::new();
    selectors.insert(INSTANCE_UUID_LABEL.to_string(), instance_uuid.to_string());
    Service {
        metadata: Some(ObjectMeta {
            generate_name: Some(format!("{}-http-", APP_VALUE).to_string()),
            labels: Some(labels),
            ..Default::default()
        }),
        spec: Some(ServiceSpec {
            type_: Some("NodePort".to_string()),
            selector: Some(selectors),
            ports: Some(vec![
                ServicePort {
                    name: Some("web".to_string()),
                    protocol: Some("TCP".to_string()),
                    port: 3000,
                    ..Default::default()
                },
                ServicePort {
                    name: Some("front-end".to_string()),
                    protocol: Some("TCP".to_string()),
                    port: 8000,
                    ..Default::default()
                },
                ServicePort {
                    name: Some("wss".to_string()),
                    protocol: Some("TCP".to_string()),
                    port: 9944,
                    ..Default::default()
                },
            ]),
            ..Default::default()
        }),
        ..Default::default()
    }
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

#[derive(Clone)]
pub struct Engine {
    host: Option<String>,
    namespace: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct InstanceDetails {
    pub user_uuid: String,
    pub instance_uuid: String,
    pub phase: String,
    pub url: String,
    pub started_at: SystemTime,
}

impl InstanceDetails {

    pub fn new(engine: Engine, user_uuid: String, instance_uuid: String, phase: String, started_at: SystemTime) -> Self {
        InstanceDetails{ user_uuid: user_uuid.clone(), instance_uuid: instance_uuid.clone(), phase, url: InstanceDetails::url(engine, instance_uuid), started_at }
    }

    fn url(engine: Engine, instance_uuid: String) -> String {
        if let Some(host) = engine.host {
            format!("//{}.{}", instance_uuid, host)
        } else {
            format!("//{}", instance_uuid)
        }
    }

}

impl Engine {

    pub async fn new() -> Result<Self, Box<dyn Error>> {
        let config = config().await?;
        let namespace = config.clone().default_ns.to_string();
        let client = APIClient::new(config);
        let ingress_api: Api<Ingress> = Api::namespaced(client.clone(), &namespace);
        let host = if let Ok(ingress) = ingress_api.get(INGRESS_NAME).await {
            ingress.spec
                .ok_or("message")?
                .rules
                .ok_or("message")?
                .first()
                .ok_or("message")?
                .host
                .clone()
        } else {
            None
        };
        // TODO failsafe
        info!("HOST: {:?}", host);

        // TODO load and monitor images

        Ok(Engine {
            host,
            namespace,
        })
    }

    fn user_selector(user_uuid: &str) -> String {
        format!("{}={}", USER_UUID_LABEL, user_uuid)
    }

    fn instance_selector(instance_uuid: &str) -> String {
        format!("{}={}", INSTANCE_UUID_LABEL, instance_uuid)
    }

    fn pod_to_instance(self, pod: &Pod) -> Result<InstanceDetails, String> {
        let phase = pod
        .status // https://docs.rs/k8s-openapi/0.7.1/k8s_openapi/api/core/v1/struct.PodStatus.html
        .as_ref()
        .ok_or_else(|| format!("No metadata for"))?
        .phase
        .clone()
        .ok_or_else(|| format!("No name for"))?;

        let user_uuid = "".to_string();
        let instance_uuid = "".to_string();
        let started_at = SystemTime::now();
        /*pod.metadata.as_ref().and_then(|md| {
            Some((
                md.labels.clone()?.get(USER_UUID_LABEL)?.to_string(),
                InstanceDetails::new(self, md.labels.clone()?.get(INSTANCE_UUID_LABEL)?.to_string(), phase),
            ))
        })*/

        Ok(InstanceDetails::new(self, user_uuid, instance_uuid, phase, started_at))
    }

    pub async fn get(self, instance_uuid: &str) -> Result<InstanceDetails, String> {
        let config = config().await?;
        let client = APIClient::new(config);
        let pod_api: Api<Pod> = Api::namespaced(client, &self.namespace);
        let pods = list_by_selector(&pod_api, Engine::instance_selector(instance_uuid)).await?;
        let pod = pods
            .first()
            .ok_or_else(|| format!("No matching service for {}", instance_uuid))?;

        Ok(self.pod_to_instance(pod)?)
    }

    /// Lists all currently running instances for an identified user
    pub async fn list(self, user_uuid: &str) -> Result<Vec<String>, String> {
        let config = config().await?;
        let client = APIClient::new(config);
        let pod_api: Api<Pod> = Api::namespaced(client, &self.namespace);
        let pods = list_by_selector(&pod_api, Engine::user_selector(user_uuid)).await?;
        let names: Vec<String> = pods
            .iter()
            .flat_map(|pod| {
                pod.metadata
                    .as_ref()
                    .and_then(|md| Some(md.labels.clone()?.get(INSTANCE_UUID_LABEL)?.to_string()))
            })
            .collect::<Vec<_>>();

        Ok(names)
    }

    pub async fn list_all(&self) -> Result<BTreeMap<String, InstanceDetails>, String> {
        let config = config().await?;
        let client = APIClient::new(config);
        let pod_api: Api<Pod> = Api::namespaced(client, &self.namespace);
        let pods =
            list_by_selector(&pod_api, format!("{}={}", APP_LABEL, APP_VALUE).to_string()).await?;
        let names = pods
            .iter()
            .flat_map(|pod| {
                self.clone().pod_to_instance(pod).ok().map(|i| (/*i.user_uuid*/ "".to_string(), i))
            })
            .collect();

        Ok(names)
    }

    pub async fn deploy(self, user_uuid: &str, template: &str) -> Result<String, String> {
        let config = config().await?;
        let client = APIClient::new(config);
        // Access the right image id
        let images = images_from_template(client.clone(), &self.namespace).await?;
        let image = images
            .get(&template.to_string())
            .ok_or_else(|| format!("Unknow image {}", template))?;

        // Create a unique ID for this instance
        let instance_uuid = format!("{}", Uuid::new_v4());

        // Deploy a new pod for this image
        let pod_api: Api<Pod> = Api::namespaced(client.clone(), &self.namespace);
        let pod_name = pod_api
            .create(
                &PostParams::default(),
                &create_pod(&user_uuid, &instance_uuid, image),
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
        let service_api: Api<Service> = Api::namespaced(client.clone(), &self.namespace);
        let service_name = service_api
            .create(&PostParams::default(), &create_service(&instance_uuid))
            .await
            .map(|o| o.metadata.unwrap().name.unwrap())
            .map_err(error_to_string)?;

        // Patch the ingress configuration to add the new path, if host is defined
        if let Some(host) = self.host {
            let add_path = read_add_path(&host, &instance_uuid, &service_name)?;
            let patch_params = PatchParams {
                patch_strategy: PatchStrategy::JSON,
                ..PatchParams::default()
            };
            let ingress_api: Api<Ingress> = Api::namespaced(client, &self.namespace);
            ingress_api
                .patch(
                    INGRESS_NAME,
                    &patch_params,
                    serde_json::to_vec(&add_path).map_err(error_to_string)?,
                )
                .await
                .map_err(error_to_string)?;
        }

        Ok(instance_uuid)
    }

    pub async fn undeploy(self, instance_uuid: &str) -> Result<(), String> {
        // Undeploy the service by its id
        let config = config().await?;
        let client = APIClient::new(config);
        let service_api: Api<Service> = Api::namespaced(client.clone(), &self.namespace);
        let selector = Engine::instance_selector(instance_uuid);
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
            
        let pod_api: Api<Pod> = Api::namespaced(client.clone(), &self.namespace);
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
