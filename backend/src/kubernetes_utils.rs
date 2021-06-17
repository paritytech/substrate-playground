//! Helper methods ton interact with k8s
use crate::error::{Error, Result};
use json_patch::{AddOperation, PatchOperation, RemoveOperation};
use k8s_openapi::api::{
    core::v1::{ConfigMap, EnvVar},
    extensions::v1beta1::{HTTPIngressPath, IngressBackend},
};
use k8s_openapi::apimachinery::pkg::util::intstr::IntOrString;
use kube::{
    api::{Api, ListParams, Patch, PatchParams},
    config::KubeConfigOptions,
    Client, Config,
};
use serde::de::DeserializeOwned;
use serde_json::json;
use std::{collections::BTreeMap, convert::TryFrom, fmt::Debug};

// Model utilities

pub fn env_var(name: &str, value: &str) -> EnvVar {
    EnvVar {
        name: name.to_string(),
        value: Some(value.to_string()),
        ..Default::default()
    }
}

pub fn ingress_path(path: &str, service_name: &str, service_port: i32) -> HTTPIngressPath {
    HTTPIngressPath {
        path: Some(path.to_string()),
        backend: IngressBackend {
            service_name: service_name.to_string(),
            service_port: IntOrString::Int(service_port),
        },
    }
}

// Client utilities

pub async fn config() -> Result<Config> {
    Config::from_kubeconfig(&KubeConfigOptions::default())
        .await
        .or_else(|_| Config::from_cluster_env())
        .map_err(|err| Error::Failure(err.into()))
}

pub async fn client() -> Result<Client> {
    let config = config().await?;
    Client::try_from(config).map_err(|err| Error::Failure(err.into()))
}

// ConfigMap utilities

pub async fn get_config_map(
    client: Client,
    namespace: &str,
    name: &str,
) -> Result<BTreeMap<String, String>> {
    let config_map_api: Api<ConfigMap> = Api::namespaced(client, namespace);
    config_map_api
        .get(name)
        .await
        .map_err(|err| Error::Failure(err.into())) // No config map
        .map(|o| o.data) // No data, return empty string
}

//
// Adds a value to a ConfigMap, specified by a `key`.
// Err if provided `key` doesn't exist
//
// Equivalent to `kubectl patch configmap $name --type=json -p='[{"op": "add", "path": "/data/$key", "value": "$value"}]'`
pub async fn add_config_map_value(
    client: Client,
    namespace: &str,
    name: &str,
    key: &str,
    value: &str,
) -> Result<()> {
    let config_map_api: Api<ConfigMap> = Api::namespaced(client, namespace);
    let params = PatchParams {
        ..PatchParams::default()
    };
    let patch: Patch<json_patch::Patch> =
        Patch::Json(json_patch::Patch(vec![PatchOperation::Add(AddOperation {
            path: format!("/data/{}", key),
            value: json!(value),
        })]));
    config_map_api
        .patch(name, &params, &patch)
        .await
        .map_err(|err| Error::Failure(err.into()))?;
    Ok(())
}

//
// Deletes a value from a ConfigMap, specified by a `key`.
// Err if provided `key` doesn't exist
//
// Equivalent to `kubectl patch configmap $name --type=json -p='[{"op": "remove", "path": "/data/$key"}]'`
pub async fn delete_config_map_value(
    client: Client,
    namespace: &str,
    name: &str,
    key: &str,
) -> Result<()> {
    let config_map_api: Api<ConfigMap> = Api::namespaced(client, namespace);
    let params = PatchParams {
        ..PatchParams::default()
    };
    let patch: Patch<json_patch::Patch> =
        Patch::Json(json_patch::Patch(vec![PatchOperation::Remove(
            RemoveOperation {
                path: format!("/data/{}", key),
            },
        )]));
    config_map_api
        .patch(name, &params, &patch)
        .await
        .map_err(|err| Error::Failure(err.into()))?;
    Ok(())
}

pub async fn list_by_selector<K: Clone + DeserializeOwned + Debug>(
    api: &Api<K>,
    selector: String,
) -> Result<Vec<K>> {
    let params = ListParams {
        label_selector: Some(selector),
        ..ListParams::default()
    };
    api.list(&params)
        .await
        .map(|l| l.items)
        .map_err(|err| Error::Failure(err.into()))
}
