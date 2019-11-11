//! Find more details here:
//! * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceStatus.html
//! * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceSpec.html

use crate::utils;
use std::path::Path;
use log::info;
use kube::{
    api::{Api, DeleteParams, ListParams, PatchStrategy, PatchParams, PostParams, KubeObject},
    client::APIClient,
    config,
};
use serde::de::DeserializeOwned;
use serde_json::Value;
use uuid::Uuid;

fn error_to_string<T: std::fmt::Display>(err: T) -> String {
    format!("{}", err)
}

fn read_deployment(uuid: &str, image: &str) -> Result<Value, String> {
    utils::read(&Path::new("conf/deployment.json"))
      .map_err(error_to_string)
      .and_then(|s| serde_json::from_str(&s.replace("%IMAGE_NAME%", image).replace("%UUID%", uuid)).map_err(error_to_string))
}

fn read_service(uuid: &str, pod: &str) -> Result<Value, String> {
    utils::read(&Path::new("conf/service.json"))
      .map_err(error_to_string)
      .and_then(|s| serde_json::from_str(&s.replace("%POD_NAME%", pod).replacen("%UUID%", uuid, 2)).map_err(error_to_string))
}

fn read_add_path(host: &str, uuid: &str, service_name: &str) -> Result<Value, String> {
    let subdomain = format!("{}.{}", uuid, host);
    utils::read(&Path::new("conf/add-theia-path.json"))
      .map_err(error_to_string)
      .and_then(|s| serde_json::from_str(&s.replacen("%SERVICE_NAME%", service_name, 4).replacen("%HOST%", &subdomain, 2)).map_err(error_to_string))
}

fn deploy_pod(host: &str, namespace: &str, client: APIClient, image: &str) -> Result<String, String> {
    let uuid = format!("{}", Uuid::new_v4());
    let p: Value = read_deployment(&uuid, image)?;

    let params = PostParams::default();
    let pods = Api::v1Pod(client.clone()).within(namespace);
    let name = pods.create(&params, serde_json::to_vec(&p).map_err(error_to_string)?)
      .map(|o| o.metadata.name).map_err(error_to_string)?;

    let p2: Value = read_service(&uuid, &name)?;

    let services = Api::v1Service(client.clone()).within(namespace);
    let service_name = services.create(&params, serde_json::to_vec(&p2).map_err(error_to_string)?)
      .map(|o| o.metadata.name).map_err(error_to_string)?;

    let p3: Value = read_add_path(&host, &uuid, &service_name)?;
    println!("{:?}", p3);
    let patch_params = PatchParams{ patch_strategy: PatchStrategy::JSON , ..PatchParams::default() };
    let ingress = Api::v1beta1Ingress(client.clone()).within(namespace);
    ingress.patch("playground-ingress", &patch_params, serde_json::to_vec(&p3).map_err(error_to_string)?).map_err(error_to_string)?;

    Ok(uuid)
}

fn list_by_selector<K: Clone + DeserializeOwned + KubeObject>(api: &Api<K>, selector: String) -> Result<Vec<K>, String> {
    let params = ListParams{ label_selector: Some(selector), ..ListParams::default()};
    api.list(&params).map(|l| l.items).map_err(|s| format!("Error {}", s))
}

fn undeploy_pod(namespace: &str, client: APIClient, uuid: &str) -> Result<(), String> {
    let service_api = Api::v1Service(client.clone()).within(namespace);
    let selector = format!("app-uuid={}", uuid);
    let services = list_by_selector(&service_api, selector.clone())?;
    let service = services.first().ok_or(format!("No matching service for {}", uuid))?;
    let params = DeleteParams::default();
    service_api.delete(&service.metadata.name, &params).map_err(|s| format!("Error {}", s))?;

    let pod_api = Api::v1Pod(client).within(namespace);
    let pods = list_by_selector(&pod_api, selector)?;
    let pod = pods.first().ok_or(format!("No matching pod for {}", uuid))?;
    pod_api.delete(&pod.metadata.name, &params).map_err(|s| format!("Error {}", s))?;

    Ok(())
}

fn create_client() -> kube::Result<APIClient> {
    let config = config::incluster_config()
      .unwrap_or_else(|_| {
        info!("Use local configuration");
        config::load_kube_config().unwrap()  
      });
    Ok(APIClient::new(config))
}

pub fn deploy(host: &str, namespace: &str, image: & str) -> Result<String, String> {
    create_client().map_err(error_to_string).and_then(|c| deploy_pod(host, namespace, c, image))
}

pub fn undeploy(namespace: &str, uuid: & str) -> Result<(), String> {
    create_client().map_err(error_to_string).and_then(|c| undeploy_pod(namespace, c, uuid))
}
