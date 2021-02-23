//! Find more details here:
//! * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceStatus.html
//! * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceSpec.html
use crate::types::{
    self, LoggedUser, Pool, Session, SessionConfiguration, SessionDefaults,
    SessionUpdateConfiguration, Template, User, UserConfiguration, UserUpdateConfiguration,
};
use json_patch::{AddOperation, PatchOperation, RemoveOperation};
use k8s_openapi::api::core::v1::{
    Affinity, ConfigMap, Container, EnvVar, Node, Pod, PodSpec, Service, ServicePort, ServiceSpec,
};
use k8s_openapi::api::{
    core::v1::{NodeAffinity, NodeSelectorRequirement, NodeSelectorTerm, PreferredSchedulingTerm},
    extensions::v1beta1::{
        HTTPIngressPath, HTTPIngressRuleValue, Ingress, IngressBackend, IngressRule,
    },
};
use k8s_openapi::apimachinery::pkg::{apis::meta::v1::ObjectMeta, util::intstr::IntOrString};
use kube::{
    api::{Api, DeleteParams, ListParams, Meta, Patch, PatchParams, PostParams},
    config::KubeConfigOptions,
    Client, Config,
};
use log::error;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::json;
use std::{collections::BTreeMap, convert::TryFrom, error::Error, time::Duration};
use std::{env, str::FromStr};
use types::Phase;

const NODE_POOL_LABEL: &str = "cloud.google.com/gke-nodepool";
const INSTANCE_TYPE_LABEL: &str = "node.kubernetes.io/instance-type";
const HOSTNAME_LABEL: &str = "kubernetes.io/hostname";
const APP_LABEL: &str = "app.kubernetes.io/part-of";
const APP_VALUE: &str = "playground";
const COMPONENT_LABEL: &str = "app.kubernetes.io/component";
const COMPONENT_VALUE: &str = "session";
const OWNER_LABEL: &str = "app.kubernetes.io/owner";
const INGRESS_NAME: &str = "ingress";
const TEMPLATE_ANNOTATION: &str = "playground.substrate.io/template";
const SESSION_DURATION_ANNOTATION: &str = "playground.substrate.io/session_duration";
const USERS_CONFIG_MAP: &str = "playground-users";
const TEMPLATES_CONFIG_MAP: &str = "playground-templates";
const THEIA_WEB_PORT: i32 = 3000;

fn error_to_string<T: std::fmt::Display>(err: T) -> String {
    format!("{}", err)
}

async fn list_by_selector<K: Clone + DeserializeOwned + Meta>(
    api: &Api<K>,
    selector: String,
) -> Result<Vec<K>, String> {
    let params = ListParams {
        label_selector: Some(selector),
        ..ListParams::default()
    };
    api.list(&params)
        .await
        .map(|l| l.items)
        .map_err(|s| format!("Error {}", s))
}

pub fn pod_name(user: &str) -> String {
    format!("{}-{}", COMPONENT_VALUE, user)
}

pub fn service_name(session_id: &str) -> String {
    format!("{}-service-{}", COMPONENT_VALUE, session_id)
}

fn create_env_var(name: &str, value: &str) -> EnvVar {
    EnvVar {
        name: name.to_string(),
        value: Some(value.to_string()),
        ..Default::default()
    }
}

fn pod_env_variables(template: &Template, host: &str, session_id: &str) -> Vec<EnvVar> {
    let mut envs = vec![
        create_env_var("SUBSTRATE_PLAYGROUND", ""),
        create_env_var("SUBSTRATE_PLAYGROUND_SESSION", session_id),
        create_env_var("SUBSTRATE_PLAYGROUND_HOSTNAME", host),
    ];
    if let Some(mut template_envs) = template.runtime.as_ref().and_then(|r| {
        r.env.clone().map(|envs| {
            envs.iter()
                .map(|env| create_env_var(&env.name, &env.value))
                .collect::<Vec<EnvVar>>()
        })
    }) {
        envs.append(&mut template_envs);
    };
    envs
}

// TODO detect when ingress is restarted, then re-sync theia sessions

fn session_duration_annotation(duration: Duration) -> String {
    let duration_min = duration.as_secs() / 60;
    duration_min.to_string()
}

