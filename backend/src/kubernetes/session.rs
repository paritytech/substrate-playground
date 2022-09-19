//! Helper methods ton interact with k8s
use crate::{
    error::{Error, ResourceError, Result},
    kubernetes::get_host,
    types::{
        self, NameValuePair, Port, Preferences, RepositoryVersionState, ResourceType, Session,
        SessionConfiguration, SessionExecution, SessionExecutionConfiguration,
        SessionRuntimeConfiguration, SessionUpdateConfiguration, User,
    },
    utils::devcontainer::{parse_devcontainer, DevContainer},
};
use futures::StreamExt;
use k8s_openapi::api::{
    core::v1::{
        Affinity, Container, ContainerStatus, EmptyDirVolumeSource, EnvVar, Pod, PodAffinityTerm,
        PodAntiAffinity, PodSpec, ResourceRequirements, SecurityContext, Service, ServicePort,
        ServiceSpec, Toleration, Volume, VolumeMount,
    },
    networking::v1::{Ingress, IngressRule},
};
use k8s_openapi::apimachinery::pkg::{
    api::resource::Quantity,
    apis::meta::v1::{LabelSelector, ObjectMeta},
    util::intstr::IntOrString,
};
use kube::runtime::events::{Event, EventType, Recorder};
use kube::{
    api::{Api, AttachParams, AttachedProcess, DeleteParams, PostParams, ResourceExt},
    Resource,
};
use std::{
    collections::BTreeMap,
    time::{Duration, SystemTime},
};

use super::{
    backend_pod, client, env_var, get_owned_resource, get_preference, list_all_resources,
    list_owned_resources,
    pool::get_pool,
    repository::get_repository,
    repository_version::{get_repository_version, volume_template_name},
    serialize_json, str_minutes_to_duration, unserialize_json, update_annotation_value,
    user::{add_user_session, DEFAULT_SERVICE_ACCOUNT},
    user_namespace, user_namespaced_api, APP_LABEL, APP_VALUE, COMPONENT_LABEL, INGRESS_NAME,
    NODE_POOL_LABEL, NODE_POOL_TYPE_LABEL, OWNER_LABEL,
};

const DEFAULT_DOCKER_IMAGE: &str = "ubuntu";
const RESOURCE_ID: &str = "RESOURCE_ID";
const COMPONENT: &str = "session";
const SESSION_DURATION_ANNOTATION: &str = "app.playground/session_duration";
const PORTS_ANNOTATION: &str = "app.playground/ports";
const THEIA_WEB_PORT: i32 = 3000;

fn duration_to_string(duration: Duration) -> String {
    duration.as_secs().to_string()
}

fn string_to_duration(str: &str) -> Duration {
    Duration::from_secs(str.parse::<u64>().unwrap_or(0))
}

// Model

fn pod_env_variables(envs: Option<Vec<NameValuePair>>, session_id: &str) -> Vec<EnvVar> {
    let mut all_envs = Vec::from([
        env_var("SUBSTRATE_PLAYGROUND", ""),
        env_var("SUBSTRATE_PLAYGROUND_SESSION", session_id),
    ]);
    // Add default variables
    if let Some(envs) = envs {
        all_envs.append(
            &mut envs
                .iter()
                .map(|env| env_var(&env.name, &env.value))
                .collect::<Vec<EnvVar>>(),
        );
    }
    all_envs
}

