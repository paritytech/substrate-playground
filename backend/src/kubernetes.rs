//! Find more details here:
//! * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceStatus.html
//! * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceSpec.html

use crate::utils;
use kube::{
    api::{Api, DeleteParams, KubeObject, ListParams, PatchParams, PatchStrategy, PostParams},
    client::APIClient,
    config,
};
use log::info;
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::path::Path;
use uuid::Uuid;

fn error_to_string<T: std::fmt::Display>(err: T) -> String {
    format!("{}", err)
}

fn read_deployment(uuid: &str, image: &str) -> Result<Value, String> {
    utils::read(&Path::new("conf/deployment.json"))
        .map_err(error_to_string)
        .and_then(|s| {
            serde_json::from_str(&s.replace("%IMAGE_NAME%", image).replace("%UUID%", uuid))
                .map_err(error_to_string)
        })
}

fn read_service(uuid: &str, pod: &str) -> Result<Value, String> {
    utils::read(&Path::new("conf/service.json"))
        .map_err(error_to_string)
        .and_then(|s| {
            serde_json::from_str(&s.replace("%POD_NAME%", pod).replacen("%UUID%", uuid, 2))
                .map_err(error_to_string)
        })
}

fn read_add_path(host: &str, uuid: &str, service_name: &str) -> Result<Value, String> {
    let subdomain = format!("{}.{}", uuid, host);
    utils::read(&Path::new("conf/add-theia-path.json"))
        .map_err(error_to_string)
        .and_then(|s| {
            serde_json::from_str(
                &s.replacen("%SERVICE_NAME%", service_name, 4)
                    .replacen("%HOST%", &subdomain, 2),
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

fn deploy_pod(
    host: &str,
    namespace: &str,
    client: APIClient,
    image: &str,
) -> Result<String, String> {
    let uuid = format!("{}", Uuid::new_v4());
    let p: Value = read_deployment(&uuid, image)?;

    let params = PostParams::default();
    let pods = Api::v1Pod(client.clone()).within(namespace);
    let name = pods
        .create(&params, serde_json::to_vec(&p).map_err(error_to_string)?)
        .map(|o| o.metadata.name)
        .map_err(error_to_string)?;

    let service: Value = read_service(&uuid, &name)?;
    let services = Api::v1Service(client.clone()).within(namespace);
    let service_name = services
        .create(
            &params,
            serde_json::to_vec(&service).map_err(error_to_string)?,
        )
        .map(|o| o.metadata.name)
        .map_err(error_to_string)?;

    let add_path: Value = read_add_path(&host, &uuid, &service_name)?;
    let patch_params = PatchParams {
        patch_strategy: PatchStrategy::JSON,
        ..PatchParams::default()
    };
    let ingress = Api::v1beta1Ingress(client).within(namespace);
    ingress
        .patch(
            "playground-ingress",
            &patch_params,
            serde_json::to_vec(&add_path).map_err(error_to_string)?,
        )
        .map_err(error_to_string)?;

    Ok(uuid)
}

fn list_by_selector<K: Clone + DeserializeOwned + KubeObject>(
    api: &Api<K>,
    selector: String,
) -> Result<Vec<K>, String> {
    let params = ListParams {
        label_selector: Some(selector),
        ..ListParams::default()
    };
    api.list(&params)
        .map(|l| l.items)
        .map_err(|s| format!("Error {}", s))
}

fn undeploy_pod(_host: &str, namespace: &str, client: APIClient, uuid: &str) -> Result<(), String> {
    let service_api = Api::v1Service(client.clone()).within(namespace);
    let selector = format!("app-uuid={}", uuid);
    let services = list_by_selector(&service_api, selector.clone())?;
    let service = services
        .first()
        .ok_or(format!("No matching service for {}", uuid))?;
    let params = DeleteParams::default();
    service_api
        .delete(&service.metadata.name, &params)
        .map_err(|s| format!("Error {}", s))?;

    let pod_api = Api::v1Pod(client.clone()).within(namespace);
    let pods = list_by_selector(&pod_api, selector)?;
    let pod = pods
        .first()
        .ok_or(format!("No matching pod for {}", uuid))?;
    pod_api
        .delete(&pod.metadata.name, &params)
        .map_err(|s| format!("Error {}", s))?;

    let _ingress = Api::v1beta1Ingress(client).within(namespace);
    //let aa: Value = ingress.get("playground-ingress").map_err(error_to_string)?;
    /*let index = format!("{}", 0);
    let remove_path: Value = read_remove_path(&index)?;
    let patch_params = PatchParams{ patch_strategy: PatchStrategy::JSON , ..PatchParams::default() };
    ingress.patch("playground-ingress", &patch_params, serde_json::to_vec(&remove_path).map_err(error_to_string)?).map_err(error_to_string)?;*/

    Ok(())
}

fn create_config() -> kube::Result<kube::config::Configuration> {
    config::incluster_config().or_else(|_| {
        info!("Use local configuration");
        config::load_kube_config()
    })
}

pub fn deploy(host: &str, image: &str) -> Result<String, String> {
    let config = create_config().map_err(error_to_string)?;
    let ns = &config.clone().default_ns;
    deploy_pod(host, &ns, APIClient::new(config), image)
}

pub fn undeploy(host: &str, uuid: &str) -> Result<(), String> {
    let config = create_config().map_err(error_to_string)?;
    let ns = &config.clone().default_ns;
    undeploy_pod(host, &ns, APIClient::new(config), uuid)
}