fn str_to_session_duration_minutes(str: &str) -> Result<Duration, String> {
    Ok(Duration::from_secs(
        str.parse::<u64>().map_err(error_to_string)? * 60,
    ))
}

fn create_pod_annotations(
    template: &Template,
    duration: &Duration,
) -> Result<BTreeMap<String, String>, String> {
    let mut annotations = BTreeMap::new();
    let s = serde_yaml::to_string(template).map_err(|o| o.to_string())?;
    annotations.insert(TEMPLATE_ANNOTATION.to_string(), s);
    annotations.insert(
        SESSION_DURATION_ANNOTATION.to_string(),
        session_duration_annotation(*duration),
    );
    Ok(annotations)
}

fn create_pod(
    env: &Environment,
    session_id: &str,
    template: &Template,
    duration: &Duration,
    pool_id: &str,
) -> Result<Pod, String> {
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
                env: Some(pod_env_variables(template, &env.host, session_id)),
                ..Default::default()
            }],
            termination_grace_period_seconds: Some(1),
            ..Default::default()
        }),
        ..Default::default()
    })
}

fn create_service(session_id: &str, template: &Template) -> Service {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_VALUE.to_string());
    labels.insert(OWNER_LABEL.to_string(), session_id.to_string());
    let mut selectors = BTreeMap::new();
    selectors.insert(OWNER_LABEL.to_string(), session_id.to_string());

    // The theia port itself is mandatory
    let mut ports = vec![ServicePort {
        name: Some("web".to_string()),
        protocol: Some("TCP".to_string()),
        port: THEIA_WEB_PORT,
        ..Default::default()
    }];
    if let Some(mut template_ports) = template.runtime.as_ref().and_then(|r| {
        r.ports.clone().map(|ports| {
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
        })
    }) {
        ports.append(&mut template_ports);
    };

    Service {
        metadata: ObjectMeta {
            name: Some(service_name(session_id)),
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

fn create_ingress_path(path: &str, service_name: &str, service_port: i32) -> HTTPIngressPath {
    HTTPIngressPath {
        path: Some(path.to_string()),
        backend: IngressBackend {
            service_name: service_name.to_string(),
            service_port: IntOrString::Int(service_port),
        },
    }
}

fn create_ingress_paths(service_name: String, template: &Template) -> Vec<HTTPIngressPath> {
    let mut paths = vec![create_ingress_path("/", &service_name, THEIA_WEB_PORT)];
    if let Some(mut template_paths) = template.runtime.as_ref().and_then(|r| {
        r.ports.clone().map(|ports| {
            ports
                .iter()
                .map(|port| {
                    create_ingress_path(&port.clone().path, &service_name.clone(), port.port)
                })
                .collect()
        })
    }) {
        paths.append(&mut template_paths);
    };
    paths
}

fn subdomain(host: &str, session_id: &str) -> String {
    format!("{}.{}", session_id, host)
}

async fn config() -> Result<Config, String> {
    Config::from_kubeconfig(&KubeConfigOptions::default())
        .await
        .or_else(|_| Config::from_cluster_env())
        .map_err(error_to_string)
}

// ConfigMap utilities

async fn get_config_map(
    client: Client,
    namespace: &str,
    name: &str,
) -> Result<BTreeMap<String, String>, String> {
    let config_map_api: Api<ConfigMap> = Api::namespaced(client, namespace);
    config_map_api
        .get(name)
        .await
        .map_err(error_to_string)
        .and_then(|o| o.data.ok_or_else(|| "No data field".to_string()))
}

//
// Adds a value to a ConfigMap, specified by a `key`.
// Err if provided `key` doesn't exist
//
// Equivalent to `kubectl patch configmap $name --type=json -p='[{"op": "add", "path": "/data/$key", "value": "$value"}]'`
async fn add_config_map_value(
    client: Client,
    namespace: &str,
    name: &str,
    key: &str,
    value: &str,
) -> Result<(), String> {
    let config_map_api: Api<ConfigMap> = Api::namespaced(client, namespace);
    let params = PatchParams {
        ..PatchParams::default()
    };
    let patch: Patch<json_patch::Patch> =
        Patch::Json(json_patch::Patch(vec![PatchOperation::Add(AddOperation {
            path: format!("/data/{}", key),
            value: json!(value),
        })]));
    config_map_api
        .patch(name, &params, &patch)
        .await
        .map_err(error_to_string)?;
    Ok(())
}

//
// Deletes a value from a ConfigMap, specified by a `key`.
// Err if provided `key` doesn't exist
//
// Equivalent to `kubectl patch configmap $name --type=json -p='[{"op": "remove", "path": "/data/$key"}]'`
async fn delete_config_map_value(
    client: Client,
    namespace: &str,
    name: &str,
    key: &str,
) -> Result<(), String> {
    let config_map_api: Api<ConfigMap> = Api::namespaced(client, namespace);
    let params = PatchParams {
        ..PatchParams::default()
    };
    let patch: Patch<json_patch::Patch> =
        Patch::Json(json_patch::Patch(vec![PatchOperation::Remove(
            RemoveOperation {
                path: format!("/data/{}", key),
            },
        )]));
    config_map_api
        .patch(name, &params, &patch)
        .await
        .map_err(error_to_string)?;
    Ok(())
}

async fn get_templates(
    client: Client,
    namespace: &str,
) -> Result<BTreeMap<String, String>, String> {
    get_config_map(client, namespace, TEMPLATES_CONFIG_MAP).await
}

async fn list_users(client: Client, namespace: &str) -> Result<BTreeMap<String, String>, String> {
    get_config_map(client, namespace, USERS_CONFIG_MAP).await
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Environment {
    pub secured: bool,
    pub host: String,
    pub namespace: String,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Configuration {
    pub github_client_id: String,
    pub session_defaults: SessionDefaults,
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

impl Engine {
    pub async fn new() -> Result<Self, Box<dyn Error>> {
        let config = config().await?;
        let namespace = config.clone().default_ns.to_string();
        let client = Client::try_from(config)?;
        let ingress_api: Api<Ingress> = Api::namespaced(client.clone(), &namespace);
        let secured = if let Ok(ingress) = ingress_api.get(INGRESS_NAME).await {
            ingress.spec.ok_or("No spec")?.tls.is_some()
        } else {
            false
        };

        let host = if let Ok(ingress) = ingress_api.get(INGRESS_NAME).await {
            ingress
                .spec
                .ok_or("No spec")?
                .rules
                .ok_or("No rules")?
                .first()
                .ok_or("Zero rule")?
                .host
                .as_ref()
                .ok_or("No host")?
                .clone()
        } else {
            "localhost".to_string()
        };

        // Retrieve 'static' configuration from Env variables
        let github_client_id =
            env::var("GITHUB_CLIENT_ID").map_err(|_| "GITHUB_CLIENT_ID must be set")?;
        let github_client_secret =
            env::var("GITHUB_CLIENT_SECRET").map_err(|_| "GITHUB_CLIENT_SECRET must be set")?;
        let session_default_duration = env::var("SESSION_DEFAULT_DURATION")
            .map_err(|_| "SESSION_DEFAULT_DURATION must be set")?;
        let session_default_pool_affinity = env::var("SESSION_DEFAULT_POOL_AFFINITY")
            .map_err(|_| "SESSION_DEFAULT_POOL_AFFINITY must be set")?;
        let session_default_max_per_node = env::var("SESSION_DEFAULT_MAX_PER_NODE")
            .map_err(|_| "SESSION_DEFAULT_MAX_PER_NODE must be set")?;

        Ok(Engine {
            env: Environment {
                secured,
                host,
                namespace: namespace.clone(),
            },
            configuration: Configuration {
                github_client_id,
                session_defaults: SessionDefaults {
                    duration: str_to_session_duration_minutes(&session_default_duration)?,
                    pool_affinity: session_default_pool_affinity,
                    max_sessions_per_pod: session_default_max_per_node
                        .parse()
                        .map_err(error_to_string)?,
                },
            },
            secrets: Secrets {
                github_client_secret,
            },
        })
    }

    // Creates a Session from a Pod annotations
    fn pod_to_session(self, env: &Environment, pod: &Pod) -> Result<Session, String> {
        let labels = pod.metadata.labels.clone().ok_or("no labels")?;
        let unknown = "UNKNOWN OWNER".to_string();
        let username = labels.get(OWNER_LABEL).unwrap_or(&unknown);
        let annotations = &pod.metadata.annotations.clone().ok_or("no annotations")?;
        let template = serde_yaml::from_str(
            &annotations
                .get(TEMPLATE_ANNOTATION)
                .ok_or("no template annotation")?,
        )
        .map_err(|err| format!("{}", err))?;
        let duration = str_to_session_duration_minutes(
            annotations
                .get(SESSION_DURATION_ANNOTATION)
                .ok_or("no session_duration annotation")?,
        )?;

        Ok(Session {
            user_id: username.clone(),
            template,
            url: subdomain(&env.host, &username),
            pod: Self::pod_to_details(self, &pod.clone())?,
            duration,
            node: pod
                .clone()
                .spec
                .ok_or_else(|| "err".to_string())?
                .node_name
                .ok_or_else(|| "err".to_string())?,
        })
    }

    fn nodes_to_pool(self, id: String, nodes: Vec<Node>) -> Result<Pool, String> {
        let node = nodes
            .first()
            .ok_or_else(|| "empty vec of nodes".to_string())?;
        let labels = node.metadata.labels.clone().ok_or("no labels")?;
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

    fn pod_to_details(self, pod: &Pod) -> Result<types::Pod, String> {
        let status = pod.status.as_ref().ok_or("No status")?;
        Ok(types::Pod {
            phase: Phase::from_str(
                &status
                    .clone()
                    .phase
                    .unwrap_or_else(|| "Unknown".to_string()),
            )?,
            reason: status.clone().reason.unwrap_or_else(|| "".to_string()),
            message: status.clone().message.unwrap_or_else(|| "".to_string()),
            start_time: status.clone().start_time.map(|dt| dt.0.into()),
        })
    }

    fn yaml_to_user(self, s: &str) -> Result<User, String> {
        let user_configuration: UserConfiguration =
            serde_yaml::from_str(s).map_err(|o| o.to_string())?;
        Ok(User {
            admin: user_configuration.admin,
            pool_affinity: user_configuration.pool_affinity,
            can_customize_duration: user_configuration.can_customize_duration,
            can_customize_pool_affinity: user_configuration.can_customize_pool_affinity,
        })
    }

    pub async fn list_templates(self) -> Result<BTreeMap<String, Template>, String> {
        let config = config().await?;
        let client = Client::try_from(config).map_err(error_to_string)?;

        Ok(get_templates(client, &self.env.namespace)
            .await?
            .into_iter()
            .filter_map(|(k, v)| {
                if let Ok(template) = serde_yaml::from_str(&v) {
                    Some((k, template))
                } else {
                    error!("Error while parsing template {}", k);
                    None
                }
            })
            .collect::<BTreeMap<String, Template>>())
    }

    pub async fn get_user(self, id: &str) -> Result<Option<User>, String> {
        let config = config().await?;
        let client = Client::try_from(config).map_err(error_to_string)?;

        let users = list_users(client, &self.env.namespace).await?;
        let user = users.get(id);

        match user.map(|user| self.clone().yaml_to_user(&user)) {
            Some(user) => user.map(Some),
            None => Ok(None),
        }
    }

    pub async fn list_users(self) -> Result<BTreeMap<String, User>, String> {
        let config = config().await?;
        let client = Client::try_from(config).map_err(error_to_string)?;

        Ok(list_users(client, &self.env.namespace)
            .await?
            .into_iter()
            .map(|(k, v)| Ok((k, self.clone().yaml_to_user(&v)?)))
            .collect::<Result<BTreeMap<String, User>, String>>()?)
    }

    pub async fn create_user(self, id: String, user: UserConfiguration) -> Result<(), String> {
        let config = config().await?;
        let client = Client::try_from(config).map_err(error_to_string)?;

        add_config_map_value(
            client,
            &self.env.namespace,
            USERS_CONFIG_MAP,
            id.as_str(),
            serde_yaml::to_string(&user)
                .map_err(error_to_string)?
                .as_str(),
        )
        .await?;

        Ok(())
    }

    pub async fn update_user(
        self,
        id: String,
        user: UserUpdateConfiguration,
    ) -> Result<(), String> {
        let config = config().await?;
        let client = Client::try_from(config).map_err(error_to_string)?;

        add_config_map_value(
            client,
            &self.env.namespace,
            USERS_CONFIG_MAP,
            id.as_str(),
            serde_yaml::to_string(&user)
                .map_err(error_to_string)?
                .as_str(),
        )
        .await?;

        Ok(())
    }

    pub async fn delete_user(self, id: String) -> Result<(), String> {
        let config = config().await?;
        let client = Client::try_from(config).map_err(error_to_string)?;
        delete_config_map_value(client, &self.env.namespace, USERS_CONFIG_MAP, id.as_str()).await
    }

    pub async fn get_session(&self, id: &str) -> Result<Option<Session>, String> {
        let config = config().await?;
        let client = Client::try_from(config).map_err(error_to_string)?;
        let pod_api: Api<Pod> = Api::namespaced(client, &self.env.namespace);
        let pod = pod_api.get(&pod_name(id)).await.ok();

        match pod.map(|pod| self.clone().pod_to_session(&self.env, &pod)) {
            Some(session) => session.map(Some),
            None => Ok(None),
        }
    }

    /// Lists all currently running sessions
    pub async fn list_sessions(&self) -> Result<BTreeMap<String, Session>, String> {
        let config = config().await?;
        let client = Client::try_from(config).map_err(error_to_string)?;
        let pod_api: Api<Pod> = Api::namespaced(client, &self.env.namespace);
        let pods = list_by_selector(
            &pod_api,
            format!("{}={}", COMPONENT_LABEL, COMPONENT_VALUE).to_string(),
        )
        .await?;

        Ok(pods
            .iter()
            .flat_map(|pod| self.clone().pod_to_session(&self.env, pod).ok())
            .map(|session| (session.clone().user_id, session))
            .collect::<BTreeMap<String, Session>>())
    }

    pub async fn patch_ingress(
        &self,
        templates: &BTreeMap<String, &Template>,
    ) -> Result<(), String> {
        let config = config().await?;
        let client = Client::try_from(config).map_err(error_to_string)?;
        let ingress_api: Api<Ingress> = Api::namespaced(client, &self.env.namespace);
        let mut ingress: Ingress = ingress_api
            .get(INGRESS_NAME)
            .await
            .map_err(error_to_string)?
            .clone();
        let mut spec = ingress.clone().spec.ok_or("No spec")?.clone();
        let mut rules: Vec<IngressRule> = spec.clone().rules.ok_or("No rules")?;
        for (session_id, template) in templates {
            let subdomain = subdomain(&self.env.host, &session_id);
            rules.push(IngressRule {
                host: Some(subdomain.clone()),
                http: Some(HTTPIngressRuleValue {
                    paths: create_ingress_paths(service_name(&session_id), template),
                }),
            });
        }
        spec.rules.replace(rules);
        ingress.spec.replace(spec);

        ingress_api
            .replace(INGRESS_NAME, &PostParams::default(), &ingress)
            .await
            .map_err(error_to_string)?;

        Ok(())
    }

    pub async fn create_session(
        self,
        user: &LoggedUser,
        session_id: String,
        conf: SessionConfiguration,
    ) -> Result<(), String> {
        // Make sure some node on the right pools still have rooms
        // Find pool affinity, lookup corresponding pool and capacity based on nodes, figure out if there is room left
        // TODO: replace with custom scheduler
        // * https://kubernetes.io/docs/tasks/extend-kubernetes/configure-multiple-schedulers/
        // * https://kubernetes.io/blog/2017/03/advanced-scheduling-in-kubernetes/
        let pool_id = conf.clone().pool_affinity.unwrap_or_else(|| {
            user.clone()
                .pool_affinity
                .unwrap_or(self.clone().configuration.session_defaults.pool_affinity)
        });
        let pool = self
            .get_pool(&pool_id)
            .await?
            .ok_or_else(|| format!("Unknown pool: {}", pool_id))?;
        let max_sessions_allowed =
            pool.nodes.len() * self.configuration.session_defaults.max_sessions_per_pod;
        let sessions = self.list_sessions().await?;
        if sessions.len() >= max_sessions_allowed {
            return Err(format!(
                "Reached maximum number of concurrent sessions allowed: {}",
                max_sessions_allowed
            ));
        }
        let config = config().await?;
        let client = Client::try_from(config).map_err(error_to_string)?;
        // Access the right image id
        let templates = self.clone().list_templates().await?;
        let template = templates
            .get(&conf.template.to_string())
            .ok_or_else(|| format!("Unknow image {}", conf.template))?;

        let namespace = &self.env.namespace;

        let pod_api: Api<Pod> = Api::namespaced(client.clone(), namespace);

        //TODO deploy a new ingress matching the route
        // With the proper mapping
        // Define the correct route
        // Also deploy proper tcp mapping configmap https://kubernetes.github.io/ingress-nginx/user-guide/exposing-tcp-udp-services/

        let mut sessions = BTreeMap::new();
        sessions.insert(session_id.clone(), template);
        self.patch_ingress(&sessions).await?;

        let duration = conf
            .duration
            .unwrap_or(self.configuration.session_defaults.duration);

        log::info!(
            "Creating session for user {} with template {}",
            user.id,
            conf.template
        );

        // Deploy a new pod for this image
        pod_api
            .create(
                &PostParams::default(),
                &create_pod(
                    &self.env,
                    &session_id.clone(),
                    template,
                    &duration,
                    &pool_id,
                )?,
            )
            .await
            .map_err(error_to_string)?;

        // Deploy the associated service
        let service_api: Api<Service> = Api::namespaced(client.clone(), namespace);
        let service = create_service(&session_id.clone(), template);
        service_api
            .create(&PostParams::default(), &service)
            .await
            .map_err(error_to_string)?;

        Ok(())
    }

    pub async fn update_session(
        self,
        session_id: &str,
        conf: SessionUpdateConfiguration,
    ) -> Result<(), String> {
        let session = self
            .clone()
            .get_session(&session_id)
            .await?
            .ok_or_else(|| "No existing session".to_string())?;

        let duration = conf
            .duration
            .unwrap_or(self.configuration.session_defaults.duration);
        if duration != session.duration {
            let config = config().await?;
            let client = Client::try_from(config).map_err(error_to_string)?;
            let pod_api: Api<Pod> = Api::namespaced(client, &self.env.namespace);
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
                .map_err(error_to_string)?;
        }

        Ok(())
    }

    pub async fn delete_session(self, id: &str) -> Result<(), String> {
        // Undeploy the service by its id
        let config = config().await?;
        let client = Client::try_from(config).map_err(error_to_string)?;
        let service_api: Api<Service> = Api::namespaced(client.clone(), &self.env.namespace);
        service_api
            .delete(&service_name(id), &DeleteParams::default())
            .await
            .map_err(|s| format!("Error {}", s))?;

        let pod_api: Api<Pod> = Api::namespaced(client.clone(), &self.env.namespace);
        pod_api
            .delete(&pod_name(id), &DeleteParams::default())
            .await
            .map_err(|s| format!("Error {}", s))?;

        let subdomain = subdomain(&self.env.host, id);
        let ingress_api: Api<Ingress> = Api::namespaced(client, &self.env.namespace);
        let mut ingress: Ingress = ingress_api
            .get(INGRESS_NAME)
            .await
            .map_err(error_to_string)?
            .clone();
        let mut spec = ingress.clone().spec.ok_or("No spec")?.clone();
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
            .map_err(error_to_string)?;

        Ok(())
    }

    pub async fn get_pool(&self, id: &str) -> Result<Option<Pool>, String> {
        let config = config().await?;
        let client = Client::try_from(config).map_err(error_to_string)?;
        let node_api: Api<Node> = Api::all(client);
        let nodes =
            list_by_selector(&node_api, format!("{}={}", NODE_POOL_LABEL, id).to_string()).await?;

        match self.clone().nodes_to_pool(id.to_string(), nodes) {
            Ok(pool) => Ok(Some(pool)),
            Err(_) => Ok(None),
        }
    }

    pub async fn list_pools(&self) -> Result<BTreeMap<String, Pool>, String> {
        let config = config().await?;
        let client = Client::try_from(config).map_err(error_to_string)?;
        let node_api: Api<Node> = Api::all(client);

        let nodes = node_api
            .list(&ListParams::default())
            .await
            .map(|l| l.items)
            .map_err(|s| format!("Error {}", s))?;

        let default = "default".to_string();
        let nodes_by_pool: BTreeMap<String, Vec<Node>> =
            nodes.iter().fold(BTreeMap::new(), |mut acc, node| {
                if let Some(labels) = node.metadata.labels.clone() {
                    let key = labels.get(NODE_POOL_LABEL).unwrap_or(&default);
                    let nodes = acc.entry(key.clone()).or_insert_with(Vec::new);
                    nodes.push(node.clone());
                } else {
                    log::error!("No labels");
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
