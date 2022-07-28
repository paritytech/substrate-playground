pub mod pool;
pub mod repository;
pub mod role;
pub mod session;
pub mod user;
pub mod workspace;

use crate::{
    error::{Error, Result},
    types::{Configuration, Secrets, SessionDefaults},
    utils::var,
};
use json_patch::{AddOperation, PatchOperation, RemoveOperation};
use k8s_openapi::{
    api::{
        core::v1::{ConfigMap, EnvVar, Pod},
        networking::v1::{
            HTTPIngressPath, Ingress, IngressBackend, IngressServiceBackend, ServiceBackendPort,
        },
    },
    Metadata,
};
use kube::{
    api::{DeleteParams, ListParams, ObjectMeta, Patch, PatchParams},
    Api, Client, Config,
};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::{json, Value};
use std::{collections::BTreeMap, convert::TryFrom, fmt::Debug, time::Duration};

pub const HOSTNAME_LABEL: &str = "kubernetes.io/hostname";
pub const APP_LABEL: &str = "app.kubernetes.io/part-of";
pub const APP_VALUE: &str = "playground";
pub const OWNER_LABEL: &str = "app.kubernetes.io/owner";
pub const COMPONENT_LABEL: &str = "app.kubernetes.io/component";
pub const INSTANCE_TYPE_LABEL: &str = "node.kubernetes.io/instance-type";
pub const NODE_POOL_LABEL: &str = "app.playground/pool";
pub const NODE_POOL_TYPE_LABEL: &str = "app.playground/pool-type";
pub const INGRESS_NAME: &str = "ingress";

pub async fn get_host() -> Result<String> {
    let ingress_api: Api<Ingress> = default_namespaced_api()?;
    let ingress = ingress_api
        .get(INGRESS_NAME)
        .await
        .map_err(Error::K8sCommunicationFailure)?;
    Ok(ingress
        .spec
        .ok_or_else(|| Error::MissingConstraint("ingress".to_string(), "spec".to_string()))?
        .rules
        .unwrap_or_default()
        .first()
        .ok_or_else(|| {
            Error::MissingConstraint("ingress".to_string(), "spec#rules[0]".to_string())
        })?
        .host
        .as_ref()
        .ok_or_else(|| {
            Error::MissingConstraint("ingress".to_string(), "spec#rules[0]#host".to_string())
        })?
        .clone())
}

fn parse_user_roles(s: String) -> BTreeMap<String, String> {
    s.split(';')
        .map(|s| {
            let pair = s.split('=').collect::<Vec<&str>>();
            (
                String::from(*pair.get(0).unwrap_or(&"")),
                String::from(*pair.get(1).unwrap_or(&"")),
            )
        })
        .collect()
}

pub async fn get_configuration() -> Result<Configuration> {
    Ok(Configuration {
        github_client_id: var("GITHUB_CLIENT_ID")?,
        session: SessionDefaults {
            duration: str_minutes_to_duration(&var("SESSION_DEFAULT_DURATION")?)?,
            max_duration: str_minutes_to_duration(&var("SESSION_MAX_DURATION")?)?,
            pool_affinity: var("SESSION_DEFAULT_POOL_AFFINITY")?,
            max_sessions_per_pod: var("SESSION_DEFAULT_MAX_PER_NODE")?
                .parse()
                .map_err(|_err| Error::Failure("Failed to parse variable".to_string()))?,
        },
        user_roles: parse_user_roles(var("USER_ROLES")?),
    })
}

pub async fn get_secrets() -> Result<Secrets> {
    Ok(Secrets {
        github_client_secret: var("GITHUB_CLIENT_SECRET")?,
    })
}

/// Model utilities

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
            .map_err(|err| Error::Failure(err.to_string()))?
            * 60,
    ))
}

/// Client utilities

fn config() -> Result<Config> {
    Config::from_cluster_env().map_err(|err| Error::Failure(err.to_string()))
}

pub fn client() -> Result<Client> {
    let config = config()?;
    Client::try_from(config).map_err(Error::K8sCommunicationFailure)
}

