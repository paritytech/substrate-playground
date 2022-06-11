//! Helper methods ton interact with k8s
use crate::{
    error::{Error, Result},
    types::{
        Configuration, RepositoryRuntimeConfiguration, RepositoryVersion, RepositoryVersionState,
    },
};
use k8s_openapi::api::core::v1::{
    Container, PersistentVolumeClaim, PersistentVolumeClaimSpec, PersistentVolumeClaimVolumeSource,
    Pod, PodSpec, ResourceRequirements, TypedLocalObjectReference, Volume, VolumeMount,
};
use k8s_openapi::apimachinery::pkg::{api::resource::Quantity, apis::meta::v1::ObjectMeta};
use kube::{
    api::{Api, PostParams},
    Resource,
};

use std::collections::BTreeMap;

const COMPONENT_WORKSPACE_VALUE: &str = "workspace";

pub fn pod_workspace_name(user: &str) -> String {
    format!("{}-{}", COMPONENT_WORKSPACE_VALUE, user)
}

pub fn service_workspace_name(workspace_id: &str) -> String {
    format!("{}-service-{}", COMPONENT_WORKSPACE_VALUE, workspace_id)
}

// Model

pub fn volume_name(workspace_id: &str, repository_id: &str) -> String {
    format!("volume-{}-{}", repository_id, workspace_id)
}

pub async fn get_volume(
    api: &Api<PersistentVolumeClaim>,
    name: &str,
) -> Result<PersistentVolumeClaim> {
    api.get(name).await.map_err(Error::K8sCommunicationFailure)
}

pub fn volume_template_name(repository_id: &str) -> String {
    format!("workspace-template-{}", repository_id)
}

// A volume claim created from a snapshot
// https://kubernetes.io/docs/concepts/storage/persistent-volumes/#volume-snapshot-and-restore-volume-from-snapshot-support
pub fn volume(workspace_id: &str, repository_id: &str) -> PersistentVolumeClaim {
    let mut requests = BTreeMap::new();
    requests.insert("storage".to_string(), Quantity("5Gi".to_string()));

    PersistentVolumeClaim {
        metadata: ObjectMeta {
            name: Some(volume_name(workspace_id, repository_id)),
            ..Default::default()
        },
        spec: Some(PersistentVolumeClaimSpec {
            access_modes: Some(vec!["ReadWriteOnce".to_string()]),
            resources: Some(ResourceRequirements {
                requests: Some(requests),
                ..Default::default()
            }),
            data_source: Some(TypedLocalObjectReference {
                api_group: Some("snapshot.storage.k8s.io".to_string()),
                kind: "PersistentVolumeClaim".to_string(),
                name: volume_template_name(repository_id),
            }),
            ..Default::default()
        }),
        ..Default::default()
    }
}
/*
fn volume_template(repository_id: &str) -> PersistentVolumeClaim {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(
        COMPONENT_LABEL.to_string(),
        COMPONENT_WORKSPACE_VALUE.to_string(),
    );

    let mut requests = BTreeMap::new();
    requests.insert("storage".to_string(), Quantity("5Gi".to_string()));

    PersistentVolumeClaim {
        metadata: ObjectMeta {
            name: Some(volume_template_name(repository_id)),
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
}*/

/*
async fn create_volume_template(
    api: &Api<PersistentVolumeClaim>,
    repository_id: &str,
) -> Result<PersistentVolumeClaim> {
    api.create(&PostParams::default(), &volume_template(repository_id))
        .await
        .map_err(|err| Error::Failure(err.into()))
}*/

pub async fn get_or_create_volume(
    api: &Api<PersistentVolumeClaim>,
    workspace_id: &str,
    repository_id: &str,
) -> Result<PersistentVolumeClaim> {
    let name = volume_name(workspace_id, repository_id);
    match get_volume(api, &name).await {
        Ok(res) => Ok(res),
        Err(_) => api
            .create(&PostParams::default(), &volume(workspace_id, repository_id))
            .await
            .map_err(Error::K8sCommunicationFailure),
    }
}

pub fn create_workspace_pod(
    conf: &Configuration,
    workspace_id: &str,
    runtime: &RepositoryRuntimeConfiguration,
    volume: &PersistentVolumeClaim,
) -> Result<Pod> {
    let volume_name = "repo".to_string();
    Ok(Pod {
        metadata: ObjectMeta {
            name: Some(pod_workspace_name(workspace_id)),
            ..Default::default()
        },
        spec: Some(PodSpec {
            containers: vec![Container {
                name: format!("{}-container", COMPONENT_WORKSPACE_VALUE),
                image: Some(
                    runtime
                        .clone()
                        .base_image
                        .unwrap_or_else(|| conf.session.base_image.clone()),
                ),
                volume_mounts: Some(vec![VolumeMount {
                    name: volume_name.clone(),
                    mount_path: "/workspace".to_string(),
                    ..Default::default()
                }]),
                ..Default::default()
            }],
            termination_grace_period_seconds: Some(1),
            volumes: Some(vec![Volume {
                name: volume_name,
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
            ..Default::default()
        }),
        ..Default::default()
    })
}

pub async fn get_repository_version(
    _repository_id: &str,
    _id: &str,
) -> Result<Option<RepositoryVersion>> {
    // TODO
    Ok(Some(RepositoryVersion {
        reference: "".to_string(),
        state: RepositoryVersionState::Ready {
            runtime: RepositoryRuntimeConfiguration {
                base_image: None,
                env: None,
                ports: None,
            },
        },
    }))
}