#[cfg_attr(feature = "cargo-clippy", allow(clippy::too_many_arguments))]
fn session_to_pod(
    user_id: &str,
    session_id: &str,
    volume_name: &str,
    image: &str,
    duration: &Duration,
    pool_id: &str,
    envs: Option<Vec<NameValuePair>>,
    ports: Vec<Port>,
) -> Result<Pod> {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT.to_string());
    labels.insert(RESOURCE_ID.to_string(), session_id.to_string());
    labels.insert(OWNER_LABEL.to_string(), user_id.to_string());

    let mut annotations = BTreeMap::new();
    annotations.insert(
        SESSION_DURATION_ANNOTATION.to_string(),
        duration_to_string(*duration),
    );
    annotations.insert(PORTS_ANNOTATION.to_string(), serialize_json(&ports)?);

    let openvscode_version = "1.71.0";
    Ok(Pod {
        metadata: ObjectMeta {
            name: Some(session_id.to_string()),
            labels: Some(labels),
            annotations: Some(annotations),
            ..Default::default()
        },
        spec: Some(PodSpec {
            service_account_name: Some(DEFAULT_SERVICE_ACCOUNT.to_string()),
            node_selector: Some(BTreeMap::from([(
                NODE_POOL_LABEL.to_string(),
                pool_id.to_string(),
            )])),
            volumes: Some(vec![Volume {
                name: volume_name.to_string(),
                empty_dir: Some(EmptyDirVolumeSource {
                    ..Default::default()
                }),
                ..Default::default()
            }]),
            affinity: Some(Affinity {
                pod_anti_affinity: Some(PodAntiAffinity {
                    required_during_scheduling_ignored_during_execution: Some(vec![
                        PodAffinityTerm {
                            topology_key: "kubernetes.io/hostname".to_string(),
                            label_selector: Some(LabelSelector {
                                match_labels: Some(BTreeMap::from([(
                                    COMPONENT_LABEL.to_string(),
                                    COMPONENT.to_string(),
                                )])),
                                ..Default::default()
                            }),
                            ..Default::default()
                        },
                    ]),
                    ..Default::default()
                }),
                ..Default::default()
            }),
            restart_policy: Some("Never".to_string()),
            init_containers: Some(vec![Container {
                name: "copy-openvscode".to_string(),
                image: Some("ubuntu".to_string()),
                command: Some(vec![
                    "sh".to_string(),
                    "-c".to_string(),
                    "apt-get update; apt-get install -y curl; curl -L https://github.com/gitpod-io/openvscode-server/releases/download/openvscode-server-v{{VERSION}}/openvscode-server-v{{VERSION}}-linux-x64.tar.gz --output openvscode-server.tar.gz ; mkdir -p /opt/openvscode;tar -xzf openvscode-server.tar.gz --directory /opt/openvscode --strip-components=1;cp /opt/openvscode/bin/remote-cli/openvscode-server /opt/openvscode/bin/remote-cli/code".to_string().replace("{{VERSION}}", openvscode_version),
                ]),
                volume_mounts: Some(vec![VolumeMount {
                    name: volume_name.to_string(),
                    mount_path: "/opt".to_string(),
                    ..Default::default()
                }]),
                ..Default::default()
            }]),
            containers: vec![Container {
                name: format!("{}-container", COMPONENT),
                image: Some(image.to_string()),
                env: Some(pod_env_variables(envs, session_id)),
                command: Some(vec!["/opt/openvscode/bin/openvscode-server".to_string()]),
                args: Some(vec![
                    "--host".to_string(),
                    "0.0.0.0".to_string(),
                    "--without-connection-token".to_string(),
                ]),
                resources: Some(ResourceRequirements {
                    requests: Some(BTreeMap::from([
                        ("memory".to_string(), Quantity("6Gi".to_string())),
                        ("ephemeral-storage".to_string(), Quantity("5Gi".to_string())),
                    ])),
                    limits: Some(BTreeMap::from([
                        ("memory".to_string(), Quantity("8Gi".to_string())),
                    ]))
                }),
                volume_mounts: Some(vec![VolumeMount {
                    name: volume_name.to_string(),
                    mount_path: "/opt".to_string(),
                    ..Default::default()
                }]),
                security_context: Some(SecurityContext {
                    allow_privilege_escalation: Some(false),
                    run_as_non_root: Some(false), // TODO Reinvestigate, should provide guidance for image creation
                    ..Default::default()
                }),
                ..Default::default()
            }],
            // Must match available Node Pools
            tolerations: Some(vec![Toleration {
                key: Some(NODE_POOL_TYPE_LABEL.to_string()),
                operator: Some("Equal".to_string()),
                value: Some("user".to_string()),
                ..Default::default()
            }]),
            termination_grace_period_seconds: Some(0),
            automount_service_account_token: Some(false),
            ..Default::default()
        }),
        ..Default::default()
    })
}

