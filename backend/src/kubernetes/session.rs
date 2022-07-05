//! Helper methods ton interact with k8s
use crate::{
    error::{Error, Result},
    kubernetes::get_host,
    types::{
        self, Configuration, NameValuePair, Port, RepositoryVersionState, ResourceType, Session,
        SessionConfiguration, SessionExecution, SessionExecutionConfiguration,
        SessionRuntimeConfiguration, SessionUpdateConfiguration, User,
    },
    utils::devcontainer::{parse_devcontainer, DevContainer},
};
use futures::StreamExt;
use k8s_openapi::api::{
    core::v1::{
        Affinity, Container, EnvVar, NodeAffinity, NodeSelectorRequirement, NodeSelectorTerm, Pod,
        PodSpec, PreferredSchedulingTerm, ResourceRequirements, SecurityContext, Service,
        ServicePort, ServiceSpec,
    },
    networking::v1::{HTTPIngressPath, HTTPIngressRuleValue, Ingress, IngressRule},
};
use k8s_openapi::apimachinery::pkg::{
    api::resource::Quantity, apis::meta::v1::ObjectMeta, util::intstr::IntOrString,
};
use kube::api::{Api, AttachParams, AttachedProcess, DeleteParams, PostParams, ResourceExt};
use serde_json::json;
use std::{
    collections::BTreeMap,
    time::{Duration, SystemTime},
};

use super::{
    client, env_var, get_owned_resource, ingress_path, list_all_resources,
    pool::get_pool,
    repository::{get_repository, get_repository_version},
    update_annotation_value,
    user::DEFAULT_SERVICE_ACCOUNT,
    user_namespace, APP_LABEL, APP_VALUE, COMPONENT_LABEL, INGRESS_NAME, NODE_POOL_LABEL,
    OWNER_LABEL,
};

const RESOURCE_ID: &str = "RESOURCE_ID";
const COMPONENT: &str = "session";
const SESSION_DURATION_ANNOTATION: &str = "app.playground/session_duration";
const THEIA_WEB_PORT: i32 = 3000;

fn duration_to_string(duration: Duration) -> String {
    duration.as_secs().to_string()
}

fn string_to_duration(str: &str) -> Duration {
    Duration::from_secs(str.parse::<u64>().unwrap_or(0))
}

// Model

fn pod_env_variables(envs: Vec<NameValuePair>, session_id: &str) -> Vec<EnvVar> {
    let mut envs = envs
        .iter()
        .map(|env| env_var(&env.name, &env.value))
        .collect::<Vec<EnvVar>>();
    // Add default variables
    envs.append(&mut vec![
        env_var("SUBSTRATE_PLAYGROUND", ""),
        env_var("SUBSTRATE_PLAYGROUND_SESSION", session_id),
    ]);
    envs
}

fn pod_annotations(duration: &Duration) -> BTreeMap<String, String> {
    let mut annotations = BTreeMap::new();
    annotations.insert(
        SESSION_DURATION_ANNOTATION.to_string(),
        duration_to_string(*duration),
    );
    annotations
}

fn session_to_pod(
    user_id: &str,
    session_id: &str,
    image: &str,
    duration: &Duration,
    pool_id: &str,
    envs: Vec<NameValuePair>,
) -> Pod {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT.to_string());
    labels.insert(RESOURCE_ID.to_string(), session_id.to_string());
    labels.insert(OWNER_LABEL.to_string(), user_id.to_string());

    Pod {
        metadata: ObjectMeta {
            name: Some(session_id.to_string()),
            labels: Some(labels),
            annotations: Some(pod_annotations(duration)),
            ..Default::default()
        },
        spec: Some(PodSpec {
            service_account_name: Some(DEFAULT_SERVICE_ACCOUNT.to_string()),
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
                name: format!("{}-container", COMPONENT),
                image: Some(image.to_string()),
                env: Some(pod_env_variables(envs, session_id)),
                resources: Some(ResourceRequirements {
                    requests: Some(BTreeMap::from([
                        ("memory".to_string(), Quantity("1Gi".to_string())),
                        (
                            "ephemeral-storage".to_string(),
                            Quantity("5Gi".to_string()),
                        ),
                        ("cpu".to_string(), Quantity("0.5".to_string())),
                    ])),
                    limits: Some(BTreeMap::from([
                        ("memory".to_string(), Quantity("64Gi".to_string())),
                        (
                            "ephemeral-storage".to_string(),
                            Quantity("50Gi".to_string()),
                        ),
                        ("cpu".to_string(), Quantity("1".to_string())),
                    ])),
                }),
                security_context: Some(SecurityContext {
                    allow_privilege_escalation: Some(false),
                    run_as_non_root: Some(false), // TODO Reinvestigate, should provide guidance for image creation
                    ..Default::default()
                }),
                ..Default::default()
            }],
            termination_grace_period_seconds: Some(0),
            automount_service_account_token: Some(false),
            ..Default::default()
        }),
        ..Default::default()
    }
}

