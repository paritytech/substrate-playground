//! Helper methods ton interact with k8s
use crate::{
    error::{Error, ResourceType, Result},
    kubernetes::get_host,
    types::{
        self, Configuration, LoggedUser, Port, RepositoryRuntimeConfiguration, Session,
        SessionConfiguration, SessionExecution, SessionExecutionConfiguration,
        SessionUpdateConfiguration, Template,
    },
};
use futures::StreamExt;
use json_patch::{AddOperation, PatchOperation};
use k8s_openapi::api::{
    core::v1::{
        Affinity, Container, EnvVar, Namespace, NodeAffinity, NodeSelectorRequirement,
        NodeSelectorTerm, Pod, PodSpec, PreferredSchedulingTerm, ResourceRequirements,
        SecurityContext, Service, ServicePort, ServiceSpec, ServiceAccount,
    },
    networking::v1::{HTTPIngressPath, HTTPIngressRuleValue, Ingress, IngressRule},
};
use k8s_openapi::apimachinery::pkg::{
    api::resource::Quantity, apis::meta::v1::ObjectMeta, util::intstr::IntOrString,
};
use kube::api::{
    Api, AttachParams, AttachedProcess, DeleteParams, Patch, PatchParams, PostParams, ResourceExt,
};
use serde_json::json;
use std::{
    collections::BTreeMap,
    time::{Duration, SystemTime},
};

use super::{
    client, env_var, ingress_path, list_by_selector, pool::get_pool, template::list_templates,
};

const NODE_POOL_LABEL: &str = "app.playground/pool";

const APP_LABEL: &str = "app.kubernetes.io/part-of";
const APP_VALUE: &str = "playground";
const COMPONENT_LABEL: &str = "app.kubernetes.io/component";
const COMPONENT_VALUE: &str = "session";

const OWNER_LABEL: &str = "app.kubernetes.io/owner";
const INGRESS_NAME: &str = "ingress";
const SESSION_DURATION_ANNOTATION: &str = "playground.substrate.io/session_duration";
const THEIA_WEB_PORT: i32 = 3000;
const SESSION_NAME: &str = "session";
const SERVICE_SESSION_NAME: &str = "session-service-account";

fn duration_to_string(duration: Duration) -> String {
    duration.as_secs().to_string()
}

fn string_to_duration(str: &str) -> Duration {
    Duration::from_secs(str.parse::<u64>().unwrap_or(0))
}

// Model

