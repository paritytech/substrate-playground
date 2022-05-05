//! Helper methods ton interact with k8s
use crate::{
    error::{Error, Result},
    types::{
        self, Configuration, LoggedUser, Port, RepositoryDetails, RepositoryRuntimeConfiguration,
        RepositoryVersion, RepositoryVersionState, Workspace, WorkspaceConfiguration,
        WorkspaceState, WorkspaceUpdateConfiguration,
    },
};
use json_patch::{AddOperation, PatchOperation};
use k8s_openapi::api::{
    core::v1::{
        Affinity, Container, EnvVar, NodeAffinity, NodeSelectorRequirement, NodeSelectorTerm,
        PersistentVolumeClaim, PersistentVolumeClaimSpec, PersistentVolumeClaimVolumeSource, Pod,
        PodSpec, PreferredSchedulingTerm, ResourceRequirements, Service, ServicePort, ServiceSpec,
        TypedLocalObjectReference, Volume, VolumeMount,
    },
    networking::v1::{Ingress, IngressRule},
};
use k8s_openapi::apimachinery::pkg::{
    api::resource::Quantity, apis::meta::v1::ObjectMeta, util::intstr::IntOrString,
};
use kube::{
    api::{Api, DeleteParams, Patch, PatchParams, PostParams},
    Resource,
};

use serde_json::json;
use std::{collections::BTreeMap, time::Duration};

use super::{client, env_var, list_by_selector, pool::get_pool};

const NODE_POOL_LABEL: &str = "app.playground/pool";
const APP_LABEL: &str = "app.kubernetes.io/part-of";
const APP_VALUE: &str = "playground";
const COMPONENT_LABEL: &str = "app.kubernetes.io/component";

const COMPONENT_WORKSPACE_VALUE: &str = "workspace";

const OWNER_LABEL: &str = "app.kubernetes.io/owner";
const INGRESS_NAME: &str = "ingress";
const WORKSPACE_DURATION_ANNOTATION: &str = "playground.substrate.io/workspace_duration";
const THEIA_WEB_PORT: i32 = 3000;

pub fn pod_workspace_name(user: &str) -> String {
    format!("{}-{}", COMPONENT_WORKSPACE_VALUE, user)
}

pub fn service_workspace_name(workspace_id: &str) -> String {
    format!("{}-service-{}", COMPONENT_WORKSPACE_VALUE, workspace_id)
}

// Model

fn pod_env_variables(conf: &RepositoryRuntimeConfiguration, workspace_id: &str) -> Vec<EnvVar> {
    let mut envs = vec![
        env_var("SUBSTRATE_PLAYGROUND", ""),
        env_var("SUBSTRATE_PLAYGROUND_WORKSPACE", workspace_id),
    ];
    if let Some(mut runtime_envs) = conf.env.clone().map(|envs| {
        envs.iter()
            .map(|env| env_var(&env.name, &env.value))
            .collect::<Vec<EnvVar>>()
    }) {
        envs.append(&mut runtime_envs);
    };
    envs
}

// TODO detect when ingress is restarted, then re-sync theia workspaces

fn workspace_duration_annotation(duration: Duration) -> String {
    let duration_min = duration.as_secs() / 60;
    duration_min.to_string()
}

fn str_minutes_to_duration(str: &str) -> Result<Duration> {
    Ok(Duration::from_secs(
        str.parse::<u64>()
            .map_err(|err| Error::Failure(err.into()))?
            * 60,
    ))
}

fn create_pod_workspace_annotations(duration: &Duration) -> Result<BTreeMap<String, String>> {
    let mut annotations = BTreeMap::new();
    annotations.insert(
        WORKSPACE_DURATION_ANNOTATION.to_string(),
        workspace_duration_annotation(*duration),
    );
    Ok(annotations)
}

fn volume_name(workspace_id: &str, repository_id: &str) -> String {
    format!("volume-{}-{}", repository_id, workspace_id)
}

async fn get_volume(api: &Api<PersistentVolumeClaim>, name: &str) -> Result<PersistentVolumeClaim> {
    api.get(name)
        .await
        .map_err(|err| Error::Failure(err.into()))
}

fn volume_template_name(repository_id: &str) -> String {
    format!("workspace-template-{}", repository_id)
}