fn service(session_id: &str, service_name: &str, ports: &[Port]) -> Service {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT.to_string());
    labels.insert(OWNER_LABEL.to_string(), session_id.to_string());
    let mut selector = BTreeMap::new();
    selector.insert(OWNER_LABEL.to_string(), session_id.to_string());

    // The theia port itself is mandatory
    let mut service_ports = vec![ServicePort {
        name: Some("web".to_string()),
        protocol: Some("TCP".to_string()),
        port: THEIA_WEB_PORT,
        ..Default::default()
    }];

    // Extra ports are converted and appended
    let mut extra_service_ports = ports
        .iter()
        .map(|port| ServicePort {
            name: Some(port.clone().name),
            protocol: port.clone().protocol,
            port: port.port,
            target_port: port.clone().target.map(IntOrString::Int),
            ..Default::default()
        })
        .collect::<Vec<ServicePort>>();
    service_ports.append(&mut extra_service_ports);

    Service {
        metadata: ObjectMeta {
            name: Some(service_name.to_string()),
            labels: Some(labels),
            ..Default::default()
        },
        spec: Some(ServiceSpec {
            type_: Some("NodePort".to_string()),
            selector: Some(selector),
            ports: Some(service_ports),
            ..Default::default()
        }),
        ..Default::default()
    }
}

/*fn external_service(
    local_service_name: &str,
    service_name: &str,
    session_namespace: &str,
) -> Service {
    Service {
        metadata: ObjectMeta {
            name: Some(local_service_name.to_string()),
            ..Default::default()
        },
        spec: Some(ServiceSpec {
            type_: Some("ExternalName".to_string()),
            external_name: Some(format!(
                "{}.{}.svc.cluster.local",
                service_name, session_namespace
            )),
            ..Default::default()
        }),
        ..Default::default()
    }
}*/

fn subdomain(host: &str, id: &str) -> String {
    format!("{}.{}", id, host)
}

fn container_status_to_session_state(
    container_status: &ContainerStatus,
) -> Option<types::SessionState> {
    if let Some(state) = &container_status.state {
        if let Some(terminated) = &state.terminated {
            return Some(types::SessionState::Failed {
                message: terminated
                    .message
                    .clone()
                    .unwrap_or_else(|| "Terminated with an error".to_string()),
                reason: terminated.reason.clone().unwrap_or_default(),
            });
        } else if let Some(waiting) = &state.waiting {
            let reason = waiting.reason.clone().unwrap_or_default();
            return match reason.as_str() {
                // https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#container-state-waiting
                // https://kubernetes.io/docs/concepts/containers/images/#imagepullbackoff
                // https://github.com/kubernetes/kubernetes/blob/master/pkg/kubelet/images/types.go
                // https://github.com/kubernetes/kubernetes/blob/master/pkg/kubelet/events/event.go
                "CreateContainerConfigError" | "ImagePullBackOff" | "CrashLoopBackOff" => {
                    Some(types::SessionState::Failed {
                        message: waiting.message.clone().unwrap_or_default(),
                        reason,
                    })
                }
                _ => None,
            };
        }
    }
    None
}

