//! Helper methods ton interact with k8s
use crate::{
    error::{Error, Result},
    kubernetes::get_host,
    types::{
        self, ConditionType, Configuration, ContainerPhase, LoggedUser, Phase, Port,
        RepositoryRuntimeConfiguration, Session, SessionConfiguration, SessionUpdateConfiguration,
        Status, Template,
    },
};
use json_patch::{AddOperation, PatchOperation};
use k8s_openapi::api::{
    core::v1::{
        Affinity, Container, ContainerStatus, EnvVar, NodeAffinity, NodeSelectorRequirement,
        NodeSelectorTerm, Pod, PodCondition, PodSpec, PreferredSchedulingTerm,
        ResourceRequirements, Service, ServicePort, ServiceSpec,
    },
    networking::v1::{HTTPIngressPath, HTTPIngressRuleValue, Ingress, IngressRule},
};
use k8s_openapi::apimachinery::pkg::{
    api::resource::Quantity, apis::meta::v1::ObjectMeta, util::intstr::IntOrString,
};
use kube::api::{Api, DeleteParams, Patch, PatchParams, PostParams};
use serde_json::json;
use std::{collections::BTreeMap, str::FromStr, time::Duration};

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
const TEMPLATE_ANNOTATION: &str = "playground.substrate.io/template";
const SESSION_DURATION_ANNOTATION: &str = "playground.substrate.io/session_duration";
const THEIA_WEB_PORT: i32 = 3000;

pub fn pod_name(user: &str) -> String {
    format!("{}-{}", COMPONENT_VALUE, user)
}

pub fn service_name(session_id: &str) -> String {
    format!("{}-service-{}", COMPONENT_VALUE, session_id)
}

fn session_duration_annotation(duration: Duration) -> String {
    let duration_min = duration.as_secs() / 60;
    duration_min.to_string()
}

fn str_to_session_duration_minutes(str: &str) -> Result<Duration> {
    Ok(Duration::from_secs(
        str.parse::<u64>()
            .map_err(|err| Error::Failure(err.into()))?
            * 60,
    ))
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

fn workspace_duration_annotation(duration: Duration) -> String {
    let duration_min = duration.as_secs() / 60;
    duration_min.to_string()
}

fn create_pod_annotations(
    template: &Template,
    duration: &Duration,
) -> Result<BTreeMap<String, String>> {
    let mut annotations = BTreeMap::new();
    let s = serde_yaml::to_string(template).map_err(|err| Error::Failure(err.into()))?;
    annotations.insert(TEMPLATE_ANNOTATION.to_string(), s);
    annotations.insert(
        SESSION_DURATION_ANNOTATION.to_string(),
        workspace_duration_annotation(*duration),
    );
    Ok(annotations)
}

fn create_pod(
    session_id: &str,
    template: &Template,
    duration: &Duration,
    pool_id: &str,
) -> Result<Pod> {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_VALUE.to_string());
    labels.insert(OWNER_LABEL.to_string(), session_id.to_string());

    Ok(Pod {
        metadata: ObjectMeta {
            name: Some(pod_name(session_id)),
            labels: Some(labels),
            annotations: Some(create_pod_annotations(template, duration)?),
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
                ..Default::default()
            }],
            termination_grace_period_seconds: Some(1),
            ..Default::default()
        }),
        ..Default::default()
    })
}

