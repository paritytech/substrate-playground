//! Helper methods ton interact with k8s
use crate::{
    error::{Error, Result},
    kubernetes_utils::{
        add_config_map_value, client, config, delete_config_map_value, env_var, get_config_map,
        ingress_path, list_by_selector,
    },
    types::{
        self, Configuration, ContainerConfiguration, Environment, LoggedUser, Pool, Repository,
        RepositoryVersion, RepositoryVersionState, Runtime, User, UserConfiguration,
        UserUpdateConfiguration, Workspace, WorkspaceConfiguration, WorkspaceDefaults,
        WorkspaceState, WorkspaceUpdateConfiguration,
    },
};
use json_patch::{AddOperation, PatchOperation};
use k8s_openapi::api::{
    core::v1::{
        Affinity, Container, EnvVar, Node, NodeAffinity, NodeSelectorRequirement, NodeSelectorTerm,
        PersistentVolumeClaim, PersistentVolumeClaimSpec, PersistentVolumeClaimVolumeSource, Pod,
        PodSpec, PreferredSchedulingTerm, ResourceRequirements, Service, ServicePort, ServiceSpec,
        TypedLocalObjectReference, Volume, VolumeMount,
    },
    extensions::v1beta1::{HTTPIngressPath, HTTPIngressRuleValue, Ingress, IngressRule},
};
use k8s_openapi::apimachinery::pkg::{
    api::resource::Quantity, apis::meta::v1::ObjectMeta, util::intstr::IntOrString,
};
use kube::{
    api::{Api, DeleteParams, ListParams, Patch, PatchParams, PostParams},
    Client, Resource,
};
use log::error;
use serde_json::json;
use std::{collections::BTreeMap, convert::TryFrom, env, num::ParseIntError, time::Duration};

const NODE_POOL_LABEL: &str = "cloud.google.com/gke-nodepool";
const INSTANCE_TYPE_LABEL: &str = "node.kubernetes.io/instance-type";
const HOSTNAME_LABEL: &str = "kubernetes.io/hostname";
const APP_LABEL: &str = "app.kubernetes.io/part-of";
const APP_VALUE: &str = "playground";
const COMPONENT_LABEL: &str = "app.kubernetes.io/component";
const COMPONENT_VALUE: &str = "workspaca";
const OWNER_LABEL: &str = "app.kubernetes.io/owner";
const INGRESS_NAME: &str = "ingress";
const TEMPLATE_ANNOTATION: &str = "playground.substrate.io/template";
const WORKSPACE_DURATION_ANNOTATION: &str = "playground.substrate.io/workspace_duration";
const USERS_CONFIG_MAP: &str = "playground-users";
const THEIA_WEB_PORT: i32 = 3000;

pub fn pod_name(user: &str) -> String {
    format!("{}-{}", COMPONENT_VALUE, user)
}

pub fn service_name(workspace_id: &str) -> String {
    format!("{}-service-{}", COMPONENT_VALUE, workspace_id)
}

// Model

fn pod_env_variables(runtime: &Runtime, host: &str, workspace_id: &str) -> Vec<EnvVar> {
    let mut envs = vec![
        env_var("SUBSTRATE_PLAYGROUND", ""),
        env_var("SUBSTRATE_PLAYGROUND_WORKSPACE", workspace_id),
        env_var("SUBSTRATE_PLAYGROUND_HOSTNAME", host),
    ];
    if let Some(mut template_envs) = runtime.env.clone().map(|envs| {
        envs.iter()
            .map(|env| env_var(&env.name, &env.value))
            .collect::<Vec<EnvVar>>()
    }) {
        envs.append(&mut template_envs);
    };
    envs
}

fn runtime() -> Runtime {
    // TODO
    Runtime {
        container_configuration: ContainerConfiguration::IMAGE("".to_string()),
        env: None,
        ports: None,
    }
}

// TODO detect when ingress is restarted, then re-sync theia workspaces

fn workspace_duration_annotation(duration: Duration) -> String {
    let duration_min = duration.as_secs() / 60;
    duration_min.to_string()
}

fn str_to_workspace_duration_minutes(str: &str) -> Result<Duration> {
    Ok(Duration::from_secs(
        str.parse::<u64>()
            .map_err(|err| Error::Failure(err.into()))?
            * 60,
    ))
}