pub async fn list_by_selector<K: Clone + DeserializeOwned + Debug>(
    api: &Api<K>,
    label_selector: &str,
) -> Result<Vec<K>> {
    api.list(&ListParams::default().labels(label_selector))
        .await
        .map(|l| l.items)
        .map_err(Error::K8sCommunicationFailure)
}

pub async fn backend_pod() -> Result<Pod> {
    pod_by_component_name("backend-api").await
}

pub async fn pod_by_component_name(name: &str) -> Result<Pod> {
    let api: Api<Pod> = default_namespaced_api()?;
    let pods = list_by_selector(
        &api,
        format!("app.kubernetes.io/component={}", name).as_str(),
    )
    .await?;
    if pods.len() > 1 {
        return Err(Error::Failure("Too many pods".to_string()));
    }
    match pods.get(0) {
        Some(pod) => Ok(pod.clone()),
        None => Err(Error::Failure("No pods".to_string())),
    }
}

pub fn docker_image_name(pod: &Pod) -> Result<String> {
    match &pod.spec {
        Some(spec) => spec
            .containers
            .get(0)
            .map(|container| {
                container
                    .image
                    .clone()
                    .ok_or_else(|| Error::Failure("No image defined".to_string()))
            })
            .ok_or_else(|| Error::Failure("No containers".to_string()))
            .flatten(),
        None => Err(Error::Failure("No spec".to_string())),
    }
}

pub fn user_namespace(user_id: &str) -> String {
    user_id.to_lowercase()
}

/// ConfigMap utilities

//
// Gets the `name` ConfigMap value.
// Err if associated ConfigMap doesn't exist.
//
pub async fn get_config_map(client: &Client, name: &str) -> Result<BTreeMap<String, String>> {
    let config_map_api: Api<ConfigMap> = Api::default_namespaced(client.to_owned());
    config_map_api
        .get(name)
        .await
        .map_err(Error::K8sCommunicationFailure) // No config map
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

    println!("Creating config map");
    // Ensure that `data` exists, if `name` itself exists
    if let Some(config_map) = config_map_api.get_opt(name).await? {
        println!(" config map exists");
        if config_map.data.is_none() {
            println!("data config map empty");
            let data_patch: Patch<json_patch::Patch> =
                Patch::Json(json_patch::Patch(vec![PatchOperation::Add(AddOperation {
                    path: "/data".to_string(),
                    value: json!(value),
                })]));
            config_map_api
                .patch(name, &PatchParams::default(), &data_patch)
                .await
                .map_err(Error::K8sCommunicationFailure)?;
            println!("Done");
        }
    }

    let patch: Patch<json_patch::Patch> =
        Patch::Json(json_patch::Patch(vec![PatchOperation::Add(AddOperation {
            path: format!("/data/{}", key),
            value: json!(value),
        })]));
    config_map_api
        .patch(name, &PatchParams::default(), &patch)
        .await
        .map_err(Error::K8sCommunicationFailure)?;
    Ok(())
}

//
// Deletes a value from a ConfigMap, specified by a `key`.
// Err if provided `key` doesn't exist or if associated ConfigMap doesn't exist.
//
// Equivalent to `kubectl patch configmap $name --type=json -p='[{"op": "remove", "path": "/data/$key"}]'`
pub async fn delete_config_map_value(client: &Client, name: &str, key: &str) -> Result<()> {
    let config_map_api: Api<ConfigMap> = Api::default_namespaced(client.to_owned());
    let patch: Patch<json_patch::Patch> =
        Patch::Json(json_patch::Patch(vec![PatchOperation::Remove(
            RemoveOperation {
                path: format!("/data/{}", key),
            },
        )]));
    config_map_api
        .patch(name, &PatchParams::default(), &patch)
        .await
        .map_err(Error::K8sCommunicationFailure)?;
    Ok(())
}

pub async fn update_annotation_value<K: Clone + DeserializeOwned + Debug>(
    api: &Api<K>,
    id: &str,
    name: &str,
    value: Value,
) -> Result<()> {
    update_value(api, id, format!("/metadata/annotations/{}", name), value).await
}

