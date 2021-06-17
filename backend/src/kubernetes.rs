//! Helper methods ton interact with k8s
use crate::{
    error::{Error, Result},
    kubernetes_utils::{
        add_config_map_value, client, config, delete_config_map_value, env_var, get_config_map,
        ingress_path, list_by_selector,
    },
    types::{
        self, Configuration, Environment, LoggedUser, Pool, Port, Repository,
        RepositoryConfiguration, RepositoryDetails, RepositoryRuntimeConfiguration,
        RepositoryUpdateConfiguration, RepositoryVersion, RepositoryVersionConfiguration, User,
        UserConfiguration, UserUpdateConfiguration, Workspace, WorkspaceConfiguration,
        WorkspaceDefaults, WorkspaceState, WorkspaceUpdateConfiguration,
    },
};
use json_patch::{AddOperation, PatchOperation};
use k8s_openapi::api::{batch::v1::{Job, JobSpec}, core::v1::{Affinity, Container, EnvVar, Node, NodeAffinity, NodeSelectorRequirement, NodeSelectorTerm, PersistentVolumeClaim, PersistentVolumeClaimSpec, PersistentVolumeClaimVolumeSource, Pod, PodSpec, PodTemplateSpec, PreferredSchedulingTerm, ResourceRequirements, Service, ServicePort, ServiceSpec, TypedLocalObjectReference, Volume, VolumeMount}, extensions::v1beta1::{HTTPIngressPath, HTTPIngressRuleValue, Ingress, IngressRule}};
use k8s_openapi::apimachinery::pkg::{
    api::resource::Quantity, apis::meta::v1::ObjectMeta, util::intstr::IntOrString,
};
use kube::{
    api::{Api, DeleteParams, ListParams, Patch, PatchParams, PostParams},
    Client, Resource,
};
use log::error;
use serde::Serialize;
use serde_json::json;
use std::{
    collections::BTreeMap,
    convert::TryFrom,
    env,
    num::ParseIntError,
    time::Duration,
};

const NODE_POOL_LABEL: &str = "cloud.google.com/gke-nodepool";
const INSTANCE_TYPE_LABEL: &str = "node.kubernetes.io/instance-type";
const HOSTNAME_LABEL: &str = "kubernetes.io/hostname";
const APP_LABEL: &str = "app.kubernetes.io/part-of";
const APP_VALUE: &str = "playground";
const COMPONENT_LABEL: &str = "app.kubernetes.io/component";
const COMPONENT_VALUE: &str = "workspaca";
const OWNER_LABEL: &str = "app.kubernetes.io/owner";
const INGRESS_NAME: &str = "ingress";
const WORKSPACE_DURATION_ANNOTATION: &str = "playground.substrate.io/workspace_duration";
const USERS_CONFIG_MAP: &str = "playground-users";
const REPOSITORIES_CONFIG_MAP: &str = "playground-repositories";
const THEIA_WEB_PORT: i32 = 3000;

pub fn pod_name(user: &str) -> String {
    format!("{}-{}", COMPONENT_VALUE, user)
}

pub fn service_name(workspace_id: &str) -> String {
    format!("{}-service-{}", COMPONENT_VALUE, workspace_id)
}

// Model

