//! Helper methods ton interact with k8s
use crate::{
    error::{Error, Result},
    types::{
        Repository, RepositoryConfiguration, RepositoryUpdateConfiguration, RepositoryVersion,
        RepositoryVersionState, ResourceType,
    },
};
use k8s_openapi::api::core::v1::{PersistentVolume, PersistentVolumeSpec};
use k8s_openapi::apimachinery::pkg::{api::resource::Quantity, apis::meta::v1::ObjectMeta};
use kube::{
    api::{Api, DeleteParams, PostParams},
    Resource,
};
use serde_json::from_str;
use std::collections::BTreeMap;

use super::{
    client, delete_config_map_value, get_resource_from_config_map, list_by_selector,
    list_resources_from_config_map, serialize, store_resource_as_config_map, unserialize,
    update_annotation_value, APP_LABEL, APP_VALUE, COMPONENT_LABEL,
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
        .ok_or_else(|| Error::UnknownResource(ResourceType::Repository, id.to_string()))?;
    repository.current_version = conf.current_version;

    store_resource_as_config_map(&client, &repository.id, &repository, CONFIG_MAP).await
}

pub async fn delete_repository(id: &str) -> Result<()> {
    let client = client()?;
    delete_config_map_value(&client, CONFIG_MAP, id).await
}

// Repository versions

fn volume_template(
    volume_template_name: &str,
    repository_id: &str,
    repository_version_id: &str,
) -> PersistentVolume {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_TYPE.to_string());
    labels.insert(REPOSITORY_LABEL.to_string(), repository_id.to_string());
    labels.insert(
        REPOSITORY_VERSION_LABEL.to_string(),
        repository_version_id.to_string(),
    );

    let mut capacities = BTreeMap::new();
    capacities.insert("storage".to_string(), Quantity("5Gi".to_string()));

    PersistentVolume {
        metadata: ObjectMeta {
            name: Some(volume_template_name.to_string()),
            labels: Some(labels),
            ..Default::default()
        },
        spec: Some(PersistentVolumeSpec {
            access_modes: Some(vec!["ReadWriteOnce".to_string()]),
            capacity: Some(capacities),
            ..Default::default()
        }),
        ..Default::default()
    }
}

fn volume_template_name(repository_id: &str, repository_version_id: &str) -> String {
    format!(
        "volume-template-{}-{}",
        repository_id, repository_version_id
    )
}

async fn create_volume_template(
    api: &Api<PersistentVolume>,
    volume_template_name: &str,
    repository_id: &str,
    repository_version_id: &str,
) -> Result<PersistentVolume> {
    api.create(
        &PostParams::default(),
        &volume_template(volume_template_name, repository_id, repository_version_id),
    )
    .await
    .map_err(Error::K8sCommunicationFailure)
}

pub async fn update_repository_version_state(
    user_id: &str,
    repository_id: &str,
    repository_version_id: &str,
    repository_version_state: &RepositoryVersionState,
) -> Result<()> {
    let client = client()?;
    let persistent_volume_api: Api<PersistentVolume> = Api::namespaced(client.clone(), user_id);
    let volume_template_name = volume_template_name(repository_id, repository_version_id);

    update_annotation_value(
        &persistent_volume_api,
        &volume_template_name,
        REPOSITORY_VERSION_STATE_ANNOTATION.to_string(),
        serialize(repository_version_state)
            .and_then(|s| from_str(&s).map_err(|err| Error::Failure(err.to_string())))?,
    )
    .await
}

fn persistent_volume_to_repository_version(
    persistent_volume: &PersistentVolume,
) -> Result<RepositoryVersion> {
    let labels = persistent_volume.meta().labels.clone().unwrap_or_default();
    match labels
        .get(REPOSITORY_VERSION_STATE_ANNOTATION)
        .map(|s| unserialize(s))
    {
        Some(Ok(state)) => Ok(RepositoryVersion {
            id: labels
                .get(REPOSITORY_VERSION_LABEL)
                .cloned()
                .unwrap_or_else(|| "CAN'T HAPPEN".to_string()),
            state,
        }),
        _ => Err(Error::Failure(
            "Failed to access RepositoryVersion state".to_string(),
        )),
    }
}

async fn get_persistent_volume(
    persistent_volume_api: &Api<PersistentVolume>,
    repository_id: &str,
    id: &str,
) -> Result<Option<PersistentVolume>> {
    persistent_volume_api
        .get_opt(&volume_template_name(repository_id, id))
        .await
        .map_err(Error::K8sCommunicationFailure)
}

