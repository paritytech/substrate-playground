//! Helper methods ton interact with k8s
use crate::{
    error::{Error, ResourceError, Result},
    types::{
        Repository, RepositoryConfiguration, RepositoryUpdateConfiguration, RepositoryVersion,
        RepositoryVersionState, ResourceType,
    },
};
use k8s_openapi::api::core::v1::{
    Container, PersistentVolumeClaim, PersistentVolumeClaimSpec, PersistentVolumeClaimVolumeSource,
    Pod, PodSpec, ResourceRequirements, Volume, VolumeMount,
};
use k8s_openapi::apimachinery::pkg::{api::resource::Quantity, apis::meta::v1::ObjectMeta};
use kube::{
    api::{Api, DeleteParams, PostParams},
    ResourceExt,
};
use log::warn;
use serde_json::json;
use std::collections::BTreeMap;

use super::{
    backend_pod, client, delete_config_map_value, docker_image_name, get_resource_from_config_map,
    list_by_selector, list_resources_from_config_map, serialize_json, store_resource_as_config_map,
    unserialize_json, update_annotation_value, APP_LABEL, APP_VALUE, COMPONENT_LABEL,
};

const REPOSITORY_LABEL: &str = "REPOSITORY_LABEL";
const REPOSITORY_VERSION_LABEL: &str = "REPOSITORY_VERSION_LABEL";
const REPOSITORY_VERSION_STATE_ANNOTATION: &str = "REPOSITORY_VERSION_STATE_LABEL";
const COMPONENT_TYPE: &str = "volume-template";
const CONFIG_MAP: &str = "playground-repositories";

pub async fn get_repository(id: &str) -> Result<Option<Repository>> {
    let client = client()?;
    get_resource_from_config_map(&client, id, CONFIG_MAP).await
}

pub async fn list_repositories() -> Result<Vec<Repository>> {
    let client = client()?;
    list_resources_from_config_map(&client, CONFIG_MAP).await
}

pub async fn create_repository(id: &str, conf: RepositoryConfiguration) -> Result<()> {
    if get_repository(id).await?.is_some() {
        return Err(Error::Resource(ResourceError::Unknown(
            ResourceType::Repository,
            id.to_string(),
        )));
    }

    let client = client()?;

    let repository = Repository {
        id: id.to_string(),
        url: conf.url,
        current_version: None,
    };

    store_resource_as_config_map(&client, &repository.id, &repository, CONFIG_MAP).await
}

pub async fn update_repository(id: &str, conf: RepositoryUpdateConfiguration) -> Result<()> {
    let client = client()?;

    let mut repository: Repository = get_resource_from_config_map(&client, id, CONFIG_MAP)
        .await?
        .ok_or_else(|| {
            Error::Resource(ResourceError::Unknown(
                ResourceType::Repository,
                id.to_string(),
            ))
        })?;
    repository.current_version = conf.current_version;

    store_resource_as_config_map(&client, &repository.id, &repository, CONFIG_MAP).await
}

pub async fn delete_repository(id: &str) -> Result<()> {
    let client = client()?;

    get_repository(id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(
            ResourceType::Repository,
            id.to_string(),
        ))
    })?;

    delete_config_map_value(&client, CONFIG_MAP, id).await
}

// Repository versions

fn volume_template(
    volume_template_name: &str,
    repository_id: &str,
    repository_version_id: &str,
) -> PersistentVolumeClaim {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_TYPE.to_string());
    labels.insert(REPOSITORY_LABEL.to_string(), repository_id.to_string());
    labels.insert(
        REPOSITORY_VERSION_LABEL.to_string(),
        repository_version_id.to_string(),
    );

    let mut annotations = BTreeMap::new();
    annotations.insert(
        REPOSITORY_VERSION_STATE_ANNOTATION.to_string(),
        json!(RepositoryVersionState::Init).to_string(),
    );

    let mut requests = BTreeMap::new();
    requests.insert("storage".to_string(), Quantity("15Gi".to_string()));

    PersistentVolumeClaim {
        metadata: ObjectMeta {
            name: Some(volume_template_name.to_string()),
            annotations: Some(annotations),
            labels: Some(labels),
            ..Default::default()
        },
        spec: Some(PersistentVolumeClaimSpec {
            access_modes: Some(vec!["ReadWriteOnce".to_string()]),
            resources: Some(ResourceRequirements {
                requests: Some(requests),
                ..Default::default()
            }),
            ..Default::default()
        }),
        ..Default::default()
    }
}