fn pod_env_variables(
    conf: &RepositoryRuntimeConfiguration,
    host: &str,
    workspace_id: &str,
) -> Vec<EnvVar> {
    let mut envs = vec![
        env_var("SUBSTRATE_PLAYGROUND", ""),
        env_var("SUBSTRATE_PLAYGROUND_WORKSPACE", workspace_id),
        env_var("SUBSTRATE_PLAYGROUND_HOSTNAME", host),
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

fn create_pod_annotations(duration: &Duration) -> Result<BTreeMap<String, String>> {
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

fn volume(workspace_id: &str, repository_id: &str) -> PersistentVolumeClaim {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_VALUE.to_string());
    labels.insert(OWNER_LABEL.to_string(), workspace_id.to_string());

    let mut requests = BTreeMap::new();
    requests.insert("storage".to_string(), Quantity("5Gi".to_string()));

    PersistentVolumeClaim {
        metadata: ObjectMeta {
            name: Some(volume_name(workspace_id, repository_id)),
            labels,
            ..Default::default()
        },
        spec: Some(PersistentVolumeClaimSpec {
            access_modes: vec!["ReadWriteOnce".to_string()],
            resources: Some(ResourceRequirements {
                requests,
                ..Default::default()
            }),
            data_source: Some(TypedLocalObjectReference {
                api_group: Some("snapshot.storage.k8s.io".to_string()),
                kind: "PersistentVolumeClaim".to_string(),
                name: volume_template_name(repository_id),
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

fn create_pod(
    conf: &Configuration,
    env: &Environment,
    workspace_id: &str,
    runtime: &RepositoryRuntimeConfiguration,
    duration: &Duration,
    pool_id: &str,
    volume: &PersistentVolumeClaim,
) -> Result<Pod> {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_VALUE.to_string());
    labels.insert(OWNER_LABEL.to_string(), workspace_id.to_string());

    let volume_name = "repo".to_string();
    Ok(Pod {
        metadata: ObjectMeta {
            name: Some(pod_name(workspace_id)),
            labels,
            annotations: create_pod_annotations(duration)?,
            ..Default::default()
        },
        spec: Some(PodSpec {
            affinity: Some(Affinity {
                node_affinity: Some(NodeAffinity {
                    preferred_during_scheduling_ignored_during_execution: vec![
                        PreferredSchedulingTerm {
                            weight: 100,
                            preference: NodeSelectorTerm {
                                match_expressions: vec![NodeSelectorRequirement {
                                    key: NODE_POOL_LABEL.to_string(),
                                    operator: "In".to_string(),
                                    values: vec![pool_id.to_string()],
                                }],
                                ..Default::default()
                            },
                        },
                    ],
                    ..Default::default()
                }),
                ..Default::default()
            }),
            containers: vec![Container {
                name: format!("{}-container", COMPONENT_VALUE),
                image: Some(
                    runtime
                        .clone()
                        .base_image
                        .unwrap_or(conf.workspace.base_image.clone()),
                ),
                env: pod_env_variables(runtime, &env.host, workspace_id),
                volume_mounts: vec![VolumeMount {
                    name: volume_name.clone(),
                    mount_path: "/workspace".to_string(),
                    ..Default::default()
                }],
                ..Default::default()
            }],
            termination_grace_period_seconds: Some(1),
            volumes: vec![Volume {
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
            }],
            ..Default::default()
        }),
        ..Default::default()
    })
}

fn create_service(workspace_id: &str, runtime: &RepositoryRuntimeConfiguration) -> Service {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_VALUE.to_string());
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
            name: Some(service_name(workspace_id)),
            labels,
            ..Default::default()
        },
        spec: Some(ServiceSpec {
            type_: Some("NodePort".to_string()),
            selector,
            ports,
            ..Default::default()
        }),
        ..Default::default()
    }
}

fn ingress_paths(service_name: String, ports: &Vec<Port>) -> Vec<HTTPIngressPath> {
    let mut all_paths = vec![ingress_path("/", &service_name, THEIA_WEB_PORT)];
    let mut paths = ports
        .iter()
        .map(|port| ingress_path(&port.clone().path, &service_name.clone(), port.port))
        .collect();
    all_paths.append(&mut paths);
    all_paths
}

fn subdomain(host: &str, workspace_id: &str) -> String {
    format!("{}.{}", workspace_id, host)
}

async fn list_users(client: Client, namespace: &str) -> Result<BTreeMap<String, String>> {
    get_config_map(client, namespace, USERS_CONFIG_MAP).await
}

fn serialize<T: ?Sized>(value: &T) -> Result<String>
where
    T: Serialize,
{
    serde_yaml::to_string(&value).map_err(|err| Error::Failure(err.into()))
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
        let namespace = config.clone().default_namespace.to_string();
        let client = Client::try_from(config).map_err(|err| Error::Failure(err.into()))?;
        let ingress_api: Api<Ingress> = Api::namespaced(client.clone(), &namespace);
        let secured = if let Ok(ingress) = ingress_api.get(INGRESS_NAME).await {
            !ingress
                .spec
                .ok_or(Error::MissingData("spec"))?
                .tls
                .is_empty()
        } else {
            false
        };

        let host = if let Ok(ingress) = ingress_api.get(INGRESS_NAME).await {
            ingress
                .spec
                .ok_or(Error::MissingData("spec"))?
                .rules
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
        let workspace_base_image = var("WORKSPACE_BASE_IMAGE")?;
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
                    base_image: workspace_base_image,
                    duration: str_minutes_to_duration(&workspace_default_duration)?,
                    max_duration: str_minutes_to_duration(&workspace_max_duration)?,
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
            .clone();
        let local = "local".to_string();
        let unknown = "unknown".to_string();
        let instance_type = labels.get(INSTANCE_TYPE_LABEL).unwrap_or(&local);

        Ok(Pool {
            id,
            instance_type: Some(instance_type.clone()),
            nodes: nodes
                .iter()
                .map(|node| crate::types::Node {
                    hostname: node
                        .metadata
                        .labels
                        .clone()
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
        serde_yaml::from_str(s).map_err(|err| Error::Failure(err.into()))
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

    pub async fn list_users(&self) -> Result<Vec<User>> {
        let client = client().await?;

        Ok(list_users(client, &self.env.namespace)
            .await?
            .into_iter()
            .flat_map(|(k, v)| self.clone().yaml_to_user(&v))
            .collect())
    }

    pub async fn create_user(&self, id: &str, conf: UserConfiguration) -> Result<()> {
        let client = client().await?;

        let user = User {
            id: id.to_string(),
            admin: conf.admin,
            can_customize_duration: conf.can_customize_duration,
            can_customize_pool_affinity: conf.can_customize_pool_affinity,
            pool_affinity: conf.pool_affinity,
        };

        add_config_map_value(
            client,
            &self.env.namespace,
            USERS_CONFIG_MAP,
            id,
            serialize(&user)?.as_str(),
        )
        .await?;

        Ok(())
    }

    pub async fn update_user(&self, id: &str, conf: UserUpdateConfiguration) -> Result<()> {
        let client = client().await?;

        let mut user = Self::get_user(self, id)
            .await?
            .ok_or(Error::MissingData("no matching user"))?;
        user.admin = conf.admin;
        user.can_customize_duration = conf.can_customize_duration;
        user.can_customize_pool_affinity = conf.can_customize_pool_affinity;
        user.pool_affinity = conf.pool_affinity;

        add_config_map_value(
            client,
            &self.env.namespace,
            USERS_CONFIG_MAP,
            id,
            serialize(&user)?.as_str(),
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
            .clone();
        let unknown = "UNKNOWN OWNER".to_string();
        let username = labels.get(OWNER_LABEL).unwrap_or(&unknown);
        let annotations = &pod
            .metadata
            .annotations
            .clone();
        let max_duration = str_minutes_to_duration(
            annotations
                .get(WORKSPACE_DURATION_ANNOTATION)
                .ok_or(Error::MissingData("pod#workspace_duration"))?,
        )?;

        Ok(Workspace {
            id: username.clone(),
            user_id: username.clone(),
            max_duration,
            repository_details: RepositoryDetails {
                id: "".to_string(),
                reference: "".to_string(),
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
    pub async fn list_workspaces(&self) -> Result<Vec<Workspace>> {
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
            .collect())
    }

    pub async fn patch_ingress(&self, runtimes: &BTreeMap<String, Vec<Port>>) -> Result<()> {
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
            .rules;
        for (workspace_id, ports) in runtimes {
            let subdomain = subdomain(&self.env.host, &workspace_id);
            rules.push(IngressRule {
                host: Some(subdomain.clone()),
                http: Some(HTTPIngressRuleValue {
                    paths: ingress_paths(service_name(&workspace_id), ports),
                }),
            });
        }
        spec.rules = rules;
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
        let repository_version = self
            .get_repository_version(
                &conf.repository_details.id,
                &conf.repository_details.reference,
            )
            .await?
            .ok_or(Error::MissingData("repository#versions"))?;
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

        //TODO deploy a new ingress matching the route
        // With the proper mapping
        // Define the correct route
        // Also deploy proper tcp mapping configmap https://kubernetes.github.io/ingress-nginx/user-guide/exposing-tcp-udp-services/

        let runtime = match &repository_version.state {
            types::RepositoryVersionState::Ready { runtime } => runtime,
            _ => return Err(Error::Unauthorized()),
        };

        let volume_api: Api<PersistentVolumeClaim> = Api::namespaced(client.clone(), namespace);
        // TODO use conf.version to access right workspace
        let volume =
            get_or_create_volume(&volume_api, user_id, &conf.repository_details.id).await?;

        // Patch ingress to make this workspace externally avalaible
        let mut workspaces = BTreeMap::new();
        workspaces.insert(
            user_id.to_string(),
            runtime.ports.clone().unwrap_or_default(),
        );
        self.patch_ingress(&workspaces).await?;

        let duration = conf
            .duration
            .unwrap_or(self.configuration.workspace.duration);

        // Deploy a new pod for this image
        let pod_api: Api<Pod> = Api::namespaced(client.clone(), namespace);
        pod_api
            .create(
                &PostParams::default(),
                &create_pod(
                    &self.configuration,
                    &self.env,
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
            .into_iter()
            .filter(|rule| rule.clone().host.unwrap_or_else(|| "unknown".to_string()) != subdomain)
            .collect();
        spec.rules = rules;
        ingress.spec.replace(spec);

        ingress_api
            .replace(INGRESS_NAME, &PostParams::default(), &ingress)
            .await
            .map_err(|err| Error::Failure(err.into()))?;

        Ok(())
    }

    // Repositories

    pub async fn get_repository(&self, id: &str) -> Result<Option<Repository>> {
        let client = client().await?;

        let repositories =
            get_config_map(client, &self.env.namespace, REPOSITORIES_CONFIG_MAP).await?;
        let repository = repositories.get(id);

        match repository.map(|repository| {
            serde_yaml::from_str::<Repository>(&repository)
                .map_err(|err| Error::Failure(err.into()))
        }) {
            Some(repository) => repository.map(Some),
            None => Ok(None),
        }
    }

    pub async fn list_repositories(&self) -> Result<Vec<Repository>> {
        let client = client().await?;

        Ok(
            get_config_map(client, &self.env.namespace, REPOSITORIES_CONFIG_MAP)
                .await?
                .into_iter()
                .map(|(k, v)| {
                    Ok(serde_yaml::from_str::<Repository>(&v)
                        .map_err(|err| Error::Failure(err.into()))?)
                })
                .collect::<Result<Vec<Repository>>>()?,
        )
    }

    pub async fn create_repository(&self, id: &str, conf: RepositoryConfiguration) -> Result<()> {
        let client = client().await?;

        let repository = Repository {
            id: id.to_string(),
            tags: conf.tags,
            url: conf.url,
        };

        add_config_map_value(
            client,
            &self.env.namespace,
            REPOSITORIES_CONFIG_MAP,
            id,
            serialize(&repository)?.as_str(),
        )
        .await?;

        Ok(())
    }

    pub async fn update_repository(
        &self,
        id: &str,
        conf: RepositoryUpdateConfiguration,
    ) -> Result<()> {
        let client = client().await?;

        let mut repository = Self::get_repository(self, id)
            .await?
            .ok_or(Error::MissingData("no matching repository"))?;
        repository.tags = conf.tags;

        add_config_map_value(
            client,
            &self.env.namespace,
            REPOSITORIES_CONFIG_MAP,
            id,
            serialize(&repository)?.as_str(),
        )
        .await?;

        Ok(())
    }

    pub async fn delete_repository(&self, id: &str) -> Result<()> {
        let client = client().await?;
        delete_config_map_value(client, &self.env.namespace, REPOSITORIES_CONFIG_MAP, id).await
    }

    // Repository versions

    pub async fn get_repository_version(
        &self,
        repository_id: &str,
        id: &str,
    ) -> Result<Option<RepositoryVersion>> {
        // TODO
        Ok(None)
    }

    pub async fn list_repository_versions(
        &self,
        repository_id: &str,
    ) -> Result<Vec<RepositoryVersion>> {
        // TODO
        Ok(vec![])
    }

    pub async fn create_repository_version(
        &self,
        repository_id: &str,
        id: &str,
        conf: RepositoryVersionConfiguration,
    ) -> Result<()> {
    let client = client().await?;
    let job_api: Api<Job> = Api::namespaced(client.clone(), &self.env.namespace);
    let job = Job {
        metadata: ObjectMeta {
            name: Some("aa".to_string()),
            ..Default::default()
        },
        spec: Some(JobSpec {
            ttl_seconds_after_finished: Some(0),
            backoff_limit: Some(1),
            template: PodTemplateSpec {
                spec: Some(PodSpec {
                    containers: vec![Container {
                        name: "cloner".to_string(),
                        image: Some("paritytech/substrate-playground-backend-api:latest".to_string()),
                        command: vec!["builder".to_string()],
                        env: vec![EnvVar {
                            name: "".to_string(),
                            value: Some("".to_string()),
                            ..Default::default()
                        }],
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
        .map_err(|err| Error::Failure(err.into()))?;

/*
apiVersion: batch/v1
kind: Job
metadata:
  name: pi
spec:
  ttlSecondsAfterFinished: 100
  template:
    spec:
      containers:
      - name: pi
        image: perl
        command: ["perl",  "-Mbignum=bpi", "-wle", "print bpi(2000)"]
      restartPolicy: Never
  backoffLimit: 4

*/

        Ok(())
    }

    pub async fn delete_repository_version(&self, repository_id: &str, id: &str) -> Result<()> {
        Ok(())
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

    pub async fn list_pools(&self) -> Result<Vec<Pool>> {
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
                if let labels = node.metadata.labels.clone() {
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
                Ok(pool) => Some(pool),
                Err(_) => None,
            })
            .collect())
    }
}