// A volume claim created from a snapshot
// https://kubernetes.io/docs/concepts/storage/persistent-volumes/#volume-snapshot-and-restore-volume-from-snapshot-support
fn volume(workspace_id: &str, repository_id: &str) -> PersistentVolumeClaim {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(
        COMPONENT_LABEL.to_string(),
        COMPONENT_WORKSPACE_VALUE.to_string(),
    );
    labels.insert(OWNER_LABEL.to_string(), workspace_id.to_string());

    let mut requests = BTreeMap::new();
    requests.insert("storage".to_string(), Quantity("5Gi".to_string()));

    PersistentVolumeClaim {
        metadata: ObjectMeta {
            name: Some(volume_name(workspace_id, repository_id)),
            labels: Some(labels),
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

fn running_or_pending_workspaces(workspaces: Vec<Workspace>) -> Vec<Workspace> {
    workspaces
        .into_iter()
        .filter(|workspace| {
            matches!(
                &workspace.state,
                WorkspaceState::Running { .. } | WorkspaceState::Deploying
            )
        })
        .collect()
}
/*
async fn create_volume_template(
    api: &Api<PersistentVolumeClaim>,
    repository_id: &str,
) -> Result<PersistentVolumeClaim> {
    api.create(&PostParams::default(), &volume_template(repository_id))
        .await
        .map_err(|err| Error::Failure(err.into()))
}*/

async fn get_or_create_volume(
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
            .map_err(|err| Error::Failure(err.into())),
    }
}

fn create_workspace_pod(
    conf: &Configuration,
    workspace_id: &str,
    runtime: &RepositoryRuntimeConfiguration,
    duration: &Duration,
    pool_id: &str,
    volume: &PersistentVolumeClaim,
) -> Result<Pod> {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(
        COMPONENT_LABEL.to_string(),
        COMPONENT_WORKSPACE_VALUE.to_string(),
    );
    labels.insert(OWNER_LABEL.to_string(), workspace_id.to_string());

    let volume_name = "repo".to_string();
    Ok(Pod {
        metadata: ObjectMeta {
            name: Some(pod_workspace_name(workspace_id)),
            labels: Some(labels),
            annotations: Some(create_pod_workspace_annotations(duration)?),
            ..Default::default()
        },
        spec: Some(PodSpec {
            affinity: Some(Affinity {
                node_affinity: Some(NodeAffinity {
                    preferred_during_scheduling_ignored_during_execution: Some(vec![
                        PreferredSchedulingTerm {
                            weight: 100,
                            preference: NodeSelectorTerm {
                                match_expressions: Some(vec![NodeSelectorRequirement {
                                    key: NODE_POOL_LABEL.to_string(),
                                    operator: "In".to_string(),
                                    values: Some(vec![pool_id.to_string()]),
                                }]),
                                ..Default::default()
                            },
                        },
                    ]),
                    ..Default::default()
                }),
                ..Default::default()
            }),
            containers: vec![Container {
                name: format!("{}-container", COMPONENT_WORKSPACE_VALUE),
                image: Some(
                    runtime
                        .clone()
                        .base_image
                        .unwrap_or_else(|| conf.session.base_image.clone()),
                ),
                env: Some(pod_env_variables(runtime, workspace_id)),
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

fn create_workspace_service(
    workspace_id: &str,
    runtime: &RepositoryRuntimeConfiguration,
) -> Service {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(
        COMPONENT_LABEL.to_string(),
        COMPONENT_WORKSPACE_VALUE.to_string(),
    );
    labels.insert(OWNER_LABEL.to_string(), workspace_id.to_string());
    let mut selector = BTreeMap::new();
    selector.insert(OWNER_LABEL.to_string(), workspace_id.to_string());

    // The theia port itself is mandatory
    let mut ports = vec![ServicePort {
        name: Some("web".to_string()),
        protocol: Some("TCP".to_string()),
        port: THEIA_WEB_PORT,
        ..Default::default()
    }];
    if let Some(mut runtime_ports) = runtime.ports.clone().map(|ports| {
        ports
            .iter()
            .map(|port| ServicePort {
                name: Some(port.clone().name),
                protocol: port.clone().protocol,
                port: port.port,
                target_port: port.clone().target.map(IntOrString::Int),
                ..Default::default()
            })
            .collect::<Vec<ServicePort>>()
    }) {
        ports.append(&mut runtime_ports);
    };

    Service {
        metadata: ObjectMeta {
            name: Some(service_workspace_name(workspace_id)),
            labels: Some(labels),
            ..Default::default()
        },
        spec: Some(ServiceSpec {
            type_: Some("NodePort".to_string()),
            selector: Some(selector),
            ports: Some(ports),
            ..Default::default()
        }),
        ..Default::default()
    }
}

fn pod_to_state(_pod: &Pod) -> Result<types::WorkspaceState> {
    /*Ok(types::WorkspaceState {
        phase: Phase::from_str(
            &status
                .clone()
                .phase
                .unwrap_or_else(|| "Unknown".to_string()),
        )
        .map_err(|err| Error::Failure(err.into()))?,
        reason: status.clone().reason.unwrap_or_else(|| "".to_string()),
        message: status.clone().message.unwrap_or_else(|| "".to_string()),
        start_time: status.clone().start_time.map(|dt| dt.0.into()),
        /*conditions: conditions.map(|v| {
            v.iter()
                .map(|c| self.clone().condition_to_condition(c))
                .collect()
        }),
        container: container_status.map(|c| self.container_status_to_container_status(c)),*/
    })*/
    Ok(WorkspaceState::Deploying)
}

// Creates a Workspace from a Pod annotations
fn pod_to_workspace(pod: &Pod) -> Result<Workspace> {
    let metadata = pod.metadata.clone();
    let labels = metadata.labels.unwrap_or_default();
    let unknown = "UNKNOWN OWNER".to_string();
    let username = labels.get(OWNER_LABEL).unwrap_or(&unknown);
    let annotations = &metadata.annotations.unwrap_or_default();
    let max_duration = str_minutes_to_duration(
        annotations
            .get(WORKSPACE_DURATION_ANNOTATION)
            .ok_or(Error::MissingAnnotation(WORKSPACE_DURATION_ANNOTATION))?,
    )?;

    Ok(Workspace {
        id: username.clone(),
        user_id: username.clone(),
        max_duration,
        repository_details: RepositoryDetails {
            id: "".to_string(),
            reference: "".to_string(),
        },
        state: pod_to_state(pod)?, /*template,
                                   url: subdomain(&env.host, &username),
                                   pod: Self::pod_to_details(self, &pod.clone())?,
                                   duration,
                                   node: pod
                                       .clone()
                                       .spec
                                       .ok_or(Error::MissingData("pod#spec"))?
                                       .node_name
                                       .unwrap_or_else(|| "<Unknown>".to_string()),*/
    })
}

pub async fn get_workspace(id: &str) -> Result<Option<Workspace>> {
    let client = client().await?;
    let pod_api: Api<Pod> = Api::default_namespaced(client);
    // TODO use get_opt?
    let pod = pod_api.get(&pod_workspace_name(id)).await.ok();

    match pod.map(|pod| pod_to_workspace(&pod)) {
        Some(workspace) => workspace.map(Some),
        None => Ok(None),
    }
    /*
    Ok(Some(Workspace {
        id: "id".to_string(),
        user_id: "user_id".to_string(),
        max_duration: Duration::from_millis(123),
        repository_details: RepositoryDetails {
            id: "id".to_string(),
            reference: "reference".to_string(),
        },
        state: WorkspaceState::Running {
            start_time: SystemTime::now(),
            node: types::Node {
                hostname: "hostname".to_string(),
            },
            runtime: RepositoryRuntimeConfiguration {
                base_image: None,
                env: None,
                ports: None,
            },
        },
    }))*/
}

/// Lists all currently running workspaces
pub async fn list_workspaces() -> Result<Vec<Workspace>> {
    let client = client().await?;
    let pod_api: Api<Pod> = Api::default_namespaced(client);
    let pods = list_by_selector(
        &pod_api,
        format!("{}={}", COMPONENT_LABEL, COMPONENT_WORKSPACE_VALUE).to_string(),
    )
    .await?;

    Ok(pods
        .iter()
        .flat_map(|pod| pod_to_workspace(pod).ok())
        .collect())
}

pub async fn patch_ingress(_runtimes: &BTreeMap<String, Vec<Port>>) -> Result<()> {
    let client = client().await?;
    let ingress_api: Api<Ingress> = Api::default_namespaced(client);
    let mut ingress: Ingress = ingress_api
        .get(INGRESS_NAME)
        .await
        .map_err(|err| Error::Failure(err.into()))?
        .clone();
    let mut spec = ingress
        .clone()
        .spec
        .ok_or(Error::MissingData("ingress#spec"))?;
    let rules: Vec<IngressRule> = spec.rules.unwrap_or_default();
    /*for (id, ports) in runtimes {
        let subdomain = subdomain(&self.env.host, id);
        println!("Adding domain {}", subdomain);
        rules.push(IngressRule {
            host: Some(subdomain.clone()),
            http: Some(HTTPIngressRuleValue {
                paths: ingress_paths(service_name(id), ports),
            }),
        });
    }*/
    spec.rules = Some(rules);
    ingress.spec.replace(spec);

    ingress_api
        .replace(INGRESS_NAME, &PostParams::default(), &ingress)
        .await
        .map_err(|err| Error::Failure(err.into()))?;
    println!("Patched ingress");

    Ok(())
}

pub async fn patch_ingress_workspace(_runtimes: &BTreeMap<String, Vec<Port>>) -> Result<()> {
    let client = client().await?;
    let ingress_api: Api<Ingress> = Api::default_namespaced(client);
    let mut ingress: Ingress = ingress_api
        .get(INGRESS_NAME)
        .await
        .map_err(|err| Error::Failure(err.into()))?
        .clone();
    let mut spec = ingress
        .clone()
        .spec
        .ok_or(Error::MissingData("ingress#spec"))?;
    let rules: Vec<IngressRule> = spec.rules.unwrap_or_default();
    /*for (workspace_id, ports) in runtimes {
        let subdomain = subdomain(&self.env.host, workspace_id);
        rules.push(IngressRule {
            host: Some(subdomain.clone()),
            http: Some(HTTPIngressRuleValue {
                paths: ingress_paths(service_workspace_name(workspace_id), ports),
            }),
        });
    }*/
    spec.rules = Some(rules);
    ingress.spec.replace(spec);

    ingress_api
        .replace(INGRESS_NAME, &PostParams::default(), &ingress)
        .await
        .map_err(|err| Error::Failure(err.into()))?;

    Ok(())
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

pub async fn create_workspace(
    user: &LoggedUser,
    user_id: &str,
    configuration: Configuration,
    workspace_configuration: WorkspaceConfiguration,
) -> Result<()> {
    let repository_version = get_repository_version(
        &workspace_configuration.repository_details.id,
        &workspace_configuration.repository_details.reference,
    )
    .await?
    .ok_or(Error::UnknownRepositoryVersion)?;
    // Make sure some node on the right pools still have rooms
    // Find pool affinity, lookup corresponding pool and capacity based on nodes, figure out if there is room left
    // TODO: replace with custom scheduler
    // * https://kubernetes.io/docs/tasks/extend-kubernetes/configure-multiple-schedulers/
    // * https://kubernetes.io/blog/2017/03/advanced-scheduling-in-kubernetes/
    let pool_id = workspace_configuration
        .clone()
        .pool_affinity
        .unwrap_or_else(|| {
            user.clone()
                .pool_affinity
                .unwrap_or(configuration.clone().session.pool_affinity)
        });
    let pool = get_pool(&pool_id.clone())
        .await?
        .ok_or_else(|| Error::UnknownPool(pool_id.clone()))?;
    let max_workspaces_allowed = pool.nodes.len() * configuration.session.max_sessions_per_pod;
    let workspaces = list_workspaces().await?;
    let concurrent_workspaces = running_or_pending_workspaces(workspaces).len();
    if concurrent_workspaces >= max_workspaces_allowed {
        // TODO Should trigger pool dynamic scalability. Right now this will only consider the pool lower bound.
        // "Reached maximum number of concurrent workspaces allowed: {}"
        return Err(Error::ConcurrentWorkspacesLimitBreached(
            concurrent_workspaces,
        ));
    }
    let client = client().await?;

    //TODO deploy a new ingress matching the route
    // With the proper mapping
    // Define the correct route
    // Also deploy proper tcp mapping configmap https://kubernetes.github.io/ingress-nginx/user-guide/exposing-tcp-udp-services/

    let runtime = match &repository_version.state {
        types::RepositoryVersionState::Ready { runtime } => runtime,
        _ => return Err(Error::RepositoryVersionNotReady),
    };

    let volume_api: Api<PersistentVolumeClaim> = Api::default_namespaced(client.clone());
    // TODO use conf.version to access right volume
    let volume = get_or_create_volume(
        &volume_api,
        user_id,
        &workspace_configuration.repository_details.id,
    )
    .await?;

    // Patch ingress to make this workspace externally avalaible
    let mut workspaces = BTreeMap::new();
    workspaces.insert(
        user_id.to_string(),
        runtime.ports.clone().unwrap_or_default(),
    );
    patch_ingress_workspace(&workspaces).await?;

    let duration = workspace_configuration
        .duration
        .unwrap_or(configuration.session.duration);

    // Deploy a new pod for this image
    let pod_api: Api<Pod> = Api::default_namespaced(client.clone());
    pod_api
        .create(
            &PostParams::default(),
            &create_workspace_pod(
                &configuration,
                user_id,
                runtime,
                &duration,
                &pool_id,
                &volume,
            )?,
        )
        .await
        .map_err(|err| Error::Failure(err.into()))?;

    // Deploy the associated service
    let service_api: Api<Service> = Api::default_namespaced(client.clone());
    let service = create_workspace_service(user_id, runtime);
    service_api
        .create(&PostParams::default(), &service)
        .await
        .map_err(|err| Error::Failure(err.into()))?;

    Ok(())
}

pub async fn update_workspace(
    workspace_id: &str,
    configuration: Configuration,
    workspace_configuration: WorkspaceUpdateConfiguration,
) -> Result<()> {
    let workspace = get_workspace(workspace_id)
        .await?
        .ok_or(Error::UnknownResource)?;

    let duration = workspace_configuration
        .duration
        .unwrap_or(configuration.session.duration);
    let max_duration = configuration.session.max_duration;
    if duration >= max_duration {
        return Err(Error::DurationLimitBreached(max_duration.as_millis()));
    }
    if duration != workspace.max_duration {
        let client = client().await?;
        let pod_api: Api<Pod> = Api::default_namespaced(client);
        let params = PatchParams {
            ..PatchParams::default()
        };
        let patch: Patch<json_patch::Patch> =
            Patch::Json(json_patch::Patch(vec![PatchOperation::Add(AddOperation {
                path: format!(
                    "/metadata/annotations/{}",
                    WORKSPACE_DURATION_ANNOTATION.replace('/', "~1")
                ),
                value: json!(workspace_duration_annotation(duration)),
            })]));
        pod_api
            .patch(&pod_workspace_name(&workspace.user_id), &params, &patch)
            .await
            .map_err(|err| Error::Failure(err.into()))?;
    }

    Ok(())
}

pub async fn delete_workspace(id: &str) -> Result<()> {
    // Undeploy the service by its id
    let client = client().await?;
    let service_api: Api<Service> = Api::default_namespaced(client.clone());
    service_api
        .delete(&service_workspace_name(id), &DeleteParams::default())
        .await
        .map_err(|err| Error::Failure(err.into()))?;

    let pod_api: Api<Pod> = Api::default_namespaced(client.clone());
    pod_api
        .delete(&pod_workspace_name(id), &DeleteParams::default())
        .await
        .map_err(|err| Error::Failure(err.into()))?;

    /*let subdomain = subdomain(&self.env.host, id);
        let ingress_api: Api<Ingress> = Api::default_namespaced(client);
        let mut ingress: Ingress = ingress_api
            .get(INGRESS_NAME)
            .await
            .map_err(|err| Error::Failure(err.into()))?
            .clone();
        let mut spec = ingress
            .clone()
            .spec
            .ok_or(Error::MissingData("spec"))?
            .clone();
        let rules: Vec<IngressRule> = spec
            .clone()
            .rules
            .unwrap_or_default()
            .into_iter()
            .filter(|rule| rule.clone().host.unwrap_or_else(|| "unknown".to_string()) != subdomain)
            .collect();
        spec.rules = Some(rules);
        ingress.spec.replace(spec);

        ingress_api
            .replace(INGRESS_NAME, &PostParams::default(), &ingress)
            .await
            .map_err(|err| Error::Failure(err.into()))?;
    */
    Ok(())
}