fn create_service(session_id: &str, runtime: &RepositoryRuntimeConfiguration) -> Service {
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
            name: Some(service_name(session_id)),
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

fn condition_to_condition(condition: &PodCondition) -> types::PodCondition {
    types::PodCondition {
        type_: ConditionType::from_str(condition.type_.as_str()).unwrap_or(ConditionType::Unknown),
        status: Status::from_str(condition.status.as_str()).unwrap_or(Status::Unknown),
        reason: condition.clone().reason,
        message: condition.clone().message,
    }
}
fn container_status_to_container_status(status: &ContainerStatus) -> types::ContainerStatus {
    let state = status.state.as_ref();
    types::ContainerStatus {
        phase: state
            .map(|s| {
                if s.running.is_some() {
                    ContainerPhase::Running
                } else if s.waiting.is_some() {
                    ContainerPhase::Waiting
                } else {
                    ContainerPhase::Terminated
                }
            })
            .unwrap_or(ContainerPhase::Unknown),
        reason: state.and_then(|s| {
            s.waiting
                .as_ref()
                .and_then(|s| s.reason.clone())
                .or_else(|| s.terminated.as_ref().and_then(|s| s.reason.clone()))
        }),
        message: state.and_then(|s| {
            s.waiting
                .as_ref()
                .and_then(|s| s.message.clone())
                .or_else(|| s.terminated.as_ref().and_then(|s| s.message.clone()))
        }),
    }
}

fn pod_to_details(pod: &Pod) -> Result<types::Pod> {
    let status = pod.status.as_ref().ok_or(Error::MissingData("status"))?;
    let conditions = status.clone().conditions;
    let container_statuses = status.clone().container_statuses;
    let container_status = container_statuses.as_ref().and_then(|v| v.first());
    Ok(types::Pod {
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
        conditions: conditions.map(|v| v.iter().map(|c| condition_to_condition(c)).collect()),
        container: container_status.map(|c| container_status_to_container_status(c)),
    })
}

// Creates a Session from a Pod annotations
fn pod_to_session(pod: &Pod) -> Result<Session> {
    let labels = pod
        .metadata
        .labels
        .clone()
        .ok_or(Error::MissingData("pod#metadata#labels"))?;
    let unknown = "UNKNOWN OWNER".to_string();
    let username = labels.get(OWNER_LABEL).unwrap_or(&unknown);
    let annotations = &pod
        .metadata
        .annotations
        .clone()
        .ok_or(Error::MissingData("pod#metadata#annotations"))?;
    let template = serde_yaml::from_str(
        annotations
            .get(TEMPLATE_ANNOTATION)
            .ok_or(Error::MissingData("template"))?,
    )
    .map_err(|err| Error::Failure(err.into()))?;
    let duration = str_to_session_duration_minutes(
        annotations
            .get(SESSION_DURATION_ANNOTATION)
            .ok_or(Error::MissingData("template#session_duration"))?,
    )?;

    Ok(Session {
        id: username.clone(),
        user_id: username.clone(),
        template,
        pod: pod_to_details(&pod.clone())?,
        duration,
        node: pod
            .clone()
            .spec
            .ok_or(Error::MissingData("pod#spec"))?
            .node_name
            .unwrap_or_else(|| "<Unknown>".to_string()),
    })
}

pub async fn get_session(id: &str) -> Result<Option<Session>> {
    let client = client().await?;
    let pod_api: Api<Pod> = Api::default_namespaced(client);
    // TODO use get_opt?
    let pod = pod_api.get(&pod_name(id)).await.ok();

    match pod.map(|pod| pod_to_session(&pod)) {
        Some(session) => session.map(Some),
        None => Ok(None),
    }
}

/// Lists all currently running sessions
pub async fn list_sessions() -> Result<Vec<Session>> {
    let client = client().await?;
    let pod_api: Api<Pod> = Api::default_namespaced(client);
    let pods = list_by_selector(
        &pod_api,
        format!("{}={}", COMPONENT_LABEL, COMPONENT_VALUE).to_string(),
    )
    .await?;

    Ok(pods
        .iter()
        .flat_map(|pod| pod_to_session(pod).ok())
        .collect())
}

pub async fn patch_ingress(runtimes: &BTreeMap<String, Vec<Port>>) -> Result<()> {
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
    let mut rules: Vec<IngressRule> = spec.rules.unwrap_or_default();
    let host = get_host().await?;
    for (id, ports) in runtimes {
        let subdomain = subdomain(&host, id);
        println!("Adding domain {}", subdomain);
        rules.push(IngressRule {
            host: Some(subdomain.clone()),
            http: Some(HTTPIngressRuleValue {
                paths: ingress_paths(service_name(id), ports),
            }),
        });
    }
    spec.rules = Some(rules);
    ingress.spec.replace(spec);

    ingress_api
        .replace(INGRESS_NAME, &PostParams::default(), &ingress)
        .await
        .map_err(|err| Error::Failure(err.into()))?;
    println!("Patched ingress");

    Ok(())
}

pub async fn create_session(
    user: &LoggedUser,
    session_id: &str,
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
                .unwrap_or(configuration.clone().workspace.pool_affinity)
        });
    let pool = get_pool(&pool_id)
        .await?
        .ok_or(Error::MissingData("no matching pool"))?;
    let max_sessions_allowed = pool.nodes.len() * configuration.workspace.max_workspaces_per_pod;
    let sessions = list_sessions().await?;
    if sessions.len() >= max_sessions_allowed {
        // TODO Should trigger pool dynamic scalability. Right now this will only consider the pool lower bound.
        // "Reached maximum number of concurrent sessions allowed: {}"
        return Err(Error::ConcurrentWorkspacesLimitBreached(sessions.len()));
    }
    let client = client().await?;
    // Access the right image id
    let templates = list_templates().await?;
    let template = templates
        .iter()
        .find(|template| template.name == session_configuration.template)
        .ok_or(Error::MissingData("no matching template"))?;

    let pod_api: Api<Pod> = Api::default_namespaced(client.clone());

    //TODO deploy a new ingress matching the route
    // With the proper mapping
    // Define the correct route
    // Also deploy proper tcp mapping configmap https://kubernetes.github.io/ingress-nginx/user-guide/exposing-tcp-udp-services/

    let mut sessions = BTreeMap::new();
    sessions.insert(
        session_id.to_string(),
        template
            .runtime
            .as_ref()
            .unwrap()
            .ports
            .clone()
            .unwrap_or_default(),
    );
    patch_ingress(&sessions).await?;

    let duration = session_configuration
        .duration
        .unwrap_or(configuration.workspace.duration);

    // Deploy a new pod for this image
    pod_api
        .create(
            &PostParams::default(),
            &create_pod(session_id, template, &duration, &pool_id)?,
        )
        .await
        .map_err(|err| Error::Failure(err.into()))?;

    // Deploy the associated service
    let service_api: Api<Service> = Api::default_namespaced(client.clone());
    let service = create_service(session_id, template.runtime.as_ref().unwrap());
    service_api
        .create(&PostParams::default(), &service)
        .await
        .map_err(|err| Error::Failure(err.into()))?;

    Ok(())
}