fn create_pod_annotations(duration: &Duration) -> Result<BTreeMap<String, String>> {
    let mut annotations = BTreeMap::new();
    annotations.insert(
        WORKSPACE_DURATION_ANNOTATION.to_string(),
        workspace_duration_annotation(*duration),
    );
    Ok(annotations)
}

fn workspace_name(workspace_id: &str, template_id: &str) -> String {
    format!("workspace-{}-{}", template_id, workspace_id)
}

async fn get_workspace(
    api: &Api<PersistentVolumeClaim>,
    name: &str,
) -> Result<PersistentVolumeClaim> {
    api.get(name)
        .await
        .map_err(|err| Error::Failure(err.into()))
}

fn workspace_template_name(template_id: &str) -> String {
    format!("workspace-template-{}", template_id)
}

fn workspace(workspace_id: &str, template_id: &str) -> PersistentVolumeClaim {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_VALUE.to_string());
    labels.insert(OWNER_LABEL.to_string(), workspace_id.to_string());

    let mut requests = BTreeMap::new();
    requests.insert("storage".to_string(), Quantity("5Gi".to_string()));

    PersistentVolumeClaim {
        metadata: ObjectMeta {
            name: Some(workspace_name(workspace_id, template_id)),
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
                name: workspace_template_name(template_id),
                ..Default::default()
            }),
            ..Default::default()
        }),
        ..Default::default()
    }
}

async fn get_or_create_volume(
    api: &Api<PersistentVolumeClaim>,
    workspace_id: &str,
    template_id: &str,
) -> Result<PersistentVolumeClaim> {
    let name = workspace_name(workspace_id, template_id);
    match get_workspace(api, &name).await {
        Ok(res) => Ok(res),
        Err(_) => api
            .create(
                &PostParams::default(),
                &workspace(workspace_id, template_id),
            )
            .await
            .map_err(|err| Error::Failure(err.into())),
    }
}