fn pod_to_state(pod: &Pod) -> types::SessionState {
    let status = pod.status.clone().unwrap_or_default();
    match status
        .phase
        .unwrap_or_else(|| "Pending".to_string())
        .as_str()
    {
        "Running" => {
            if let Some(status) = status.container_statuses.unwrap_or_default().first() {
                if let Some(state) = status.clone().state.unwrap_or_default().running {
                    let ports = pod
                        .annotations()
                        .get(PORTS_ANNOTATION)
                        .and_then(|s| unserialize_json(s).ok()) // Ignore unserialization issues
                        .unwrap_or_default();

                    types::SessionState::Running {
                        start_time: state
                            .started_at
                            .as_ref()
                            .map(|dt| dt.0.into())
                            .unwrap_or(SystemTime::UNIX_EPOCH),
                        node: types::Node {
                            hostname: pod
                                .spec
                                .clone()
                                .unwrap_or_default()
                                .node_name
                                .unwrap_or_default(),
                        },
                        runtime_configuration: SessionRuntimeConfiguration {
                            // TODO
                            env: vec![],
                            ports,
                        },
                    }
                } else {
                    types::SessionState::Deploying
                }
            } else {
                types::SessionState::Deploying
            }
        }
        "Failed" => {
            let container_statuses = status.container_statuses.unwrap_or_default();
            if let Some(container_status) = container_statuses.first() {
                // Only inspect the first container as it's the only one defined
                container_status_to_session_state(container_status)
                    .unwrap_or(types::SessionState::Deploying)
            } else {
                let init_container_statuses = status.init_container_statuses.unwrap_or_default();
                if let Some(init_container_status) = init_container_statuses.first() {
                    // Only inspect the first init_container as it's the only one defined
                    container_status_to_session_state(init_container_status)
                        .unwrap_or(types::SessionState::Deploying)
                } else {
                    types::SessionState::Failed {
                        message: status.message.unwrap_or_default(),
                        reason: status.reason.unwrap_or_default(),
                    }
                }
            }
        }
        _ => types::SessionState::Deploying,
    }
    /*if let Some(condition) = status.conditions.unwrap_or_default().first() {
        return match condition.type_.as_str() {
            "ContainersNotReady" => {
                let init_container_statuses = status.init_container_statuses.unwrap_or_default();
                if let Some(init_container_status) = init_container_statuses.first() {
                    // Only inspect the first init_container as it's the only one defined
                    container_status_to_session_state(init_container_status)
                        .unwrap_or(types::SessionState::Deploying)
                } else {
                    return types::SessionState::Failed {
                        message: condition.clone().message.unwrap_or_default(),
                        reason: "ContainersNotReady".to_string(),
                    };
                }
            }
            "Initialized" => {
                let container_statuses = status.container_statuses.unwrap_or_default();
                if let Some(container_status) = container_statuses.first() {
                    // Only inspect the first container as it's the only one defined
                    container_status_to_session_state(container_status)
                        .unwrap_or(types::SessionState::Deploying)
                } else {
                    return types::SessionState::Failed {
                        message: condition.clone().message.unwrap_or_default(),
                        reason: "Initialized".to_string(),
                    };
                }
            }
            "Ready" => {
                if let Some(status) = status.container_statuses.unwrap_or_default().first() {
                    if let Some(state) = status.clone().state.unwrap_or_default().running {
                        return types::SessionState::Running {
                            start_time: state
                                .started_at
                                .as_ref()
                                .map(|dt| dt.0.into())
                                .unwrap_or(SystemTime::UNIX_EPOCH),
                            node: types::Node {
                                hostname: pod
                                    .spec
                                    .clone()
                                    .unwrap_or_default()
                                    .node_name
                                    .unwrap_or_default(),
                            },
                            runtime_configuration: SessionRuntimeConfiguration {
                                // TODO
                                env: vec![],
                                ports: vec![],
                            },
                        };
                    }
                }
                types::SessionState::Deploying
            }
            _ => types::SessionState::Deploying,
        };
    }

    // Fallback if no conditions are available
    types::SessionState::Deploying*/
}

// Creates a Session from a Pod annotations
fn pod_to_session(pod: &Pod) -> Result<Session> {
    let max_duration = string_to_duration(
        pod.annotations()
            .get(SESSION_DURATION_ANNOTATION)
            .unwrap_or(&"".to_string()),
    );
    Ok(Session {
        id: pod
            .labels()
            .get(RESOURCE_ID)
            .ok_or_else(|| Error::Failure(format!("Missing label {}", RESOURCE_ID)))?
            .to_string(),
        user_id: pod
            .labels()
            .get(OWNER_LABEL)
            .ok_or_else(|| Error::Failure(format!("Missing label {}", OWNER_LABEL)))?
            .to_string(),
        max_duration,
        state: pod_to_state(pod),
    })
}

