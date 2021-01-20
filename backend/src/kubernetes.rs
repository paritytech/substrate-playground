//! Find more details here:
//! * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceStatus.html
//! * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceSpec.html
use crate::user::{User, UserConfiguration};
use crate::{
    session::{Session, SessionConfiguration, SessionDefaults},
    template::Template,
};
use k8s_openapi::api::core::v1::{
    ConfigMap, Container, EnvVar, Pod, PodSpec, Service, ServicePort, ServiceSpec,
};
use k8s_openapi::api::extensions::v1beta1::{
    HTTPIngressPath, HTTPIngressRuleValue, Ingress, IngressBackend, IngressRule,
};
use k8s_openapi::apimachinery::pkg::{apis::meta::v1::ObjectMeta, util::intstr::IntOrString};
use kube::{
    api::{Api, DeleteParams, ListParams, Meta, PatchParams, PatchStrategy, PostParams},
    config::KubeConfigOptions,
    Client, Config,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{collections::BTreeMap, error::Error, time::Duration};
use std::{env, str::FromStr, time::SystemTime};

const APP_LABEL: &str = "app.kubernetes.io/part-of";
const APP_VALUE: &str = "playground";
const COMPONENT_LABEL: &str = "app.kubernetes.io/component";
const COMPONENT_VALUE: &str = "theia";
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

pub fn service_name(user: &str) -> String {
    format!("{}-service-{}", COMPONENT_VALUE, user)
}

fn create_env_var(name: &str, value: &str) -> EnvVar {
    EnvVar {
        name: name.to_string(),
        value: Some(value.to_string()),
        ..Default::default()
    }
}

fn pod_env_variables(template: &Template, host: &str, session_uuid: &str) -> Vec<EnvVar> {
    let mut envs = vec![
        create_env_var("SUBSTRATE_PLAYGROUND", ""),
        create_env_var("SUBSTRATE_PLAYGROUND_SESSION", session_uuid),
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

fn create_pod_annotations(template: &Template, duration: &Duration) -> BTreeMap<String, String> {
    let mut annotations = BTreeMap::new();
    annotations.insert(TEMPLATE_ANNOTATION.to_string(), template.to_string());
    annotations.insert(
        SESSION_DURATION_ANNOTATION.to_string(),
        session_duration_annotation(*duration),
    );
    annotations
}

fn create_pod(
    env: &Environment,
    session_uuid: &str,
    template: &Template,
    duration: &Duration,
) -> Pod {
    let mut labels = BTreeMap::new();
    // TODO fetch docker image labels and add them to the pod.
    // Can be done by querying dockerhub (https://docs.docker.com/registry/spec/api/)
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_VALUE.to_string());
    labels.insert(OWNER_LABEL.to_string(), session_uuid.to_string());

    Pod {
        metadata: ObjectMeta {
            name: Some(pod_name(session_uuid)),
            labels: Some(labels),
            annotations: Some(create_pod_annotations(template, duration)),
            ..Default::default()
        },
        spec: Some(PodSpec {
            containers: vec![Container {
                name: format!("{}-container", COMPONENT_VALUE),
                image: Some(template.image.to_string()),
                env: Some(pod_env_variables(template, &env.host, session_uuid)),
                ..Default::default()
            }],
            ..Default::default()
        }),
        ..Default::default()
    }
}

fn create_service(session_uuid: &str, template: &Template) -> Service {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_VALUE.to_string());
    labels.insert(OWNER_LABEL.to_string(), session_uuid.to_string());
    let mut selectors = BTreeMap::new();
    selectors.insert(OWNER_LABEL.to_string(), session_uuid.to_string());

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
            name: Some(service_name(session_uuid)),
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

fn subdomain(host: &str, session_uuid: &str) -> String {
    format!("{}.{}", session_uuid, host)
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
        patch_strategy: PatchStrategy::JSON,
        ..PatchParams::default()
    };
    config_map_api
        .patch(
            name,
            &params,
            patch_to_vec("add", format!("/data/{}", key).as_str(), Some(value))?,
        )
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
        patch_strategy: PatchStrategy::JSON,
        ..PatchParams::default()
    };
    config_map_api
        .patch(
            name,
            &params,
            patch_to_vec("remove", format!("/data/{}", key).as_str(), None)?,
        )
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

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum Phase {
    Pending,
    Running,
    Succeeded,
    Failed,
    Unknown,
}

impl FromStr for Phase {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "Pending" => Ok(Phase::Pending),
            "Running" => Ok(Phase::Running),
            "Succeeded" => Ok(Phase::Succeeded),
            "Failed" => Ok(Phase::Failed),
            "Unknown" => Ok(Phase::Unknown),
            _ => Err(format!("'{}' is not a valid value for Phase", s)),
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PodDetails {
    pub phase: Phase,
    pub reason: String,
    pub message: String,
    #[serde(with = "system_time")]
    pub start_time: Option<SystemTime>,
}

mod system_time {
    use serde::{self, Serializer};
    use std::time::SystemTime;

    pub fn serialize<S>(date: &Option<SystemTime>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match date.and_then(|v| v.elapsed().ok()) {
            Some(value) => serializer.serialize_some(&value.as_secs()),
            None => serializer.serialize_none(),
        }
    }
}

fn get_session_duration(conf: Configuration, session_conf: SessionConfiguration) -> Duration {
    session_conf
        .duration
        .unwrap_or(conf.session_defaults.duration)
}

fn patch_to_vec(op: &str, path: &str, value: Option<&str>) -> Result<Vec<u8>, String> {
    let json = match value {
        Some(value) => serde_json::json!([{
            "op": op,
            "path": path,
            "value": value,
        }]),
        None => serde_json::json!([{
            "op": op,
            "path": path,
        }]),
    };
    serde_json::to_vec(&json).map_err(error_to_string)
}

impl Engine {
    pub async fn new() -> Result<Self, Box<dyn Error>> {
        let config = config().await?;
        let namespace = config.clone().default_ns.to_string();
        let client = Client::new(config);
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
        let username = labels.get(OWNER_LABEL).ok_or("no owner label")?.to_string();
        let annotations = &pod.metadata.annotations.clone().ok_or("no annotations")?;
        let template = Template::parse(
            &annotations
                .get(TEMPLATE_ANNOTATION)
                .ok_or("no template annotation")?,
        )?;
        let duration = str_to_session_duration_minutes(
            annotations
                .get(SESSION_DURATION_ANNOTATION)
                .ok_or("no session_duration annotation")?,
        )?;
        Ok(Session {
            username: username.clone(),
            template,
            url: subdomain(&env.host, &username),
            pod: Self::pod_to_details(self, pod)?,
            duration,
        })
    }

    fn pod_to_details(self, pod: &Pod) -> Result<PodDetails, String> {
        let status = pod.status.as_ref().ok_or("No status")?;
        Ok(PodDetails {
            phase: Phase::from_str(
                &status
                    .clone()
                    .phase
                    .unwrap_or_else(|| "Unknown".to_string()),
            )?,
            reason: status.clone().reason.unwrap_or_else(|| "".to_string()),
            message: status.clone().message.unwrap_or_else(|| "".to_string()),
            start_time: status
                .clone()
                .start_time.and_then(|dt| Some(dt.0.into())),
        })
    }

    fn yaml_to_user(self, s: &str) -> Result<User, String> {
        let user_configuration = UserConfiguration::parse(s)?;
        Ok(User {
            admin: user_configuration.admin,
        })
    }

    pub async fn list_templates(self) -> Result<BTreeMap<String, Template>, String> {
        let config = config().await?;
        let client = Client::new(config);

        Ok(get_templates(client, &self.env.namespace)
            .await?
            .into_iter()
            .map(|(k, v)| Template::parse(&v).map(|v2| (k, v2)))
            .collect::<Result<BTreeMap<String, Template>, String>>()?)
    }

    pub async fn get_user(self, id: &str) -> Result<Option<User>, String> {
        let config = config().await?;
        let client = Client::new(config);

        let users = list_users(client, &self.env.namespace).await?;
        let user = users.get(id);

        match user.map(|user| self.clone().yaml_to_user(&user)) {
            Some(user) => user.map(Some),
            None => Ok(None),
        }
    }

    pub async fn list_users(self) -> Result<BTreeMap<String, User>, String> {
        let config = config().await?;
        let client = Client::new(config);

        Ok(list_users(client, &self.env.namespace)
            .await?
            .into_iter()
            .map(|(k, v)| Ok((k, self.clone().yaml_to_user(&v)?)))
            .collect::<Result<BTreeMap<String, User>, String>>()?)
    }

    pub async fn create_or_update_user(
        self,
        id: String,
        user: UserConfiguration,
    ) -> Result<User, String> {
        let config = config().await?;
        let client = Client::new(config);

        add_config_map_value(
            client,
            &self.env.namespace,
            USERS_CONFIG_MAP,
            id.as_str(),
            format!("admin: {}", user.admin).as_str(),
        )
        .await?;

        Ok(User { admin: user.admin })
    }

    pub async fn delete_user(self, id: String) -> Result<(), String> {
        let config = config().await?;
        let client = Client::new(config);
        delete_config_map_value(client, &self.env.namespace, USERS_CONFIG_MAP, id.as_str()).await
    }

    pub async fn get_session(self, username: &str) -> Result<Option<Session>, String> {
        let config = config().await?;
        let client = Client::new(config);
        let pod_api: Api<Pod> = Api::namespaced(client, &self.env.namespace);
        let pod = pod_api.get(&pod_name(username)).await.ok();

        match pod.map(|pod| self.clone().pod_to_session(&self.env, &pod)) {
            Some(session) => session.map(|session| Some(session)),
            None => Ok(None),
        }
    }

    /// Lists all currently running sessions
    pub async fn list_sessions(&self) -> Result<Vec<Session>, String> {
        let config = config().await?;
        let client = Client::new(config);
        let pod_api: Api<Pod> = Api::namespaced(client, &self.env.namespace);
        let pods = list_by_selector(
            &pod_api,
            format!("{}={}", COMPONENT_LABEL, COMPONENT_VALUE).to_string(),
        )
        .await?;

        Ok(pods
            .iter()
            .flat_map(|pod| self.clone().pod_to_session(&self.env, pod).ok())
            .collect())
    }

    pub async fn patch_ingress(
        &self,
        templates: BTreeMap<String, &Template>,
    ) -> Result<(), String> {
        let config = config().await?;
        let client = Client::new(config);
        let ingress_api: Api<Ingress> = Api::namespaced(client, &self.env.namespace);
        let mut ingress: Ingress = ingress_api
            .get(INGRESS_NAME)
            .await
            .map_err(error_to_string)?
            .clone();
        let mut spec = ingress.clone().spec.ok_or("No spec")?.clone();
        let mut rules: Vec<IngressRule> = spec.clone().rules.ok_or("No rules")?;
        for (uuid, template) in templates {
            let subdomain = subdomain(&self.env.host, &uuid);
            rules.push(IngressRule {
                host: Some(subdomain.clone()),
                http: Some(HTTPIngressRuleValue {
                    paths: create_ingress_paths(service_name(&uuid), template),
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
        session_uuid: String,
        conf: SessionConfiguration,
    ) -> Result<Session, String> {
        let config = config().await?;
        let client = Client::new(config);
        // Access the right image id
        let templates = get_templates(client.clone(), &self.env.namespace).await?;
        let template_str = templates
            .get(&conf.template.to_string())
            .ok_or_else(|| format!("Unknow image {}", conf.template))?;
        let template = &Template::parse(&template_str)?;

        let namespace = &self.env.namespace;

        let pod_api: Api<Pod> = Api::namespaced(client.clone(), namespace);

        //TODO deploy a new ingress matching the route
        // With the proper mapping
        // Define the correct route
        // Also deploy proper tcp mapping configmap https://kubernetes.github.io/ingress-nginx/user-guide/exposing-tcp-udp-services/
        let mut sessions = BTreeMap::new();
        sessions.insert(session_uuid.clone(), template);
        self.patch_ingress(sessions).await?;

        // Deploy a new pod for this image
        let pod = pod_api
            .create(
                &PostParams::default(),
                &create_pod(
                    &self.env,
                    &session_uuid.clone(),
                    template,
                    &get_session_duration(self.clone().configuration, conf),
                ),
            )
            .await
            .map_err(error_to_string)?;

        // Deploy the associated service
        let service_api: Api<Service> = Api::namespaced(client.clone(), namespace);
        let service = create_service(&session_uuid.clone(), template);
        service_api
            .create(&PostParams::default(), &service)
            .await
            .map_err(error_to_string)?;

        Ok(self.clone().pod_to_session(&self.env, &pod)?)
    }

    pub async fn update_session(
        self,
        session: Session,
        conf: SessionConfiguration,
    ) -> Result<Session, String> {
        let duration = get_session_duration(self.configuration, conf);
        if duration != session.duration {
            let config = config().await?;
            let client = Client::new(config);
            let pod_api: Api<Pod> = Api::namespaced(client, &self.env.namespace);
            let params = PatchParams {
                patch_strategy: PatchStrategy::JSON,
                ..PatchParams::default()
            };
            pod_api
                .patch(
                    &pod_name(&session.username),
                    &params,
                    patch_to_vec(
                        "add",
                        format!("/metadata/annotations/{}", SESSION_DURATION_ANNOTATION).as_str(),
                        Some(session_duration_annotation(duration).as_str()),
                    )?,
                )
                .await
                .map_err(error_to_string)?;
        }

        Ok(Session {
            duration,
            ..session
        })
    }

    pub async fn create_or_update_session(
        self,
        username: &str,
        conf: SessionConfiguration,
    ) -> Result<Session, String> {
        // Create a unique ID for this session. Use lowercase to make sure the result can be used as part of a DNS
        let session_uuid = username.to_string().to_lowercase();
        if let Ok(Some(session)) = self.clone().get_session(&session_uuid.clone()).await {
            self.update_session(session, conf).await
        } else {
            self.create_session(session_uuid, conf).await
        }
    }

    pub async fn delete_session(self, username: &str) -> Result<(), String> {
        // Undeploy the service by its id
        let config = config().await?;
        let client = Client::new(config);
        let service_api: Api<Service> = Api::namespaced(client.clone(), &self.env.namespace);
        service_api
            .delete(&service_name(username), &DeleteParams::default())
            .await
            .map_err(|s| format!("Error {}", s))?;

        let pod_api: Api<Pod> = Api::namespaced(client.clone(), &self.env.namespace);
        pod_api
            .delete(&pod_name(username), &DeleteParams::default())
            .await
            .map_err(|s| format!("Error {}", s))?;

        let subdomain = subdomain(&self.env.host, username);
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
}