fn create_pod(
    env: &Environment,
    workspace_id: &str,
    runtime: &Runtime,
    duration: &Duration,
    pool_id: &str,
    workspace: &PersistentVolumeClaim,
) -> Result<Pod> {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_VALUE.to_string());
    labels.insert(OWNER_LABEL.to_string(), workspace_id.to_string());

    Ok(Pod {
        metadata: ObjectMeta {
            name: Some(pod_name(workspace_id)),
            labels: Some(labels),
            annotations: Some(create_pod_annotations(duration)?),
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
                image: Some("BASE_IMAGE TODO".to_string()),
                env: Some(pod_env_variables(runtime, &env.host, workspace_id)),
                volume_mounts: Some(vec![VolumeMount {
                    name: "repo".to_string(),
                    mount_path: "/workspace".to_string(),
                    ..Default::default()
                }]),
                ..Default::default()
            }],
            termination_grace_period_seconds: Some(1),
            volumes: Some(vec![Volume {
                name: "repo".to_string(),
                persistent_volume_claim: Some(PersistentVolumeClaimVolumeSource {
                    claim_name: workspace
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

fn create_service(workspace_id: &str, runtime: &Runtime) -> Service {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_VALUE.to_string());
    labels.insert(OWNER_LABEL.to_string(), workspace_id.to_string());
    let mut selectors = BTreeMap::new();
    selectors.insert(OWNER_LABEL.to_string(), workspace_id.to_string());

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
            name: Some(service_name(workspace_id)),
            labels: Some(labels),
            ..Default::default()
        },
        spec: Some(ServiceSpec {
            type_: Some("NodePort".to_string()),
            selector: Some(selectors),
            ports: Some(ports),
            ..Default::default()
        }),
        ..Default::default()
    }
}

fn ingress_paths(service_name: String, runtime: &Runtime) -> Vec<HTTPIngressPath> {
    let mut paths = vec![ingress_path("/", &service_name, THEIA_WEB_PORT)];
    if let Some(mut template_paths) = runtime.ports.clone().map(|ports| {
        ports
            .iter()
            .map(|port| ingress_path(&port.clone().path, &service_name.clone(), port.port))
            .collect()
    }) {
        paths.append(&mut template_paths);
    };
    paths
}

fn subdomain(host: &str, workspace_id: &str) -> String {
    format!("{}.{}", workspace_id, host)
}

async fn list_users(client: Client, namespace: &str) -> Result<BTreeMap<String, String>> {
    get_config_map(client, namespace, USERS_CONFIG_MAP).await
}

#[derive(Clone)]
pub struct Secrets {
    pub github_client_secret: String,
}

#[derive(Clone)]
pub struct Engine {
    pub env: Environment,
    pub configuration: Configuration,
    pub secrets: Secrets,
}

fn var(name: &'static str) -> Result<String> {
    env::var(name).map_err(|_| Error::MissingData(name))
}

impl Engine {
    pub async fn new() -> Result<Self> {
        let config = config().await?;
        let namespace = config.clone().default_ns.to_string();
        let client = Client::try_from(config).map_err(|err| Error::Failure(err.into()))?;
        let ingress_api: Api<Ingress> = Api::namespaced(client.clone(), &namespace);
        let secured = if let Ok(ingress) = ingress_api.get(INGRESS_NAME).await {
            ingress
                .spec
                .ok_or(Error::MissingData("spec"))?
                .tls
                .is_some()
        } else {
            false
        };

        let host = if let Ok(ingress) = ingress_api.get(INGRESS_NAME).await {
            ingress
                .spec
                .ok_or(Error::MissingData("spec"))?
                .rules
                .ok_or(Error::MissingData("spec#rules"))?
                .first()
                .ok_or(Error::MissingData("spec#rules[0]"))?
                .host
                .as_ref()
                .ok_or(Error::MissingData("spec#rules[0]#host"))?
                .clone()
        } else {
            "localhost".to_string()
        };

        // Retrieve 'static' configuration from Env variables
        let github_client_id = var("GITHUB_CLIENT_ID")?;
        let github_client_secret = var("GITHUB_CLIENT_SECRET")?;
        let workspace_default_duration = var("WORKSPACE_DEFAULT_DURATION")?;
        let workspace_max_duration = var("WORKSPACE_MAX_DURATION")?;
        let workspace_default_pool_affinity = var("WORKSPACE_DEFAULT_POOL_AFFINITY")?;
        let workspace_default_max_per_node = var("WORKSPACE_DEFAULT_MAX_PER_NODE")?;

        Ok(Engine {
            env: Environment {
                secured,
                host,
                namespace: namespace.clone(),
            },
            configuration: Configuration {
                github_client_id,
                workspace: WorkspaceDefaults {
                    duration: str_to_workspace_duration_minutes(&workspace_default_duration)?,
                    max_duration: str_to_workspace_duration_minutes(&workspace_max_duration)?,
                    pool_affinity: workspace_default_pool_affinity,
                    max_workspaces_per_pod: workspace_default_max_per_node
                        .parse()
                        .map_err(|err: ParseIntError| Error::Failure(err.into()))?,
                },
            },
            secrets: Secrets {
                github_client_secret,
            },
        })
    }

    fn nodes_to_pool(self, id: String, nodes: Vec<Node>) -> Result<Pool> {
        let node = nodes
            .first()
            .ok_or(Error::MissingData("empty vec of nodes"))?;
        let labels = node
            .metadata
            .labels
            .clone()
            .ok_or(Error::MissingData("metadata#labels"))?;
        let local = "local".to_string();
        let unknown = "unknown".to_string();
        let instance_type = labels.get(INSTANCE_TYPE_LABEL).unwrap_or(&local);

        Ok(Pool {
            name: id,
            instance_type: Some(instance_type.clone()),
            nodes: nodes
                .iter()
                .map(|node| crate::types::Node {
                    hostname: node
                        .metadata
                        .labels
                        .clone()
                        .unwrap_or_default()
                        .get(HOSTNAME_LABEL)
                        .unwrap_or(&unknown)
                        .clone(),
                })
                .collect(),
        })
    }
    /*
        fn condition_to_condition(self, condition: &PodCondition) -> types::PodCondition {
            types::PodCondition {
                type_: ConditionType::from_str(condition.type_.as_str())
                    .unwrap_or(ConditionType::Unknown),
                status: Status::from_str(condition.status.as_str()).unwrap_or(Status::Unknown),
                reason: condition.clone().reason,
                message: condition.clone().message,
            }
        }
        fn container_status_to_container_status(
            self,
            status: &ContainerStatus,
        ) -> types::ContainerStatus {
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
    */

    /*fn pod_to_details(self, pod: &Pod) -> Result<types::Pod> {
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
            conditions: conditions.map(|v| {
                v.iter()
                    .map(|c| self.clone().condition_to_condition(c))
                    .collect()
            }),
            container: container_status.map(|c| self.container_status_to_container_status(c)),
        })
    }*/

    fn yaml_to_user(self, s: &str) -> Result<User> {
        let user_configuration: UserConfiguration =
            serde_yaml::from_str(s).map_err(|err| Error::Failure(err.into()))?;
        Ok(User {
            admin: user_configuration.admin,
            pool_affinity: user_configuration.pool_affinity,
            can_customize_duration: user_configuration.can_customize_duration,
            can_customize_pool_affinity: user_configuration.can_customize_pool_affinity,
        })
    }

    pub async fn get_user(&self, id: &str) -> Result<Option<User>> {
        let client = client().await?;

        let users = list_users(client, &self.env.namespace).await?;
        let user = users.get(id);

        match user.map(|user| self.clone().yaml_to_user(&user)) {
            Some(user) => user.map(Some),
            None => Ok(None),
        }
    }

    pub async fn list_users(&self) -> Result<BTreeMap<String, User>> {
        let client = client().await?;

        Ok(list_users(client, &self.env.namespace)
            .await?
            .into_iter()
            .map(|(k, v)| Ok((k, self.clone().yaml_to_user(&v)?)))
            .collect::<Result<BTreeMap<String, User>>>()?)
    }

    pub async fn create_user(&self, id: String, conf: UserConfiguration) -> Result<()> {
        let client = client().await?;

        add_config_map_value(
            client,
            &self.env.namespace,
            USERS_CONFIG_MAP,
            id.as_str(),
            serde_yaml::to_string(&conf)
                .map_err(|err| Error::Failure(err.into()))?
                .as_str(),
        )
        .await?;

        Ok(())
    }

    pub async fn update_user(&self, id: String, conf: UserUpdateConfiguration) -> Result<()> {
        let client = client().await?;

        add_config_map_value(
            client,
            &self.env.namespace,
            USERS_CONFIG_MAP,
            id.as_str(),
            serde_yaml::to_string(&conf)
                .map_err(|err| Error::Failure(err.into()))?
                .as_str(),
        )
        .await?;

        Ok(())
    }

    pub async fn delete_user(&self, id: String) -> Result<()> {
        let client = client().await?;
        delete_config_map_value(client, &self.env.namespace, USERS_CONFIG_MAP, id.as_str()).await
    }

    // Workspaces

    fn pod_to_state(pod: &Pod) -> Result<types::WorkspaceState> {
        let status = pod.status.as_ref().ok_or(Error::MissingData("status"))?;
        let conditions = status.clone().conditions;
        let container_statuses = status.clone().container_statuses;
        let container_status = container_statuses.as_ref().and_then(|v| v.first());
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
        let max_duration = str_to_workspace_duration_minutes(
            annotations
                .get(WORKSPACE_DURATION_ANNOTATION)
                .ok_or(Error::MissingData("template#workspace_duration"))?,
        )?;

        Ok(Workspace {
            user_id: username.clone(),
            max_duration,
            repository_version: RepositoryVersion {
                reference: "".to_string(),
                state: RepositoryVersionState::BUILT,
                runtime: runtime(),
            },
            state: Self::pod_to_state(pod)?, /*template,
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

    pub async fn get_workspace(&self, id: &str) -> Result<Option<Workspace>> {
        let client = client().await?;
        let pod_api: Api<Pod> = Api::namespaced(client, &self.env.namespace);
        let pod = pod_api.get(&pod_name(id)).await.ok();

        match pod.map(|pod| Self::pod_to_workspace(&pod)) {
            Some(workspace) => workspace.map(Some),
            None => Ok(None),
        }
    }

    /// Lists all currently running workspaces
    pub async fn list_workspaces(&self) -> Result<BTreeMap<String, Workspace>> {
        let client = client().await?;
        let pod_api: Api<Pod> = Api::namespaced(client, &self.env.namespace);
        let pods = list_by_selector(
            &pod_api,
            format!("{}={}", COMPONENT_LABEL, COMPONENT_VALUE).to_string(),
        )
        .await?;

        Ok(pods
            .iter()
            .flat_map(|pod| Self::pod_to_workspace(pod).ok())
            .map(|workspace| (workspace.clone().user_id, workspace))
            .collect::<BTreeMap<String, Workspace>>())
    }

    pub async fn patch_ingress(&self, runtimes: &BTreeMap<String, &Runtime>) -> Result<()> {
        let client = client().await?;
        let ingress_api: Api<Ingress> = Api::namespaced(client, &self.env.namespace);
        let mut ingress: Ingress = ingress_api
            .get(INGRESS_NAME)
            .await
            .map_err(|err| Error::Failure(err.into()))?
            .clone();
        let mut spec = ingress
            .clone()
            .spec
            .ok_or(Error::MissingData("ingress#spec"))?
            .clone();
        let mut rules: Vec<IngressRule> = spec
            .clone()
            .rules
            .ok_or(Error::MissingData("ingress#spec#rules"))?;
        for (workspace_id, runtime) in runtimes {
            let subdomain = subdomain(&self.env.host, &workspace_id);
            rules.push(IngressRule {
                host: Some(subdomain.clone()),
                http: Some(HTTPIngressRuleValue {
                    paths: ingress_paths(service_name(&workspace_id), runtime),
                }),
            });
        }
        spec.rules.replace(rules);
        ingress.spec.replace(spec);

        ingress_api
            .replace(INGRESS_NAME, &PostParams::default(), &ingress)
            .await
            .map_err(|err| Error::Failure(err.into()))?;

        Ok(())
    }

    pub async fn create_workspace(
        &self,
        user: &LoggedUser,
        user_id: &str,
        conf: WorkspaceConfiguration,
    ) -> Result<()> {
        let repository = self
            .get_repository(&conf.repository_id)
            .await?
            .ok_or(Error::MissingData("repository"))?;
        // Make sure some node on the right pools still have rooms
        // Find pool affinity, lookup corresponding pool and capacity based on nodes, figure out if there is room left
        // TODO: replace with custom scheduler
        // * https://kubernetes.io/docs/tasks/extend-kubernetes/configure-multiple-schedulers/
        // * https://kubernetes.io/blog/2017/03/advanced-scheduling-in-kubernetes/
        let pool_id = conf.clone().pool_affinity.unwrap_or_else(|| {
            user.clone()
                .pool_affinity
                .unwrap_or(self.clone().configuration.workspace.pool_affinity)
        });
        let pool = self
            .get_pool(&pool_id)
            .await?
            .ok_or(Error::MissingData("no matching pool"))?;
        let max_workspaces_allowed =
            pool.nodes.len() * self.configuration.workspace.max_workspaces_per_pod;
        let workspaces = self.list_workspaces().await?;
        if workspaces.len() >= max_workspaces_allowed {
            // TODO Should trigger pool dynamic scalability. Right now this will only consider the pool lower bound.
            // "Reached maximum number of concurrent workspaces allowed: {}"
            return Err(Error::Unauthorized());
        }
        let client = client().await?;

        let namespace = &self.env.namespace;

        let pod_api: Api<Pod> = Api::namespaced(client.clone(), namespace);

        //TODO deploy a new ingress matching the route
        // With the proper mapping
        // Define the correct route
        // Also deploy proper tcp mapping configmap https://kubernetes.github.io/ingress-nginx/user-guide/exposing-tcp-udp-services/

        let volume_api: Api<PersistentVolumeClaim> = Api::namespaced(client.clone(), namespace);
        // TODO use conf.version to access right workspace
        let volume = get_or_create_volume(&volume_api, user_id, &conf.repository_id).await?;

        let version = repository
            .versions
            .into_iter()
            .find(|version| version.reference == conf.repository_reference)
            .ok_or(Error::MissingData("repository#version"))?;
        if version.state != RepositoryVersionState::BUILT {
            return Err(Error::MissingData("repository#version#built"));
        }
        let runtime = &version.runtime;

        // Patch ingress to make this workspace externally avalaible
        let mut workspaces = BTreeMap::new();
        workspaces.insert(user_id.to_string(), runtime);
        self.patch_ingress(&workspaces).await?;

        let duration = conf
            .duration
            .unwrap_or(self.configuration.workspace.duration);

        // Deploy a new pod for this image
        pod_api
            .create(
                &PostParams::default(),
                &create_pod(&self.env, user_id, runtime, &duration, &pool_id, &volume)?,
            )
            .await
            .map_err(|err| Error::Failure(err.into()))?;

        // Deploy the associated service
        let service_api: Api<Service> = Api::namespaced(client.clone(), namespace);
        let service = create_service(user_id, runtime);
        service_api
            .create(&PostParams::default(), &service)
            .await
            .map_err(|err| Error::Failure(err.into()))?;

        Ok(())
    }

    pub async fn update_workspace(
        &self,
        workspace_id: &str,
        conf: WorkspaceUpdateConfiguration,
    ) -> Result<()> {
        let workspace = self
            .clone()
            .get_workspace(&workspace_id)
            .await?
            .ok_or(Error::MissingData("no matching workspace"))?;

        let duration = conf
            .duration
            .unwrap_or(self.configuration.workspace.duration);
        let max_duration = self.configuration.workspace.max_duration;
        if duration >= max_duration {
            return Err(Error::Unauthorized());
        }
        if duration != workspace.max_duration {
            let client = client().await?;
            let pod_api: Api<Pod> = Api::namespaced(client, &self.env.namespace);
            let params = PatchParams {
                ..PatchParams::default()
            };
            let patch: Patch<json_patch::Patch> =
                Patch::Json(json_patch::Patch(vec![PatchOperation::Add(AddOperation {
                    path: format!(
                        "/metadata/annotations/{}",
                        WORKSPACE_DURATION_ANNOTATION.replace("/", "~1")
                    ),
                    value: json!(workspace_duration_annotation(duration)),
                })]));
            pod_api
                .patch(&pod_name(&workspace.user_id), &params, &patch)
                .await
                .map_err(|err| Error::Failure(err.into()))?;
        }

        Ok(())
    }

    pub async fn delete_workspace(&self, id: &str) -> Result<()> {
        // Undeploy the service by its id
        let client = client().await?;
        let service_api: Api<Service> = Api::namespaced(client.clone(), &self.env.namespace);
        service_api
            .delete(&service_name(id), &DeleteParams::default())
            .await
            .map_err(|err| Error::Failure(err.into()))?;

        let pod_api: Api<Pod> = Api::namespaced(client.clone(), &self.env.namespace);
        pod_api
            .delete(&pod_name(id), &DeleteParams::default())
            .await
            .map_err(|err| Error::Failure(err.into()))?;

        let subdomain = subdomain(&self.env.host, id);
        let ingress_api: Api<Ingress> = Api::namespaced(client, &self.env.namespace);
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

    // Repository

    pub async fn get_repository(&self, id: &str) -> Result<Option<Repository>> {
        // TODO
        Ok(None)
    }

    // Pools

    pub async fn get_pool(&self, id: &str) -> Result<Option<Pool>> {
        let client = client().await?;
        let node_api: Api<Node> = Api::all(client);
        let nodes =
            list_by_selector(&node_api, format!("{}={}", NODE_POOL_LABEL, id).to_string()).await?;

        match self.clone().nodes_to_pool(id.to_string(), nodes) {
            Ok(pool) => Ok(Some(pool)),
            Err(_) => Ok(None),
        }
    }

    pub async fn list_pools(&self) -> Result<BTreeMap<String, Pool>> {
        let client = client().await?;
        let node_api: Api<Node> = Api::all(client);

        let nodes = node_api
            .list(&ListParams::default())
            .await
            .map(|l| l.items)
            .map_err(|err| Error::Failure(err.into()))?;

        let default = "default".to_string();
        let nodes_by_pool: BTreeMap<String, Vec<Node>> =
            nodes.iter().fold(BTreeMap::new(), |mut acc, node| {
                if let Some(labels) = node.metadata.labels.clone() {
                    let key = labels.get(NODE_POOL_LABEL).unwrap_or(&default);
                    let nodes = acc.entry(key.clone()).or_insert_with(Vec::new);
                    nodes.push(node.clone());
                } else {
                    error!("No labels");
                }
                acc
            });

        Ok(nodes_by_pool
            .into_iter()
            .flat_map(|(s, v)| match self.clone().nodes_to_pool(s.clone(), v) {
                Ok(pool) => Some((s, pool)),
                Err(_) => None,
            })
            .collect())
    }
}