pub async fn get_user_session(user_id: &str, session_id: &str) -> Result<Option<Session>> {
    get_owned_resource(user_id, session_id, pod_to_session).await
}

/// Lists all currently running sessions for `user_id`
pub async fn list_user_sessions(user_id: &str) -> Result<Vec<Session>> {
    list_owned_resources(user_id, COMPONENT, pod_to_session).await
}

/// Lists all currently running sessions for `user_id`
pub async fn list_sessions() -> Result<Vec<Session>> {
    list_all_resources(COMPONENT, pod_to_session).await
}
/*
pub async fn patch_ingress(runtimes: &BTreeMap<String, Vec<Port>>) -> Result<()> {
    let client = client()?;
    let ingress_api: Api<Ingress> = Api::default_namespaced(client);
    let mut ingress: Ingress = ingress_api
        .get(INGRESS_NAME)
        .await
        .map_err(Error::K8sCommunicationFailure)?
        .clone();
    let mut spec = ingress
        .clone()
        .spec
        .ok_or_else(|| Error::MissingConstraint("ingress".to_string(), "spec".to_string()))?;
    let mut rules: Vec<IngressRule> = spec.rules.unwrap_or_default();
    let host = get_host().await?;
    for (session_id, ports) in runtimes {
        let local_service_name = local_service_name(session_id);
        let subdomain = subdomain(&host, session_id);
        rules.push(IngressRule {
            host: Some(subdomain.clone()),
            http: Some(HTTPIngressRuleValue {
                paths: ingress_paths(local_service_name.to_string(), ports),
            }),
        });
    }
    spec.rules = Some(rules);
    ingress.spec.replace(spec);

    ingress_api
        .replace(INGRESS_NAME, &PostParams::default(), &ingress)
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    Ok(())
}*/

pub fn service_name(session_id: &str) -> String {
    format!("service-{}", session_id)
}

fn devcontainer_to_ports(devcontainer: &DevContainer) -> Vec<Port> {
    // TODO add support to https://code.visualstudio.com/docs/remote/devcontainerjson-reference#_port-attributes
    devcontainer
        .forward_ports
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|port| Port {
            name: format!("port-{}", port),
            port,
            protocol: Some("TCP".to_string()),
            target: None,
        })
        .collect::<Vec<Port>>()
}

fn envs(devcontainer: &DevContainer) -> Vec<NameValuePair> {
    devcontainer
        .container_env
        .clone()
        .unwrap_or_default()
        .iter()
        .map(|(k, v)| NameValuePair {
            name: k.to_string(),
            value: v.to_string(),
        })
        .collect()
}