pub fn volume_template_name(repository_id: &str, repository_version_id: &str) -> String {
    format!("{}-{}", repository_id, repository_version_id)
}

async fn create_volume_template(
    api: &Api<PersistentVolumeClaim>,
    volume_template_name: &str,
    repository_id: &str,
    repository_version_id: &str,
) -> Result<PersistentVolumeClaim> {
    api.create(
        &PostParams::default(),
        &volume_template(volume_template_name, repository_id, repository_version_id),
    )
    .await
    .map_err(Error::K8sCommunicationFailure)
}

pub async fn update_repository_version_state(
    repository_id: &str,
    repository_version_id: &str,
    repository_version_state: &RepositoryVersionState,
) -> Result<()> {
    let client = client()?;
    let persistent_volume_api: Api<PersistentVolumeClaim> = Api::default_namespaced(client.clone());
    let volume_template_name = volume_template_name(repository_id, repository_version_id);
    let state = serialize_json(repository_version_state)?;
    update_annotation_value(
        &persistent_volume_api,
        &volume_template_name,
        REPOSITORY_VERSION_STATE_ANNOTATION,
        json!(state),
    )
    .await
}

fn persistent_volume_to_repository_version(
    persistent_volume: &PersistentVolumeClaim,
) -> Result<RepositoryVersion> {
    match persistent_volume
        .annotations()
        .get(REPOSITORY_VERSION_STATE_ANNOTATION)
        .map(|s| unserialize_json(s))
    {
        Some(Ok(state)) => Ok(RepositoryVersion {
            id: persistent_volume
                .labels()
                .get(REPOSITORY_VERSION_LABEL)
                .cloned()
                .unwrap_or_else(|| "CAN'T HAPPEN".to_string()),
            state,
        }),
        Some(Err(err)) => Err(Error::Failure(format!(
            "Failed to unserialize RepositoryVersion state: {}",
            err
        ))),
        None => Err(Error::Failure(
            "Failed to access RepositoryVersion state".to_string(),
        )),
    }
}

async fn get_persistent_volume(
    persistent_volume_api: &Api<PersistentVolumeClaim>,
    repository_id: &str,
    id: &str,
) -> Result<Option<PersistentVolumeClaim>> {
    persistent_volume_api
        .get_opt(&volume_template_name(repository_id, id))
        .await
        .map_err(Error::K8sCommunicationFailure)
}

pub async fn get_repository_version(
    repository_id: &str,
    id: &str,
) -> Result<Option<RepositoryVersion>> {
    let client = client()?;

    get_repository(repository_id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(
            ResourceType::Repository,
            id.to_string(),
        ))
    })?;

    let persistent_volume_api: Api<PersistentVolumeClaim> = Api::default_namespaced(client.clone());
    let persistent_volume =
        get_persistent_volume(&persistent_volume_api, repository_id, id).await?;

    // TODO also check job ?
    match persistent_volume {
        Some(persistent_volume) => {
            match persistent_volume_to_repository_version(&persistent_volume) {
                Ok(repository_version) => Ok(Some(repository_version)),
                Err(err) => Err(err),
            }
        }
        None => Ok(None),
    }
}

