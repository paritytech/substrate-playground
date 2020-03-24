//! Find more details here:
//! * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceStatus.html
//! * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceSpec.html

use k8s_openapi::api::core::v1::{ConfigMap, Pod, Service};
use k8s_openapi::api::extensions::v1beta1::Ingress;
use kube::{
    api::{Api, DeleteParams, ListParams, Meta, PatchParams, PatchStrategy, PostParams},
    client::APIClient,
    config,
};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::{collections::BTreeMap, fs, path::Path};
use uuid::Uuid;

fn error_to_string<T: std::fmt::Display>(err: T) -> String {
    format!("{}", err)
}

fn read_deployment(uuid: &str, image: &str) -> Result<Value, String> {
    fs::read_to_string(&Path::new("conf/deployment.json"))
        .map_err(error_to_string)
        .and_then(|s| {
            serde_json::from_str(&s.replace("%IMAGE_NAME%", image).replace("%UUID%", uuid))
                .map_err(error_to_string)
        })
}

fn read_service(uuid: &str, pod: &str) -> Result<Value, String> {
    fs::read_to_string(&Path::new("conf/service.json"))
        .map_err(error_to_string)
        .and_then(|s| {
            serde_json::from_str(&s.replace("%POD_NAME%", pod).replacen("%UUID%", uuid, 2))
                .map_err(error_to_string)
        })
}

fn read_add_path(host: &str, uuid: &str, service_name: &str) -> Result<Value, String> {
    let subdomain = format!("{}.{}", uuid, host);
    fs::read_to_string(&Path::new("conf/add-theia-path.json"))
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

async fn images_from_template(
    client: APIClient,
    namespace: &str,
) -> Result<BTreeMap<String, String>, String> {
    let config_map_api: Api<ConfigMap> = Api::namespaced(client, namespace);
    config_map_api
        .get("theia-images")
        .await
        .map_err(error_to_string)
        .and_then(|o: ConfigMap| {
            println!("{:?}", o.data);
            o.data.ok_or_else(|| "No data field".to_string())
        })
}

async fn deploy_pod(
    host: &str,
    namespace: &str,
    client: APIClient,
    template: &str,
) -> Result<String, String> {
    let images = images_from_template(client.clone(), &namespace).await?;
    let image = images
        .get(&template.to_string())
        .ok_or(format!("Unknow template {}", template))?;
    let uuid = format!("{}", Uuid::new_v4());
    let p: Value = read_deployment(&uuid, image)?;

    let pod_api: Api<Pod> = Api::namespaced(client.clone(), namespace);
    let name = pod_api
        .create(
            &PostParams::default(),
            &serde_json::from_value(p).map_err(error_to_string)?,
        )
        .await
        .map(|o| o.metadata.unwrap().name.unwrap())
        .map_err(error_to_string)?;

    let service: Value = read_service(&uuid, &name)?;
    let service_api: Api<Service> = Api::namespaced(client.clone(), namespace);
    let service_name = service_api
        .create(
            &PostParams::default(),
            &serde_json::from_value(service).map_err(error_to_string)?,
        )
        .await
        .map(|o| o.metadata.unwrap().name.unwrap())
        .map_err(error_to_string)?;

    let add_path: Value = read_add_path(&host, &uuid, &service_name)?;
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

    Ok(uuid)
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

async fn undeploy_pod(
    _host: &str,
    namespace: &str,
    client: APIClient,
    uuid: &str,
) -> Result<(), String> {
    let service_api: Api<Service> = Api::namespaced(client.clone(), namespace);
    let selector = format!("app-uuid={}", uuid);
    let services = list_by_selector(&service_api, selector.clone()).await?;
    let service_name = services
        .first()
        .ok_or(format!("No matching service for {}", uuid))?
        .metadata
        .as_ref()
        .ok_or(format!("No metadata for {}", uuid))?
        .name
        .as_ref()
        .ok_or(format!("No name for {}", uuid))?;
    service_api
        .delete(&service_name, &DeleteParams::default())
        .await
        .map_err(|s| format!("Error {}", s))?;

    let pod_api: Api<Pod> = Api::namespaced(client.clone(), namespace);
    let pods = list_by_selector(&pod_api, selector).await?;
    let pod_name = pods
        .first()
        .ok_or(format!("No matching pod for {}", uuid))?
        .metadata
        .as_ref()
        .ok_or(format!("No metadata for {}", uuid))?
        .name
        .as_ref()
        .ok_or(format!("No name for {}", uuid))?;
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

pub async fn deploy(host: &str, image: &str) -> Result<String, String> {
    let config = config::incluster_config().map_err(error_to_string)?;
    let ns = &config.clone().default_ns;
    deploy_pod(host, &ns, APIClient::new(config), image).await
}

pub async fn undeploy(host: &str, uuid: &str) -> Result<(), String> {
    let config = config::incluster_config().map_err(error_to_string)?;
    let ns = &config.clone().default_ns;
    undeploy_pod(host, &ns, APIClient::new(config), uuid).await
}
