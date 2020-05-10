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
    client::APIClient,
    config,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{collections::BTreeMap, error::Error, time::SystemTime};
use uuid::Uuid;

const APP_LABEL: &str = "app.kubernetes.io/name";
const APP_VALUE: &str = "playground";
const COMPONENT_LABEL: &str = "app.kubernetes.io/component";
const COMPONENT_VALUE: &str = "theia";
const OWNER_LABEL: &str = "app.kubernetes.io/owner";
const INSTANCE_LABEL: &str = "app.kubernetes.io/instance";
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

pub fn pod_name(instance_uuid: &str) -> String {
    format!("{}-{}", COMPONENT_VALUE, instance_uuid)
}

pub fn service_name(instance_uuid: &str) -> String {
    format!("{}-service-{}", COMPONENT_VALUE, instance_uuid)
}

fn create_env_var(name: &str, value: &str) -> EnvVar {
    EnvVar {
        name: name.to_string(),
        value: Some(value.to_string()),
        ..Default::default()
    }
}

fn pod_env_variables(
    template: &Template,
    host: &str,
    user_uuid: &str,
    instance_uuid: &str,
) -> Vec<EnvVar> {
    let mut envs = vec![
        create_env_var("SUBSTRATE_PLAYGROUND", ""),
        create_env_var("SUBSTRATE_PLAYGROUND_USER", user_uuid),
        create_env_var("SUBSTRATE_PLAYGROUND_INSTANCE", instance_uuid),
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

fn create_pod(
    host: &str,
    user_uuid: &str,
    instance_uuid: &str,
    template: &Template,
) -> Result<Pod, String> {
    let mut labels = BTreeMap::new();
    // TODO fetch docker image labels and add them to the pod.
    // Can be done by querying dockerhub (https://docs.docker.com/registry/spec/api/)
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_VALUE.to_string());
    labels.insert(OWNER_LABEL.to_string(), user_uuid.to_string());
    labels.insert(INSTANCE_LABEL.to_string(), instance_uuid.to_string());
    let mut annotations = BTreeMap::new();
    annotations.insert(TEMPLATE_ANNOTATION.to_string(), template.to_string());

    Ok(Pod {
        metadata: Some(ObjectMeta {
            name: Some(pod_name(instance_uuid)),
            labels: Some(labels),
            annotations: Some(annotations),
            ..Default::default()
        }),
        spec: Some(PodSpec {
            containers: vec![Container {
                name: format!("{}-container", COMPONENT_VALUE),
                image: Some(template.image.to_string()),
                env: Some(pod_env_variables(template, host, user_uuid, instance_uuid)),
                ..Default::default()
            }],
            ..Default::default()
        }),
        ..Default::default()
    })
}

fn create_service(instance_uuid: &str, template: &Template) -> Service {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_VALUE.to_string());
    labels.insert(INSTANCE_LABEL.to_string(), instance_uuid.to_string());
    let mut selectors = BTreeMap::new();
    selectors.insert(INSTANCE_LABEL.to_string(), instance_uuid.to_string());

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
        metadata: Some(ObjectMeta {
            name: Some(service_name(instance_uuid)),
            labels: Some(labels),
            ..Default::default()
        }),
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

async fn config() -> Result<kube::config::Configuration, String> {
    config::load_kube_config()
        .await
        .or_else(|_| config::incluster_config())
        .map_err(error_to_string)
}

async fn get_config_map(
    client: APIClient,
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
    client: APIClient,
    namespace: &str,
) -> Result<BTreeMap<String, String>, String> {
    get_config_map(client, namespace, "templates").await
}

#[derive(Clone)]
pub struct Engine {
    host: String,
    namespace: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InstanceDetails {
    pub user_uuid: String,
    pub instance_uuid: String,
    pub template: Template,
    pub url: String,
    pub details: PodDetails,
}

impl InstanceDetails {
    pub fn new(
        engine: Engine,
        user_uuid: String,
        instance_uuid: String,
        template: &Template,
        details: PodDetails,
    ) -> Self {
        InstanceDetails {
            user_uuid,
            instance_uuid: instance_uuid.clone(),
            template: template.clone(),
            url: InstanceDetails::url(engine, instance_uuid),
            details,
        }
    }

    fn url(engine: Engine, instance_uuid: String) -> String {
        format!("https://{}.{}", instance_uuid, engine.host)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PodDetails {
    // Docker labels (https://github.com/opencontainers/image-spec/blob/master/annotations.md)
    pub title: Option<String>,
    pub description: Option<String>,
    pub version: Option<String>,
    pub revision: Option<String>,
    pub url: Option<String>,
    // PodStatus
    pub started_at: SystemTime,
    pub phase: String,
}

impl Default for PodDetails {
    fn default() -> Self {
        Self {
            title: None,
            description: None,
            version: None,
            revision: None,
            url: None,
            started_at: SystemTime::UNIX_EPOCH,
            phase: "".to_string(),
        }
    }
}

impl Engine {
    pub async fn new() -> Result<Self, Box<dyn Error>> {
        let config = config().await?;
        let namespace = config.clone().default_ns.to_string();
        let client = APIClient::new(config);
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

        Ok(Engine { host, namespace })
    }

    fn owner_selector(user_uuid: &str) -> String {
        format!("{}={}", OWNER_LABEL, user_uuid)
    }

    fn pod_to_instance(self, pod: &Pod) -> Result<InstanceDetails, String> {
        let (user_uuid, instance_uuid, template) = pod
            .metadata
            .as_ref()
            .and_then(|md| {
                Some((
                    md.labels.clone()?.get(OWNER_LABEL)?.to_string(),
                    md.labels.clone()?.get(INSTANCE_LABEL)?.to_string(),
                    md.annotations
                        .clone()?
                        .get(TEMPLATE_ANNOTATION)?
                        .to_string(),
                ))
            })
            .ok_or("Metadata unavailable")?;

        Ok(InstanceDetails::new(
            self.clone(),
            user_uuid,
            instance_uuid,
            &Template::parse(&template)?,
            Self::pod_to_details(self, pod)?,
        ))
    }

    fn pod_to_details(self, pod: &Pod) -> Result<PodDetails, String> {
        let (phase, started_at): (String, SystemTime) = pod
            .status // https://docs.rs/k8s-openapi/0.7.1/k8s_openapi/api/core/v1/struct.PodStatus.html
            .as_ref()
            .and_then(|pod_status| {
                Some((
                    pod_status.clone().phase?,
                    pod_status.clone().start_time?.0.into(),
                ))
            })
            .ok_or("PodStatus unavailable")?;

        pod.metadata
            .as_ref()
            .and_then(|md| {
                Some((
                    //TODO extract relevant labels
                    md.labels.clone()?.get(OWNER_LABEL)?.to_string(),
                    md.labels.clone()?.get(INSTANCE_LABEL)?.to_string(),
                ))
            })
            .ok_or("Metadata unavailable")?;

        Ok(PodDetails {
            phase,
            started_at,
            ..Default::default()
        })
    }

    pub async fn get(self) -> Result<PodDetails, String> {
        let config = config().await?;
        let client = APIClient::new(config);
        let pod_api: Api<Pod> = Api::namespaced(client, &self.namespace);
        let pod = pod_api.get("TODO").await.map_err(error_to_string)?;

        Ok(self.pod_to_details(&pod)?)
    }

    pub async fn get_instance(self, instance_uuid: &str) -> Result<InstanceDetails, String> {
        let config = config().await?;
        let client = APIClient::new(config);
        let pod_api: Api<Pod> = Api::namespaced(client, &self.namespace);
        let pod = pod_api
            .get(&pod_name(instance_uuid))
            .await
            .map_err(error_to_string)?;

        Ok(self.pod_to_instance(&pod)?)
    }

    pub async fn get_templates(self) -> Result<BTreeMap<String, Template>, String> {
        let config = config().await?;
        let client = APIClient::new(config);

        Ok(get_templates(client, &self.namespace)
            .await?
            .into_iter()
            .map(|(k, v)| Template::parse(&v).map(|v2| (k, v2)))
            .collect::<Result<BTreeMap<String, Template>, String>>()?)
    }

    /// Lists all currently running instances for an identified user
    pub async fn list(self, user_uuid: &str) -> Result<Vec<InstanceDetails>, String> {
        let config = config().await?;
        let client = APIClient::new(config);
        let pod_api: Api<Pod> = Api::namespaced(client, &self.namespace);
        let pods = list_by_selector(&pod_api, Engine::owner_selector(user_uuid)).await?;

        Ok(pods
            .iter()
            .flat_map(|pod| self.clone().pod_to_instance(pod).ok())
            .collect::<Vec<_>>())
    }

    pub async fn list_all(&self) -> Result<BTreeMap<String, InstanceDetails>, String> {
        let config = config().await?;
        let client = APIClient::new(config);
        let pod_api: Api<Pod> = Api::namespaced(client, &self.namespace);
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
        let client = APIClient::new(config);
        let ingress_api: Api<Ingress> = Api::namespaced(client, &self.namespace);
        let mut ingress: Ingress = ingress_api
            .get(INGRESS_NAME)
            .await
            .map_err(error_to_string)?
            .clone();
        let mut spec = ingress.clone().spec.ok_or("No spec")?.clone();
        let mut rules: Vec<IngressRule> = spec.clone().rules.ok_or("No rules")?;
        for (uuid, template) in instances {
            let subdomain = subdomain(&self.host, &uuid);
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
        if !self.clone().list(&user_uuid).await?.is_empty() {
            return Err("One instance is already running".to_string());
        }

        let config = config().await?;
        let client = APIClient::new(config);
        // Access the right image id
        let templates = get_templates(client.clone(), &self.namespace).await?;
        let template = templates
            .get(&template_id.to_string())
            .ok_or_else(|| format!("Unknow image {}", template_id))?;
        let instance_template = &Template::parse(&template)?;

        // Create a unique ID for this instance
        let instance_uuid = format!("{}", Uuid::new_v4());
        let namespace = &self.namespace;

        let pod_api: Api<Pod> = Api::namespaced(client.clone(), namespace);

        // Define the correct route
        let mut instances = BTreeMap::new();
        instances.insert(instance_uuid.clone(), instance_template);
        self.patch_ingress(instances).await?;

        // Deploy a new pod for this image
        pod_api
            .create(
                &PostParams::default(),
                &create_pod(
                    &self.host,
                    &user_uuid,
                    &instance_uuid.clone(),
                    instance_template,
                )?,
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
        let client = APIClient::new(config);
        let service_api: Api<Service> = Api::namespaced(client.clone(), &self.namespace);
        service_api
            .delete(&service_name(instance_uuid), &DeleteParams::default())
            .await
            .map_err(|s| format!("Error {}", s))?;

        let pod_api: Api<Pod> = Api::namespaced(client.clone(), &self.namespace);
        pod_api
            .delete(&pod_name(instance_uuid), &DeleteParams::default())
            .await
            .map_err(|s| format!("Error {}", s))?;

        let subdomain = subdomain(&self.host, instance_uuid);
        let ingress_api: Api<Ingress> = Api::namespaced(client, &self.namespace);
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