fn pod_env_variables(conf: &RepositoryRuntimeConfiguration, session_id: &str) -> Vec<EnvVar> {
    let mut envs = vec![
        env_var("SUBSTRATE_PLAYGROUND", ""),
        env_var("SUBSTRATE_PLAYGROUND_SESSION", session_id),
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

fn pod_annotations(duration: &Duration) -> BTreeMap<String, String> {
    let mut annotations = BTreeMap::new();
    annotations.insert(
        SESSION_DURATION_ANNOTATION.to_string(),
        duration_to_string(*duration),
    );
    annotations
}

fn pod(
    user_id: &str,
    session_id: &str,
    template: &Template,
    duration: &Duration,
    pool_id: &str,
) -> Pod {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_VALUE.to_string());
    labels.insert(OWNER_LABEL.to_string(), user_id.to_string());

    Pod {
        metadata: ObjectMeta {
            name: Some(SESSION_NAME.to_string()),
            labels: Some(labels),
            annotations: Some(pod_annotations(duration)),
            ..Default::default()
        },
        spec: Some(PodSpec {
            service_account: Some(SERVICE_SESSION_NAME.to_string()),
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
                name: format!("{}-container", COMPONENT_VALUE),
                image: Some(template.image.to_string()),
                env: Some(pod_env_variables(
                    template.runtime.as_ref().unwrap(),
                    session_id,
                )),
                resources: Some(ResourceRequirements {
                    requests: Some(BTreeMap::from([
                        ("memory".to_string(), Quantity("1Gi".to_string())),
                        (
                            "ephemeral-storage".to_string(),
                            Quantity("25Gi".to_string()),
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
                    run_as_non_root: Some(true),
                    ..Default::default()
                }),
                ..Default::default()
            }],
            termination_grace_period_seconds: Some(1),
            automount_service_account_token: Some(false),
            ..Default::default()
        }),
        ..Default::default()
    }
}

fn namespace(name: String) -> Result<Namespace> {
    let mut labels = BTreeMap::new();
    labels.insert(NAMESPACE_TYPE.to_string(), NAMESPACE_SESSION.to_string());
    Ok(Namespace {
        metadata: ObjectMeta {
            name: Some(name),
            labels: Some(labels),
            ..Default::default()
        },
        ..Default::default()
    })
}

const SESSION_SERVICE_NAME: &str = "service";

fn service(session_id: &str, runtime: &RepositoryRuntimeConfiguration) -> Service {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_VALUE.to_string());
    labels.insert(OWNER_LABEL.to_string(), session_id.to_string());
    let mut selector = BTreeMap::new();
    selector.insert(OWNER_LABEL.to_string(), session_id.to_string());

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
            name: Some(SESSION_SERVICE_NAME.to_string()),
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

fn external_service(local_service_name: &str, session_namespace: &str) -> Service {
    Service {
        metadata: ObjectMeta {
            name: Some(local_service_name.to_string()),
            ..Default::default()
        },
        spec: Some(ServiceSpec {
            type_: Some("ExternalName".to_string()),
            external_name: Some(format!(
                "{}.{}.svc.cluster.local",
                SESSION_SERVICE_NAME, session_namespace
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
                };
            } else if let Some(terminated) = &state.terminated {
                return types::SessionState::Failed {
                    message: terminated.message.clone().unwrap_or_default(),
                    reason: terminated.reason.clone().unwrap_or_default(),
                };
            }
        }
    }
    types::SessionState::Deploying
}

// Creates a Session from a Pod annotations
fn pod_to_session(id: &str, pod: &Pod) -> Session {
    let max_duration = string_to_duration(
        pod.annotations()
            .get(SESSION_DURATION_ANNOTATION)
            .unwrap_or(&"".to_string()),
    );
    Session {
        id: id.to_string(),
        user_id: pod
            .labels()
            .get(OWNER_LABEL)
            .unwrap_or(&"".to_string())
            .to_string(),
        max_duration,
        state: pod_to_state(pod),
    }
}

pub async fn get_session(session_id: &str) -> Result<Option<Session>> {
    let client = client()?;
    let pod_api: Api<Pod> = Api::namespaced(client, session_id);
    let pod = pod_api
        .get_opt(SESSION_NAME)
        .await
        .map_err(|err| Error::Failure(err.into()))?;

    match pod.map(|pod| pod_to_session(session_id, &pod)) {
        Some(session) => Ok(Some(session)),
        None => Ok(None),
    }
}

const NAMESPACE_TYPE: &str = "NAMESPACE_TYPE";
const NAMESPACE_SESSION: &str = "NAMESPACE_SESSION";

/// Lists all currently running sessions
pub async fn list_sessions() -> Result<Vec<Session>> {
    let client = client()?;
    let namespace_api: Api<Namespace> = Api::all(client);

    let namespaces = list_by_selector(
        &namespace_api,
        format!("{}={}", NAMESPACE_TYPE, NAMESPACE_SESSION).to_string(),
    )
    .await?;

    Ok(futures::stream::iter(
        namespaces
            .iter()
            .flat_map(|namespace| namespace.metadata.name.clone()),
    )
    .filter_map(|name| async move { get_session(&name).await.ok().flatten() })
    .collect::<Vec<Session>>()
    .await)
}

pub async fn patch_ingress(runtimes: &BTreeMap<String, Vec<Port>>) -> Result<()> {
    let client = client()?;
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
        .map_err(|err| Error::Failure(err.into()))?;

    Ok(())
}

fn local_service_name(session_id: &str) -> String {
    format!("service-{}", session_id)
}

pub async fn create_session(
    user: &LoggedUser,
    id: &str,
    configuration: Configuration,
    session_configuration: SessionConfiguration,
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
            user.clone()
                .pool_affinity
                .unwrap_or(configuration.clone().session.pool_affinity)
        });
    let pool = get_pool(&pool_id)
        .await?
        .ok_or_else(|| Error::UnknownResource(ResourceType::Pool, pool_id.clone()))?;
    let max_sessions_allowed = pool.nodes.len() * configuration.session.max_sessions_per_pod;
    let sessions = list_sessions().await?;
    if sessions.len() >= max_sessions_allowed {
        // TODO Should trigger pool dynamic scalability. Right now this will only consider the pool lower bound.
        // "Reached maximum number of concurrent sessions allowed: {}"
        return Err(Error::ConcurrentSessionsLimitBreached(sessions.len()));
    }

    // Access the right image id
    let templates = list_templates().await?;
    let template = templates
        .iter()
        .find(|template| template.id == session_configuration.template)
        .ok_or(Error::UnknownResource(
            ResourceType::Template,
            session_configuration.template,
        ))?;
    // TODO deploy a new ingress matching the route
    // With the proper mapping
    // Define the correct route
    // Also deploy proper tcp mapping configmap https://kubernetes.github.io/ingress-nginx/user-guide/exposing-tcp-udp-services/

    let mut sessions = BTreeMap::new();
    sessions.insert(
        id.to_string(),
        template
            .runtime
            .as_ref()
            .unwrap()
            .ports
            .clone()
            .unwrap_or_default(),
    );
    let local_service_name = local_service_name(id);
    patch_ingress(&sessions).await?;

    // Now create the session itself
    let client = client()?;

    let duration = session_configuration
        .duration
        .unwrap_or(configuration.session.duration);

    // Deploy a new namespace for this session, if needed
    let namespace_api: Api<Namespace> = Api::all(client.clone());
    if namespace_api
        .get_opt(id)
        .await
        .map_err(|err| Error::Failure(err.into()))?
        .is_none()
    {
        namespace_api
            .create(&PostParams::default(), &namespace(id.to_string())?)
            .await
            .map_err(|err| Error::Failure(err.into()))?;

        let service_account_api: Api<ServiceAccount> = Api::namespaced(client.clone(), id);
        service_account_api
            .create(&PostParams::default(), &ServiceAccount {
                metadata: ObjectMeta {
                    name: Some(SERVICE_SESSION_NAME.to_string()),
                    ..Default::default()
                },
                ..Default::default()
            })
            .await
            .map_err(|err| Error::Failure(err.into()))?;
    }
    // Deploy a new pod for this image
    let pod_api: Api<Pod> = Api::namespaced(client.clone(), id);
    pod_api
        .create(
            &PostParams::default(),
            &pod(&user.id, id, template, &duration, &pool_id),
        )
        .await
        .map_err(|err| Error::Failure(err.into()))?;

    // Deploy the associated service
    let service_api: Api<Service> = Api::namespaced(client.clone(), id);
    let service = service(id, template.runtime.as_ref().unwrap());
    service_api
        .create(&PostParams::default(), &service)
        .await
        .map_err(|err| Error::Failure(err.into()))?;

    // Deploy the ingress local service
    let service_local_api: Api<Service> = Api::default_namespaced(client.clone());
    service_local_api
        .create(
            &PostParams::default(),
            &external_service(&local_service_name, id),
        )
        .await
        .map_err(|err| Error::Failure(err.into()))?;

    Ok(())
}

pub async fn update_session(
    id: &str,
    configuration: Configuration,
    session_configuration: SessionUpdateConfiguration,
) -> Result<()> {
    let session = get_session(id)
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
        let pod_api: Api<Pod> = Api::namespaced(client.clone(), id);
        let params = PatchParams {
            ..PatchParams::default()
        };
        let patch: Patch<json_patch::Patch> =
            Patch::Json(json_patch::Patch(vec![PatchOperation::Add(AddOperation {
                path: format!(
                    "/metadata/annotations/{}",
                    SESSION_DURATION_ANNOTATION.replace('/', "~1")
                ),
                value: json!(duration_to_string(duration)),
            })]));
        pod_api
            .patch(SESSION_NAME, &params, &patch)
            .await
            .map_err(|err| Error::Failure(err.into()))?;
    }

    Ok(())
}

pub async fn delete_session(id: &str) -> Result<()> {
    let client = client()?;
    get_session(id)
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
        .map_err(|err| Error::Failure(err.into()))?;

    // Undeploy the ingress service
    let service_api: Api<Service> = Api::namespaced(client.clone(), id);
    service_api
        .delete(
            SESSION_SERVICE_NAME,
            &DeleteParams::default().grace_period(0),
        )
        .await
        .map_err(|err| Error::Failure(err.into()))?;

    // Undeploy the pod
    let pod_api: Api<Pod> = Api::namespaced(client.clone(), id);
    pod_api
        .delete(SESSION_NAME, &DeleteParams::default().grace_period(0))
        .await
        .map_err(|err| Error::Failure(err.into()))?;

    // Remove the ingress route
    let host = get_host().await?;
    let subdomain = subdomain(&host, id);
    let ingress_api: Api<Ingress> = Api::default_namespaced(client.clone());
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
        .unwrap()
        .into_iter()
        .filter(|rule| rule.clone().host.unwrap_or_else(|| "unknown".to_string()) != subdomain)
        .collect();
    spec.rules.replace(rules);
    ingress.spec.replace(spec);

    ingress_api
        .replace(INGRESS_NAME, &PostParams::default(), &ingress)
        .await
        .map_err(|err| Error::Failure(err.into()))?;

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
    session_id: &str,
    execution_configuration: SessionExecutionConfiguration,
) -> Result<SessionExecution> {
    let client = client()?;
    let pod_api: Api<Pod> = Api::namespaced(client, session_id);
    let attached = pod_api
        .exec(
            session_id,
            execution_configuration.command,
            &AttachParams::default(),
        )
        .await
        .map_err(|err| Error::Failure(err.into()))?;

    Ok(SessionExecution {
        stdout: get_output(attached).await,
    })
}
