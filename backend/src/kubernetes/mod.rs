pub mod pool;
pub mod repository;
pub mod session;
pub mod template;
pub mod user;
pub mod workspace;

use crate::{
    error::{Error, Result},
    types::{Configuration, Pod, Secrets, SessionDefaults},
    utils::var,
};
use json_patch::{AddOperation, PatchOperation, RemoveOperation};
use k8s_openapi::api::{
    core::v1::{ConfigMap, EnvVar},
    networking::v1::{
        HTTPIngressPath, Ingress, IngressBackend, IngressServiceBackend, ServiceBackendPort,
    },
};
use kube::{
    api::{ListParams, Patch, PatchParams},
    Api, Client, Config,
};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::json;
use std::{
    collections::BTreeMap, convert::TryFrom, fmt::Debug, num::ParseIntError, time::Duration,
};

const INGRESS_NAME: &str = "ingress";

pub async fn get_host() -> Result<String> {
    let client = client()?;
    let ingress_api: Api<Ingress> = Api::default_namespaced(client.clone());
    let ingress = ingress_api
        .get(INGRESS_NAME)
        .await
        .map_err(|err| Error::Failure(err.into()))?;
    Ok(ingress
        .spec
        .ok_or(Error::MissingData("spec"))?
        .rules
        .unwrap_or_default()
        .first()
        .ok_or(Error::MissingData("spec#rules[0]"))?
        .host
        .as_ref()
        .ok_or(Error::MissingData("spec#rules[0]#host"))?
        .clone())
}

pub async fn get_configuration() -> Result<Configuration> {
    Ok(Configuration {
        github_client_id: var("GITHUB_CLIENT_ID")?,
        session: SessionDefaults {
            base_image: var("WORKSPACE_BASE_IMAGE")?,
            duration: str_minutes_to_duration(&var("WORKSPACE_DEFAULT_DURATION")?)?,
            max_duration: str_minutes_to_duration(&var("WORKSPACE_MAX_DURATION")?)?,
            pool_affinity: var("WORKSPACE_DEFAULT_POOL_AFFINITY")?,
            max_sessions_per_pod: var("WORKSPACE_DEFAULT_MAX_PER_NODE")?
                .parse()
                .map_err(|err: ParseIntError| Error::Failure(err.into()))?,
        },
    })
}

pub async fn get_secrets() -> Result<Secrets> {
    Ok(Secrets {
        github_client_secret: var("GITHUB_CLIENT_SECRET")?,
    })
}

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
        path_type: "Prefix".to_string(),
        backend: IngressBackend {
            service: Some(IngressServiceBackend {
                name: service_name.to_string(),
                port: Some(ServiceBackendPort {
                    number: Some(service_port),
                    ..Default::default()
                }),
            }),
            ..Default::default()
        },
    }
}

pub fn str_minutes_to_duration(str: &str) -> Result<Duration> {
    Ok(Duration::from_secs(
        str.parse::<u64>()
            .map_err(|err| Error::Failure(err.into()))?
            * 60,
    ))
}

// Client utilities

fn config() -> Result<Config> {
    Config::from_cluster_env().map_err(|err| Error::Failure(err.into()))
}

pub fn client() -> Result<Client> {
    let config = config()?;
    Client::try_from(config).map_err(|err| Error::Failure(err.into()))
}

fn serialize<T: ?Sized>(value: &T) -> Result<String>
where
    T: Serialize,
{
    serde_yaml::to_string(&value).map_err(|err| Error::Failure(err.into()))
}

// ConfigMap utilities

//
// Gets the `name` ConfigMap value.
// Err if associated ConfigMap doesn't exist.
//
pub async fn get_config_map(client: &Client, name: &str) -> Result<BTreeMap<String, String>> {
    let config_map_api: Api<ConfigMap> = Api::default_namespaced(client.to_owned());
    config_map_api
        .get(name)
        .await
        .map_err(|err| Error::Failure(err.into())) // No config map
        .map(|o| o.data.unwrap_or_default()) // No data, return empty map
}

//
// Adds a value to a ConfigMap, specified by a `key`.
// Err if provided `key` doesn't exist or if associated ConfigMap doesn't exist.
//
// Equivalent to `kubectl patch configmap $name --type=json -p='[{"op": "add", "path": "/data/$key", "value": "$value"}]'`
pub async fn add_config_map_value(
    client: &Client,
    name: &str,
    key: &str,
    value: &str,
) -> Result<()> {
    let config_map_api: Api<ConfigMap> = Api::default_namespaced(client.to_owned());
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
// Err if provided `key` doesn't exist or if associated ConfigMap doesn't exist.
//
// Equivalent to `kubectl patch configmap $name --type=json -p='[{"op": "remove", "path": "/data/$key"}]'`
pub async fn delete_config_map_value(client: &Client, name: &str, key: &str) -> Result<()> {
    let config_map_api: Api<ConfigMap> = Api::default_namespaced(client.to_owned());
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

pub async fn current_pod_api() -> Result<Api<Pod>> {
    // GET name / namespace from en variable
    Err(Error::SessionIdAlreayUsed)
}