pub async fn create_user_session(
    user: &User,
    id: &str,
    session_configuration: &SessionConfiguration,
) -> Result<()> {
    if get_user_session(&user.id, id).await?.is_some() {
        return Err(Error::Resource(ResourceError::IdAlreayUsed(
            ResourceType::Session,
            id.to_string(),
        )));
    }

    // Make sure some node on the right pools still have rooms
    // Find pool affinity, lookup corresponding pool and capacity based on nodes, figure out if there is room left
    // TODO: replace with custom scheduler
    // * https://kubernetes.io/docs/tasks/extend-kubernetes/configure-multiple-schedulers/
    // * https://kubernetes.io/blog/2017/03/advanced-scheduling-in-kubernetes/
    let preferences = user.all_preferences().await?;
    let pool_id = match session_configuration.pool_affinity.clone() {
        Some(pool_affinity) => pool_affinity,
        None => get_preference(&preferences, &Preferences::SessionPoolAffinity.to_string())?,
    };
    let pool = get_pool(&pool_id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(ResourceType::Pool, pool_id.clone()))
    })?;
    let max_sessions_allowed = pool.nodes.len();
    let user_id = &user.id;
    let sessions = list_sessions().await?;
    if sessions.len() >= max_sessions_allowed {
        // 1 session == 1 node
        return Err(Error::Resource(ResourceError::Misconfiguration(
            ResourceType::Session,
            "ConcurrentSessionsLimit".to_string(),
            BTreeMap::from([
                ("sessions".to_string(), sessions.len().to_string()),
                ("maxSessions".to_string(), max_sessions_allowed.to_string()),
            ]),
        )));
    }

    let repository_id = session_configuration
        .repository_source
        .repository_id
        .as_str();

    let repository = get_repository(repository_id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(
            ResourceType::Repository,
            repository_id.to_string(),
        ))
    })?;
    let repository_version_id = match &session_configuration
        .repository_source
        .repository_version_id
    {
        Some(repository_version_id) => Ok(repository_version_id),
        None => match repository.current_version.as_ref() {
            Some(version) => Ok(version),
            None => Err(Error::Failure(
                "No version provided and no currentVersion set".to_string(),
            )),
        },
    }?
    .as_str();
    let devcontainer = if let Some(repository_version) =
        get_repository_version(repository_id, repository_version_id).await?
    {
        match repository_version.state {
            RepositoryVersionState::Ready { devcontainer_json } => devcontainer_json
                .map(|json| parse_devcontainer(&json))
                .transpose(),
            _ => Err(Error::Failure(format!(
                "Repository version {} is not in Ready state",
                repository_version_id
            ))),
        }
    } else {
        Err(Error::Failure(format!(
            "No matching repository version for {}:{}",
            repository_id, repository_version_id
        )))
    }?;

    let mut ports = vec![];
    if let Some(devcontainer) = devcontainer.clone() {
        ports.append(&mut devcontainer_to_ports(&devcontainer));
    }
    ports.push(Port {
        name: "vscode".to_string(),
        protocol: None,
        port: 80,
        target: None,
    });

    // Now create the session itself

    let client = client()?;

    // Deploy the associated service
    let service_api: Api<Service> = Api::namespaced(client.clone(), &user_namespace(user_id));
    let service_name = service_name(id);
    let service = service(id, &service_name, &ports);
    service_api.create(&PostParams::default(), &service).await?;

    // Deploy the ingress local service
    /*     let service_local_api: Api<Service> = Api::default_namespaced(client.clone());
    service_local_api
        .create(
            &PostParams::default(),
            &external_service(&local_service_name(id), &service_name, id),
        )
        .await
        .map_err(Error::K8sCommunicationFailure)?;*/

    let duration = str_minutes_to_duration(&get_preference(
        &preferences,
        &Preferences::SessionDefaultDuration.to_string(),
    )?)?;
    // TODO clone per user
    let volume_name = volume_template_name(repository_id, repository_version_id);
    // Deploy a new pod for this image
    let pod_api: Api<Pod> = Api::namespaced(client.clone(), &user_namespace(user_id));
    let _pod = pod_api
        .create(
            &PostParams::default(),
            &session_to_pod(
                &user.id,
                id,
                &volume_name,
                devcontainer
                    .clone()
                    .map(|devcontainer| devcontainer.image)
                    .unwrap_or_else(|| DEFAULT_DOCKER_IMAGE.to_string())
                    .as_str(),
                &duration,
                &pool_id,
                devcontainer.map(|devcontainer| envs(&devcontainer)),
                ports,
            )?,
        )
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    add_user_session(&user.id, id, service).await?;

    let recorder = Recorder::new(
        client.clone(),
        "kube".into(),
        backend_pod().await?.object_ref(&()),
    );
    recorder
        .publish(Event {
            type_: EventType::Normal,
            reason: "HiddenDoc".into(),
            note: Some("Some note".to_string()),
            action: "Reconciling".into(),
            secondary: None,
        })
        .await?;

    println!("Event published");

    Ok(())
}

