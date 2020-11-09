//! Find more details here:
//! * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceStatus.html
//! * https://docs.rs/k8s-openapi/0.5.1/k8s_openapi/api/core/v1/struct.ServiceSpec.html
use crate::template::Template;
use k8s_openapi::api::core::v1::{
    ConfigMap, Container, EnvVar, Pod, PodSpec, Service, ServicePort, ServiceSpec,
};
use k8s_openapi::api::extensions::v1beta1::{
    HTTPIngressPath, HTTPIngressRuleValue, Ingress, IngressBackend, IngressRule,
};
use k8s_openapi::apimachinery::pkg::{apis::meta::v1::ObjectMeta, util::intstr::IntOrString};
use kube::{
    api::{Api, DeleteParams, ListParams, Meta, PostParams},
    config::KubeConfigOptions,
    Client, Config,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::env;
use std::{collections::BTreeMap, error::Error};

const APP_LABEL: &str = "app.kubernetes.io/part-of";
const APP_VALUE: &str = "playground";
const COMPONENT_LABEL: &str = "app.kubernetes.io/component";
const COMPONENT_VALUE: &str = "theia";
const OWNER_LABEL: &str = "app.kubernetes.io/owner";
const INGRESS_NAME: &str = "ingress";
const TEMPLATE_ANNOTATION: &str = "playground.substrate.io/template";
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

fn pod_env_variables(template: &Template, host: &str, user_uuid: &str) -> Vec<EnvVar> {
    let mut envs = vec![
        create_env_var("SUBSTRATE_PLAYGROUND", ""),
        create_env_var("SUBSTRATE_PLAYGROUND_INSTANCE", user_uuid),
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

// TODO detect when ingress is restarted, then re-sync theia instances

fn create_pod(host: &str, user_uuid: &str, template: &Template) -> Result<Pod, String> {
    let mut labels = BTreeMap::new();
    // TODO fetch docker image labels and add them to the pod.
    // Can be done by querying dockerhub (https://docs.docker.com/registry/spec/api/)
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_VALUE.to_string());
    labels.insert(OWNER_LABEL.to_string(), user_uuid.to_string());
    let mut annotations = BTreeMap::new();
    annotations.insert(TEMPLATE_ANNOTATION.to_string(), template.to_string());

    Ok(Pod {
        metadata: ObjectMeta {
            name: Some(pod_name(user_uuid)),
            labels: Some(labels),
            annotations: Some(annotations),
            ..Default::default()
        },
        spec: Some(PodSpec {
            containers: vec![Container {
                name: format!("{}-container", COMPONENT_VALUE),
                image: Some(template.image.to_string()),
                env: Some(pod_env_variables(template, host, user_uuid)),
                ..Default::default()
            }],
            ..Default::default()
        }),
        ..Default::default()
    })
}

fn create_service(user_uuid: &str, template: &Template) -> Service {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_VALUE.to_string());
    labels.insert(OWNER_LABEL.to_string(), user_uuid.to_string());
    let mut selectors = BTreeMap::new();
    selectors.insert(OWNER_LABEL.to_string(), user_uuid.to_string());

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
            name: Some(service_name(user_uuid)),
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

fn subdomain(host: &str, instance_uuid: &str) -> String {
    format!("{}.{}", instance_uuid, host)
}

async fn config() -> Result<Config, String> {
    Config::from_kubeconfig(&KubeConfigOptions::default())
        .await
        .or_else(|_| Config::from_cluster_env())
        .map_err(error_to_string)
}

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

pub async fn get_templates(
    client: Client,
    namespace: &str,
) -> Result<BTreeMap<String, String>, String> {
    get_config_map(client, namespace, "templates").await
}

#[derive(Clone)]
pub struct Configuration {
    pub host: String,
    pub namespace: String,
    pub client_id: String,
    pub client_secret: String,
    pub admins: Vec<String>,
}

#[derive(Clone)]
pub struct Engine {
    pub configuration: Configuration,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InstanceDetails {
    pub user_uuid: String,
    pub template: Template,
    pub url: String,
    pub pod: PodDetails,
}

impl InstanceDetails {
    pub fn new(engine: Engine, user_uuid: String, template: &Template, pod: PodDetails) -> Self {
        InstanceDetails {
            user_uuid: user_uuid.clone(),
            template: template.clone(),
            url: InstanceDetails::url(engine, user_uuid),
            pod,
        }
    }

    fn url(engine: Engine, user_uuid: String) -> String {
        format!("//{}.{}", user_uuid, engine.configuration.host)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PodDetails {
    // Docker labels (https://github.com/opencontainers/image-spec/blob/master/annotations.md)
    pub title: Option<String>,
    pub description: Option<String>,
    pub version: Option<String>,
    pub revision: Option<String>,
    pub details: Pod,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PlaygroundDetails {
    pub github_client_id: Option<String>,
    pub pod: PodDetails,
}

impl Default for PodDetails {
    fn default() -> Self {
        Self {
            title: None,
            description: None,
            version: None,
            revision: None,
            details: Pod { ..Pod::default() },
        }
    }
}

impl Engine {
    pub async fn new() -> Result<Self, Box<dyn Error>> {
        let config = config().await?;
        let namespace = config.clone().default_ns.to_string();
        let client = Client::new(config);
        let ingress_api: Api<Ingress> = Api::namespaced(client.clone(), &namespace);
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

        let admins_config = env::var("ADMINS").map_err(|_| "ADMINS must be set")?;
        let admins = admins_config.split(",").map(|s| s.to_string()).collect();
        let client_id = env::var("GITHUB_CLIENT_ID").map_err(|_| "GITHUB_CLIENT_ID must be set")?;
        let client_secret =
            env::var("GITHUB_CLIENT_SECRET").map_err(|_| "GITHUB_CLIENT_SECRET must be set")?;

        Ok(Engine {
            configuration: Configuration {
                host,
                namespace,
                client_id,
                client_secret,
                admins,
            },
        })
    }

    fn pod_to_instance(self, pod: &Pod) -> Result<InstanceDetails, String> {
        let labels = pod.metadata.labels.clone().ok_or("no labels")?;
        Ok(InstanceDetails::new(
            self.clone(),
            labels.get(OWNER_LABEL).ok_or("no owner label")?.to_string(),
            &Template::parse(
                &pod.metadata
                    .annotations
                    .clone()
                    .ok_or("no annotations")?
                    .get(TEMPLATE_ANNOTATION)
                    .ok_or("no template annotation")?
                    .to_string(),
            )?,
            Self::pod_to_details(self, pod)?,
        ))
    }

    fn pod_to_details(self, pod: &Pod) -> Result<PodDetails, String> {
        Ok(PodDetails {
            details: pod.clone(),
            ..Default::default()
        })
    }

    pub async fn get(self) -> Result<PodDetails, String> {
        let config = config().await?;
        let client = Client::new(config);
        let pod_api: Api<Pod> = Api::namespaced(client, &self.configuration.namespace);
        let pods = list_by_selector(
            &pod_api,
            format!("{}={}", COMPONENT_LABEL, "backend-api").to_string(),
        )
        .await?;
        let pod = pods.first().ok_or_else(|| "No API pod".to_string())?;

        Ok(self.pod_to_details(&pod)?)
    }

    pub async fn get_instance(self, user: &str) -> Result<InstanceDetails, String> {
        let config = config().await?;
        let client = Client::new(config);
        let pod_api: Api<Pod> = Api::namespaced(client, &self.configuration.namespace);
        let pod = pod_api
            .get(&pod_name(user))
            .await
            .map_err(error_to_string)?;

        Ok(self.pod_to_instance(&pod)?)
    }

    pub async fn get_templates(self) -> Result<BTreeMap<String, Template>, String> {
        let config = config().await?;
        let client = Client::new(config);

        Ok(get_templates(client, &self.configuration.namespace)
            .await?
            .into_iter()
            .map(|(k, v)| Template::parse(&v).map(|v2| (k, v2)))
            .collect::<Result<BTreeMap<String, Template>, String>>()?)
    }

    /// Lists all currently running instances
    pub async fn list_all(&self) -> Result<BTreeMap<String, InstanceDetails>, String> {
        let config = config().await?;
        let client = Client::new(config);
        let pod_api: Api<Pod> = Api::namespaced(client, &self.configuration.namespace);
        let pods = list_by_selector(
            &pod_api,
            format!("{}={}", COMPONENT_LABEL, COMPONENT_VALUE).to_string(),
        )
        .await?;

        Ok(pods
            .iter()
            .flat_map(|pod| {
                self.clone()
                    .pod_to_instance(pod)
                    .ok()
                    .map(|i| (i.clone().user_uuid, i))
            })
            .collect())
    }

    pub async fn patch_ingress(
        &self,
        instances: BTreeMap<String, &Template>,
    ) -> Result<(), String> {
        let config = config().await?;
        let client = Client::new(config);
        let ingress_api: Api<Ingress> = Api::namespaced(client, &self.configuration.namespace);
        let mut ingress: Ingress = ingress_api
            .get(INGRESS_NAME)
            .await
            .map_err(error_to_string)?
            .clone();
        let mut spec = ingress.clone().spec.ok_or("No spec")?.clone();
        let mut rules: Vec<IngressRule> = spec.clone().rules.ok_or("No rules")?;
        for (uuid, template) in instances {
            let subdomain = subdomain(&self.configuration.host, &uuid);
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

    pub async fn deploy(self, user_uuid: &str, template_id: &str) -> Result<String, String> {
        if self.clone().get_instance(&user_uuid).await.is_ok() {
            return Err("One instance is already running".to_string());
        }

        let config = config().await?;
        let client = Client::new(config);
        // Access the right image id
        let templates = get_templates(client.clone(), &self.configuration.namespace).await?;
        let template = templates
            .get(&template_id.to_string())
            .ok_or_else(|| format!("Unknow image {}", template_id))?;
        let instance_template = &Template::parse(&template)?;

        // Create a unique ID for this instance. Use lowercase to make sure the result can be used as part of a DNS
        let instance_uuid = user_uuid.to_string().to_lowercase();
        let namespace = &self.configuration.namespace;

        let pod_api: Api<Pod> = Api::namespaced(client.clone(), namespace);

        // Define the correct route
        let mut instances = BTreeMap::new();
        instances.insert(instance_uuid.clone(), instance_template);
        self.patch_ingress(instances).await?;

        // Deploy a new pod for this image
        pod_api
            .create(
                &PostParams::default(),
                &create_pod(&self.configuration.host, &user_uuid, instance_template)?,
            )
            .await
            .map_err(error_to_string)?;

        // Deploy the associated service
        let service_api: Api<Service> = Api::namespaced(client.clone(), namespace);
        let service = create_service(&instance_uuid.clone(), instance_template);
        service_api
            .create(&PostParams::default(), &service)
            .await
            .map_err(error_to_string)?;

        Ok(instance_uuid)
    }

    pub async fn undeploy(self, instance_uuid: &str) -> Result<(), String> {
        // Undeploy the service by its id
        let config = config().await?;
        let client = Client::new(config);
        let service_api: Api<Service> =
            Api::namespaced(client.clone(), &self.configuration.namespace);
        service_api
            .delete(&service_name(instance_uuid), &DeleteParams::default())
            .await
            .map_err(|s| format!("Error {}", s))?;

        let pod_api: Api<Pod> = Api::namespaced(client.clone(), &self.configuration.namespace);
        pod_api
            .delete(&pod_name(instance_uuid), &DeleteParams::default())
            .await
            .map_err(|s| format!("Error {}", s))?;

        let subdomain = subdomain(&self.configuration.host, instance_uuid);
        let ingress_api: Api<Ingress> = Api::namespaced(client, &self.configuration.namespace);
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