pub async fn get_repository_version(
    user_id: &str,
    repository_id: &str,
    id: &str,
) -> Result<Option<RepositoryVersion>> {
    let client = client()?;
    let persistent_volume_api: Api<PersistentVolume> = Api::namespaced(client.clone(), user_id);
    let persistent_volume =
        get_persistent_volume(&persistent_volume_api, repository_id, id).await?;

    match persistent_volume.and_then(|persistent_volume| {
        persistent_volume_to_repository_version(&persistent_volume).ok()
    }) {
        Some(session) => Ok(Some(session)),
        None => Ok(None),
    }
}

pub async fn list_repository_versions(
    user_id: &str,
    repository_id: &str,
) -> Result<Vec<RepositoryVersion>> {
    let client = client()?;
    let persistent_volume_api: Api<PersistentVolume> = Api::namespaced(client.clone(), user_id);
    let persistent_volumes = list_by_selector(
        &persistent_volume_api,
        format!("{}={}", REPOSITORY_LABEL, repository_id).to_string(),
    )
    .await?;

    Ok(persistent_volumes
        .into_iter()
        .flat_map(|p| persistent_volume_to_repository_version(&p))
        .collect())
}

pub async fn create_repository_version(user_id: &str, repository_id: &str, id: &str) -> Result<()> {
    let client = client()?;

    // Create volume
    let volume_api: Api<PersistentVolume> = Api::namespaced(client.clone(), user_id);
    let volume_template_name = volume_template_name(repository_id, id);
    let _volume =
        create_volume_template(&volume_api, &volume_template_name, repository_id, id).await?;

    // TODO remove, for test only
    update_repository_version_state(
        user_id,
        repository_id,
        id,
        &RepositoryVersionState::Ready {
            devcontainer_json:
                "{customizations: {substrate-playground: {tags: {public: \"true\"}}}}".to_string(),
        },
    )
    .await?;

    // TODO move to builder. Only do it build is successful
    // Update current version so that it matches this newly created version
    update_repository(
        repository_id,
        RepositoryUpdateConfiguration {
            current_version: Some(id.to_string()),
        },
    )
    .await?;

    /*let job_api: Api<Job> = Api::default_namespaced(client.clone());
        let job = Job {
            metadata: ObjectMeta {
                name: Some(format!("builder-{}-{}", repository_id, id)),
                ..Default::default()
            },
            spec: Some(JobSpec {
                ttl_seconds_after_finished: Some(0),
                backoff_limit: Some(1),
                template: PodTemplateSpec {
                    spec: Some(PodSpec {
                        volumes: Some(vec![Volume {
                            name: volume_template_name.clone(),
                            persistent_volume_claim: Some(PersistentVolumeClaimVolumeSource {
                                claim_name: volume
                                    .meta()
                                    .clone()
                                    .name
                                    .ok_or(Error::MissingData("meta#name"))?,
                                ..Default::default()
                            }),
                            ..Default::default()
                        }]),
                        restart_policy: Some("OnFailure".to_string()),
                        containers: vec![Container {
                            name: "builder".to_string(),
                            image: Some(
                                // TODO programmatically fetch from current image
                                "paritytech/substrate-playground-backend-api:latest".to_string(),
                            ),
                            command: Some(vec!["builder".to_string()]),
                            args: Some(vec![repository_id.to_string()]),
                            volume_mounts: Some(vec![VolumeMount {
                                name: volume_template_name,
                                mount_path: "/".to_string(),
                                ..Default::default()
                            }]),
                            ..Default::default()
                        }],
                        ..Default::default()
                    }),
                    ..Default::default()
                },
                ..Default::default()
            }),
            ..Default::default()
        };
        job_api
            .create(&PostParams::default(), &job)
            .await
            .map_err(Error::K8sCommunicationFailure)?;
    */
    Ok(())
}

pub async fn delete_repository_version(user_id: &str, repository_id: &str, id: &str) -> Result<()> {
    let client = client()?;
    let persistent_volume_api: Api<PersistentVolume> = Api::namespaced(client.clone(), user_id);
    persistent_volume_api
        .delete(
            &volume_template_name(repository_id, id),
            &DeleteParams::default().grace_period(0),
        )
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    Ok(())
}