fn service(session_id: &str, service_name: &str, ports: Vec<Port>) -> Service {
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

fn external_service(
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
}

fn ingress_paths(service_name: String, ports: &[Port]) -> Vec<HTTPIngressPath> {
    let mut all_paths = vec![ingress_path("/", &service_name, THEIA_WEB_PORT)];
    let mut paths = ports
        .iter()
        .map(|port| ingress_path(&port.clone().path, &service_name.clone(), port.port))
        .collect();
    all_paths.append(&mut paths);
    all_paths
}

fn subdomain(host: &str, id: &str) -> String {
    format!("{}.{}", id, host)
}

fn pod_to_state(pod: &Pod) -> types::SessionState {
    let status = pod.status.clone().unwrap_or_default();
    let container_statuses = status.container_statuses.unwrap_or_default();
    if let Some(container_status) = container_statuses.get(0) {
        if let Some(state) = &container_status.state {
            if let Some(running) = &state.running {
                return types::SessionState::Running {
                    start_time: running
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
            } else if let Some(terminated) = &state.terminated {
                return types::SessionState::Failed {
                    message: terminated.message.clone().unwrap_or_default(),
                    reason: terminated.reason.clone().unwrap_or_default(),
                };
            } else if let Some(waiting) = &state.waiting {
                if waiting.reason.clone().unwrap_or_default() == "CreateContainerConfigError" {
                    return types::SessionState::Failed {
                        message: waiting.message.clone().unwrap_or_default(),
                        reason: waiting.reason.clone().unwrap_or_default(),
                    };
                }
            }
        }
    }
    types::SessionState::Deploying
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

pub async fn get_session(user_id: &str, session_id: &str) -> Result<Option<Session>> {
    get_owned_resource(user_id, session_id, pod_to_session).await
}

/// Lists all currently running sessions
pub async fn list_sessions() -> Result<Vec<Session>> {
    list_all_resources(COMPONENT, pod_to_session).await
}

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
        .ok_or(Error::MissingData("ingress#spec"))?;
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
}

fn service_name(session_id: &str) -> String {
    format!("service-{}", session_id)
}

fn local_service_name(session_id: &str) -> String {
    format!("local-service-{}", session_id)
}

fn ports(devcontainer: &DevContainer) -> Vec<Port> {
    devcontainer
        .forward_ports
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|port| Port {
            name: "".to_string(),
            port,
            path: "".to_string(),
            protocol: Some("TCP".to_string()),
            target: None,
        })
        .collect::<Vec<Port>>()
}

pub async fn create_session(
    user: &User,
    id: &str,
    configuration: &Configuration,
    session_configuration: &SessionConfiguration,
) -> Result<()> {
    // Make sure some node on the right pools still have rooms
    // Find pool affinity, lookup corresponding pool and capacity based on nodes, figure out if there is room left
    // TODO: replace with custom scheduler
    // * https://kubernetes.io/docs/tasks/extend-kubernetes/configure-multiple-schedulers/
    // * https://kubernetes.io/blog/2017/03/advanced-scheduling-in-kubernetes/
    let pool_id = session_configuration
        .clone()
        .pool_affinity
        .unwrap_or_else(|| {
            user.preferences
                .get(&"pool_affinity".to_string())
                .unwrap_or(&configuration.clone().session.pool_affinity)
                .to_string()
        });
    let pool = get_pool(&pool_id)
        .await?
        .ok_or_else(|| Error::UnknownResource(ResourceType::Pool, pool_id.clone()))?;
    let max_sessions_allowed = pool.nodes.len() * configuration.session.max_sessions_per_pod;
    let user_id = &user.id;
    let sessions = list_sessions().await?;
    if sessions.len() >= max_sessions_allowed {
        // TODO Should trigger pool dynamic scalability. Right now this will only consider the pool lower bound.
        // "Reached maximum number of concurrent sessions allowed: {}"
        return Err(Error::ConcurrentSessionsLimitBreached(sessions.len()));
    }

    let repository_id = session_configuration
        .repository_source
        .repository_id
        .as_str();

    let repository = get_repository(repository_id)
        .await?
        .ok_or_else(|| Error::Failure("".to_string()))?;
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
            RepositoryVersionState::Ready { devcontainer_json } => {
                parse_devcontainer(devcontainer_json.as_str())
            }
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
    // TODO
    let image = match devcontainer.clone().image {
        Some(image) => image,
        None => {
            return Err(Error::IncorrectDevContainerValue("Missing image"));
        }
    };
    let ports = ports(&devcontainer);

    // TODO deploy a new ingress matching the route
    // With the proper mapping
    // Define the correct route
    // Also deploy proper tcp mapping configmap https://kubernetes.github.io/ingress-nginx/user-guide/exposing-tcp-udp-services/

    let mut sessions = BTreeMap::new();
    sessions.insert(id.to_string(), ports.clone());
    patch_ingress(&sessions).await?;

    // Now create the session itself
    let client = client()?;

    let duration = session_configuration
        .duration
        .unwrap_or(configuration.session.duration);

    let envs = devcontainer
        .container_env
        .unwrap_or_default()
        .iter()
        .map(|(k, v)| NameValuePair {
            name: k.to_string(),
            value: v.to_string(),
        })
        .collect();

    // Deploy a new pod for this image
    let pod_api: Api<Pod> = Api::namespaced(client.clone(), &user_namespace(user_id));
    pod_api
        .create(
            &PostParams::default(),
            &session_to_pod(&user.id, id, image.as_str(), &duration, &pool_id, envs),
        )
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    // Deploy the associated service
    let service_api: Api<Service> = Api::namespaced(client.clone(), &user_namespace(user_id));
    let service_name = service_name(id);
    let service = service(id, &service_name, ports);
    service_api
        .create(&PostParams::default(), &service)
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    // Deploy the ingress local service
    let service_local_api: Api<Service> = Api::default_namespaced(client.clone());
    service_local_api
        .create(
            &PostParams::default(),
            &external_service(&local_service_name(id), &service_name, id),
        )
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    Ok(())
}

pub async fn update_session(
    user_id: &str,
    id: &str,
    configuration: Configuration,
    session_configuration: SessionUpdateConfiguration,
) -> Result<()> {
    let session = get_session(user_id, id)
        .await?
        .ok_or_else(|| Error::UnknownResource(ResourceType::Session, id.to_string()))?;

    let duration = session_configuration
        .duration
        .unwrap_or(configuration.session.duration);
    let max_duration = configuration.session.max_duration;
    if duration >= max_duration {
        return Err(Error::DurationLimitBreached(max_duration.as_millis()));
    }
    if duration != session.max_duration {
        let client = client()?;
        let pod_api: Api<Pod> = Api::namespaced(client.clone(), &user_namespace(user_id));
        update_annotation_value(
            &pod_api,
            id,
            SESSION_DURATION_ANNOTATION,
            json!(duration_to_string(duration)),
        )
        .await?
    }

    Ok(())
}

pub async fn delete_session(user_id: &str, id: &str) -> Result<()> {
    let client = client()?;
    get_session(user_id, id)
        .await?
        .ok_or_else(|| Error::UnknownResource(ResourceType::Session, id.to_string()))?;

    // Undeploy the ingress local service
    let service_local_api: Api<Service> = Api::default_namespaced(client.clone());
    service_local_api
        .delete(
            &local_service_name(id),
            &DeleteParams::default().grace_period(0),
        )
        .await
        .map_err(Error::K8sCommunicationFailure)?;

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
        .ok_or(Error::MissingData("spec"))?
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

pub async fn create_session_execution(
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