pub async fn update_user_session(
    user: &User,
    id: &str,
    session_configuration: SessionUpdateConfiguration,
) -> Result<()> {
    let session = get_user_session(&user.id, id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(
            ResourceType::Session,
            id.to_string(),
        ))
    })?;

    let preferences = user.all_preferences().await?;

    let duration = match session_configuration.duration {
        Some(duration) => duration,
        None => str_minutes_to_duration(&get_preference(
            &preferences,
            &Preferences::SessionDefaultDuration.to_string(),
        )?)?,
    };

    let max_duration = str_minutes_to_duration(&get_preference(
        &preferences,
        &Preferences::SessionMaxDuration.to_string(),
    )?)?;
    if duration >= max_duration {
        return Err(Error::Resource(ResourceError::Misconfiguration(
            ResourceType::Session,
            "DurationLimit".to_string(),
            BTreeMap::from([
                ("duration".to_string(), duration.as_millis().to_string()),
                (
                    "maxDuration".to_string(),
                    max_duration.as_millis().to_string(),
                ),
            ]),
        )));
    }
    if duration != session.max_duration {
        let pod_api: Api<Pod> = user_namespaced_api(&user.id)?;
        update_annotation_value(
            &pod_api,
            id,
            SESSION_DURATION_ANNOTATION,
            duration_to_string(duration).into(),
        )
        .await?
    }
    // TODO update ports

    Ok(())
}

pub async fn delete_user_session(user_id: &str, id: &str) -> Result<()> {
    let client = client()?;

    get_user_session(user_id, id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(
            ResourceType::Session,
            id.to_string(),
        ))
    })?;

    // Undeploy the ingress local service
    /*    let service_local_api: Api<Service> = Api::default_namespaced(client.clone());
    service_local_api
        .delete(
            &local_service_name(id),
            &DeleteParams::default().grace_period(0),
        )
        .await
        .map_err(Error::K8sCommunicationFailure)?;*/

    // Undeploy the ingress service
    let service_api: Api<Service> = Api::namespaced(client.clone(), &user_namespace(user_id));
    service_api
        .delete(&service_name(id), &DeleteParams::default().grace_period(0))
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    // Undeploy the pod
    let pod_api: Api<Pod> = Api::namespaced(client.clone(), &user_namespace(user_id));
    pod_api
        .delete(id, &DeleteParams::default().grace_period(0))
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    // Remove the ingress route
    let host = get_host().await?;
    let subdomain = subdomain(&host, id);
    let ingress_api: Api<Ingress> = Api::default_namespaced(client.clone());
    let mut ingress: Ingress = ingress_api
        .get(INGRESS_NAME)
        .await
        .map_err(Error::K8sCommunicationFailure)?
        .clone();
    let mut spec = ingress
        .clone()
        .spec
        .ok_or_else(|| Error::MissingConstraint("ingress".to_string(), "spec".to_string()))?
        .clone();
    let rules: Vec<IngressRule> = spec
        .clone()
        .rules
        .unwrap()
        .into_iter()
        .filter(|rule| rule.clone().host.unwrap_or_else(|| "unknown".to_string()) != subdomain)
        .collect();
    spec.rules.replace(rules);
    ingress.spec.replace(spec);

    ingress_api
        .replace(INGRESS_NAME, &PostParams::default(), &ingress)
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    Ok(())
}

async fn get_output(mut attached: AttachedProcess) -> String {
    let stdout = tokio_util::io::ReaderStream::new(attached.stdout().unwrap());
    let out = stdout
        .filter_map(|r| async { r.ok().and_then(|v| String::from_utf8(v.to_vec()).ok()) })
        .collect::<Vec<_>>()
        .await
        .join("");
    attached.join().await.unwrap();
    out
}

pub async fn create_user_session_execution(
    user_id: &str,
    session_id: &str,
    execution_configuration: SessionExecutionConfiguration,
) -> Result<SessionExecution> {
    let client = client()?;
    let pod_api: Api<Pod> = Api::namespaced(client, &user_namespace(user_id));
    let attached = pod_api
        .exec(
            session_id,
            execution_configuration.command,
            &AttachParams::default(),
        )
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    Ok(SessionExecution {
        stdout: get_output(attached).await,
    })
}