pub async fn update_label_value<K: Clone + DeserializeOwned + Debug>(
    api: &Api<K>,
    id: &str,
    name: &str,
    value: Value,
) -> Result<()> {
    update_value(api, id, format!("/metadata/labels/{}", name), value).await
}

pub async fn update_value<K: Clone + DeserializeOwned + Debug>(
    api: &Api<K>,
    id: &str,
    path: String,
    value: Value,
) -> Result<()> {
    let patch: Patch<json_patch::Patch> =
        Patch::Json(json_patch::Patch(vec![PatchOperation::Add(AddOperation {
            path,
            value,
        })]));
    api.patch(id, &PatchParams::default(), &patch)
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    Ok(())
}

/// Resource utilities

fn serialize_json<T>(value: &T) -> Result<String>
where
    T: ?Sized + Serialize,
{
    serde_json::to_string(&value).map_err(|err| Error::Failure(err.to_string()))
}

fn unserialize_json<T>(s: &str) -> Result<T>
where
    T: DeserializeOwned,
{
    serde_json::from_str(s).map_err(|err| Error::Failure(err.to_string()))
}

fn unserialize_yaml<T>(s: &str) -> Result<T>
where
    T: DeserializeOwned,
{
    serde_yaml::from_str(s).map_err(|err| Error::Failure(err.to_string()))
}

pub async fn get_resource_from_config_map<T>(
    client: &Client,
    id: &str,
    config_map_name: &str,
) -> Result<Option<T>>
where
    T: DeserializeOwned,
{
    let resources = get_config_map(client, config_map_name).await?;
    match resources.get(id).map(|resource| unserialize_yaml(resource)) {
        Some(resource) => resource.map(Some),
        None => Ok(None),
    }
}

pub async fn list_resources_from_config_map<T>(
    client: &Client,
    config_map_name: &str,
) -> Result<Vec<T>>
where
    T: DeserializeOwned,
{
    Ok(get_config_map(client, config_map_name)
        .await?
        .into_iter()
        .flat_map(|(_k, v)| unserialize_yaml::<T>(&v))
        .collect())
}

pub async fn store_resource_as_config_map<T>(
    client: &Client,
    id: &str,
    resource: &T,
    config_map_name: &str,
) -> Result<()>
where
    T: ?Sized + Serialize,
{
    // TODO if data not present, add it

    add_config_map_value(
        client,
        config_map_name,
        id,
        serialize_json(resource)?.as_str(),
    )
    .await
}

/// Resources

fn all_namespaces_api<T>() -> Result<Api<T>>
where
    T: Clone + std::fmt::Debug + DeserializeOwned + Metadata,
    T: Default,
    T: Metadata<Ty = ObjectMeta>,
{
    let client = client()?;
    Ok(Api::all(client))
}

fn default_namespaced_api<T>() -> Result<Api<T>>
where
    T: Clone + std::fmt::Debug + DeserializeOwned + Metadata,
    T: Default,
    T: Metadata<Ty = ObjectMeta>,
{
    let client = client()?;
    Ok(Api::default_namespaced(client))
}

fn user_namespaced_api<T>(owner_id: &str) -> Result<Api<T>>
where
    T: Clone + std::fmt::Debug + DeserializeOwned + Metadata,
    T: Default,
    T: Metadata<Ty = ObjectMeta>,
{
    let client = client()?;
    Ok(Api::namespaced(client, &user_namespace(owner_id)))
}

// Get

pub async fn get_default_resource<T, U>(
    resource_id: &str,
    f: fn(t: &T) -> Result<U>,
) -> Result<Option<U>>
where
    T: Clone + std::fmt::Debug + DeserializeOwned + Metadata,
    T: Default,
    T: Metadata<Ty = ObjectMeta>,
{
    let api: Api<T> = default_namespaced_api()?;
    get_resource(api, resource_id, f).await
}

// Introduce Resource trait, rely on creation_timestamp