pub async fn update_session(
    session_id: &str,
    configuration: Configuration,
    session_configuration: SessionUpdateConfiguration,
) -> Result<()> {
    let session = get_session(session_id)
        .await?
        .ok_or(Error::MissingData("no matching session"))?;

    let duration = session_configuration
        .duration
        .unwrap_or(configuration.workspace.duration);
    let max_duration = configuration.workspace.max_duration;
    if duration >= max_duration {
        return Err(Error::DurationLimitBreached(max_duration.as_millis()));
    }
    if duration != session.duration {
        let client = client().await?;
        let pod_api: Api<Pod> = Api::default_namespaced(client);
        let params = PatchParams {
            ..PatchParams::default()
        };
        let patch: Patch<json_patch::Patch> =
            Patch::Json(json_patch::Patch(vec![PatchOperation::Add(AddOperation {
                path: format!(
                    "/metadata/annotations/{}",
                    SESSION_DURATION_ANNOTATION.replace("/", "~1")
                ),
                value: json!(session_duration_annotation(duration)),
            })]));
        pod_api
            .patch(&pod_name(&session.user_id), &params, &patch)
            .await
            .map_err(|err| Error::Failure(err.into()))?;
    }

    Ok(())
}

pub async fn delete_session(id: &str) -> Result<()> {
    // Undeploy the service by its id
    let client = client().await?;
    let service_api: Api<Service> = Api::default_namespaced(client.clone());
    service_api
        .delete(&service_name(id), &DeleteParams::default())
        .await
        .map_err(|err| Error::Failure(err.into()))?;

    let pod_api: Api<Pod> = Api::default_namespaced(client.clone());
    pod_api
        .delete(&pod_name(id), &DeleteParams::default())
        .await
        .map_err(|err| Error::Failure(err.into()))?;

    let host = get_host().await?;
    let subdomain = subdomain(&host, id);
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