pub async fn list_repository_versions(repository_id: &str) -> Result<Vec<RepositoryVersion>> {
    let client = client()?;
    let persistent_volume_api: Api<PersistentVolumeClaim> = Api::default_namespaced(client.clone());
    let persistent_volumes = list_by_selector(
        &persistent_volume_api,
        format!("{}={}", REPOSITORY_LABEL, repository_id).as_str(),
    )
    .await?;
    Ok(persistent_volumes
        .into_iter()
        .flat_map(|p| match persistent_volume_to_repository_version(&p) {
            Ok(repository_version) => Ok(repository_version),
            Err(err) => {
                warn!("Failed to convert RepositoryVersion: {}", err);

                Err(err)
            }
        })
        .collect())
}

pub async fn create_repository_version(repository_id: &str, id: &str) -> Result<()> {
    let repository = get_repository(repository_id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(
            ResourceType::Repository,
            id.to_string(),
        ))
    })?;

    if get_repository_version(repository_id, id).await?.is_some() {
        return Err(Error::Resource(ResourceError::IdAlreayUsed(
            ResourceType::RepositoryVersion,
            id.to_string(),
        )));
    }

    let client = client()?;
    // Create volume
    let volume_api: Api<PersistentVolumeClaim> = Api::default_namespaced(client.clone());
    let volume_template_name = volume_template_name(repository_id, id);

    let _volume =
        create_volume_template(&volume_api, &volume_template_name, repository_id, id).await?;

    //let job_api: Api<Job> = Api::default_namespaced(client.clone());
    let pod = Pod {
        metadata: ObjectMeta {
            generate_name: Some(format!("builder-{}-", repository_id)),
            ..Default::default()
        },
        spec: Some(PodSpec {
            service_account_name: Some("backend-service-account".to_string()),
            volumes: Some(vec![Volume {
                name: volume_template_name.clone(),
                persistent_volume_claim: Some(PersistentVolumeClaimVolumeSource {
                    claim_name: volume_template_name.clone(),
                    ..Default::default()
                }),
                ..Default::default()
            }]),
            restart_policy: Some("Never".to_string()),
            // An init container copy the builder command to /workspaces
            init_containers: Some(vec![Container {
                name: "copy-builder".to_string(),
                image: Some(docker_image_name(&backend_pod().await?)?),
                command: Some(vec![
                    "sh".to_string(),
                    "-c".to_string(),
                    format!("cp /opt/target/release/builder /workspaces/builder && git clone --depth 1 {} /workspaces/.clone", repository.url),
                ]),
                volume_mounts: Some(vec![VolumeMount {
                    name: volume_template_name.clone(),
                    mount_path: "/workspaces".to_string(),
                    ..Default::default()
                }]),
                ..Default::default()
            }]),
            containers: vec![Container {
                name: "builder".to_string(),
                image: Some("paritytech/ci-linux:staging".to_string()), // TODO fetch devcontainer from repo, https://docs.github.com/en/rest/repos/contents
                command: Some(vec!["/workspaces/builder".to_string()]),
                args: Some(vec![
                    "-r".to_string(),
                    repository_id.to_string(),
                    "-i".to_string(),
                    id.to_string(),
                ]),
                volume_mounts: Some(vec![VolumeMount {
                    name: volume_template_name,
                    mount_path: "/workspaces".to_string(),
                    ..Default::default()
                }]),
                ..Default::default()
            }],
            ..Default::default()
        }),
        ..Default::default()
    };
    let job_api: Api<Pod> = Api::default_namespaced(client.clone());
    job_api
        .create(&PostParams::default(), &pod)
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    Ok(())
}

pub async fn delete_repository_version(repository_id: &str, id: &str) -> Result<()> {
    let client = client()?;

    get_repository_version(repository_id, id)
        .await?
        .ok_or_else(|| {
            Error::Resource(ResourceError::Unknown(
                ResourceType::RepositoryVersion,
                id.to_string(),
            ))
        })?;

    let persistent_volume_api: Api<PersistentVolumeClaim> = Api::default_namespaced(client.clone());
    persistent_volume_api
        .delete(
            &volume_template_name(repository_id, id),
            &DeleteParams::default().grace_period(0),
        )
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    Ok(())
}