pub async fn get_owned_resource<T, U>(
    owner_id: &str,
    resource_id: &str,
    f: fn(t: &T) -> Result<U>,
) -> Result<Option<U>>
where
    T: Clone + std::fmt::Debug + DeserializeOwned + Metadata,
    T: Default,
    T: Metadata<Ty = ObjectMeta>,
{
    let api: Api<T> = user_namespaced_api(owner_id)?;
    get_resource(api, resource_id, f).await
}

async fn get_resource<T, U>(
    api: Api<T>,
    resource_id: &str,
    f: fn(t: &T) -> Result<U>,
) -> Result<Option<U>>
where
    T: Clone + std::fmt::Debug + DeserializeOwned + Metadata,
    T: Default,
    T: Metadata<Ty = ObjectMeta>,
{
    let resource = api
        .get_opt(resource_id)
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    match resource {
        Some(resource) => f(&resource).map(Some),
        None => Ok(None),
    }
}

// List

pub async fn list_all_resources<T, U>(
    resource_type: &str,
    f: fn(t: &T) -> Result<U>,
) -> Result<Vec<U>>
where
    T: Clone + std::fmt::Debug + DeserializeOwned + Metadata,
    T: Default,
    T: Metadata<Ty = ObjectMeta>,
{
    let api: Api<T> = all_namespaces_api()?;
    list_resources(api, resource_type, f).await
}

pub async fn list_default_resources<T, U>(
    resource_type: &str,
    f: fn(t: &T) -> Result<U>,
) -> Result<Vec<U>>
where
    T: Clone + std::fmt::Debug + DeserializeOwned + Metadata,
    T: Default,
    T: Metadata<Ty = ObjectMeta>,
{
    let api: Api<T> = default_namespaced_api()?;
    list_resources(api, resource_type, f).await
}

pub async fn list_owned_resources<T, U>(
    owner_id: &str,
    resource_type: &str,
    f: fn(t: &T) -> Result<U>,
) -> Result<Vec<U>>
where
    T: Clone + std::fmt::Debug + DeserializeOwned + Metadata,
    T: Default,
    T: Metadata<Ty = ObjectMeta>,
{
    let api: Api<T> = user_namespaced_api(owner_id)?;
    list_resources(api, resource_type, f).await
}

pub async fn list_resources<T, U>(
    api: Api<T>,
    resource_type: &str,
    f: fn(t: &T) -> Result<U>,
) -> Result<Vec<U>>
where
    T: Clone + std::fmt::Debug + DeserializeOwned + Metadata,
    T: Default,
    T: Metadata<Ty = ObjectMeta>,
{
    let resources = list_by_selector(
        &api,
        format!("{}={}", COMPONENT_LABEL, resource_type).as_str(),
    )
    .await?;

    Ok(resources
        .iter()
        .filter_map(|resource| match f(resource) {
            Ok(resource) => Some(resource),
            Err(err) => {
                log::error!("Failed to convert: {}", err);

                None
            }
        })
        .collect())
}

// Delete

pub async fn delete_default_resource<T>(resource_id: &str) -> Result<()>
where
    T: Clone + std::fmt::Debug + DeserializeOwned + Metadata,
    T: Default,
    T: Metadata<Ty = ObjectMeta>,
{
    let api: Api<T> = default_namespaced_api()?;
    delete_resource(api, resource_id).await
}

pub async fn delete_owned_resource<T>(owner_id: &str, resource_id: &str) -> Result<()>
where
    T: Clone + std::fmt::Debug + DeserializeOwned + Metadata,
    T: Default,
    T: Metadata<Ty = ObjectMeta>,
{
    let api: Api<T> = user_namespaced_api(owner_id)?;
    delete_resource(api, resource_id).await
}

async fn delete_resource<T>(api: Api<T>, resource_id: &str) -> Result<()>
where
    T: Clone + std::fmt::Debug + DeserializeOwned + Metadata,
    T: Default,
    T: Metadata<Ty = ObjectMeta>,
{
    api.delete(resource_id, &DeleteParams::default())
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    Ok(())
}
