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

fn create_pod(
    user_uuid: &str,
    instance_uuid: &str,
    instance_template: &Template,
) -> Result<Pod, String> {
    let mut labels = BTreeMap::new();
    labels.insert(APP_LABEL.to_string(), APP_VALUE.to_string());
    labels.insert(COMPONENT_LABEL.to_string(), COMPONENT_VALUE.to_string());
    labels.insert(OWNER_LABEL.to_string(), user_uuid.to_string());
    labels.insert(INSTANCE_LABEL.to_string(), instance_uuid.to_string());
    let mut annotations = BTreeMap::new();
    annotations.insert(
        TEMPLATE_ANNOTATION.to_string(),
        instance_template.to_string(),
    );

    Ok(Pod {
        metadata: Some(ObjectMeta {
            name: Some(pod_name(instance_uuid)),
            labels: Some(labels),
            annotations: Some(annotations),
            ..Default::default()
        }),
        spec: Some(PodSpec {
            containers: vec![Container {
                name: format!("{}-container", COMPONENT_VALUE).to_string(),
                image: Some(instance_template.image.to_string()),
                env: instance_template.runtime.as_ref().and_then(|r| {
                    r.env.clone().map(|m| {
                        m.into_iter()
                            .map(|p| EnvVar {
                                name: p.name,
                                value: Some(p.value),
                                ..Default::default()
                            })
                            .collect()
                    })
                }),
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

    Service {
        metadata: Some(ObjectMeta {
            name: Some(service_name(instance_uuid)),
            labels: Some(labels),
            ..Default::default()
        }),
        spec: Some(ServiceSpec {
            type_: Some("NodePort".to_string()),
            selector: Some(selectors),
            ports: template.runtime.as_ref().and_then(|r| {
                r.ports.clone().and_then(|ports| {
                    Some(
                        ports
                            .iter()
                            .map(|port| ServicePort {
                                name: Some(port.clone().name),
                                protocol: port.clone().protocol,
                                port: port.port,
                                target_port: port.clone().target.map(|p| IntOrString::Int(p)),
                                ..Default::default()
                            })
                            .collect(),
                    )
                })
            }),
            ..Default::default()
        }),
        ..Default::default()
    }
}

fn create_ingress_rule(
    subdomain: String,
    service_name: String,
    template: &Template,
) -> IngressRule {
    IngressRule {
        host: Some(subdomain),
        http: template.runtime.as_ref().and_then(|r| {
            r.ports.clone().and_then(|ports| {
                Some(HTTPIngressRuleValue { paths:
                    ports
                        .iter()
                        .map(|port| HTTPIngressPath {
                            path: Some(port.clone().path),
                            backend: IngressBackend {
                                service_name: service_name.clone(),
                                service_port: IntOrString::Int(port.port),
                            },
                        })
                        .collect(),
                    }
                )
            })
        }),
    }
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
    host: Option<String>,
    namespace: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InstanceDetails {
    pub user_uuid: String,
    pub instance_uuid: String,
    pub template: Template,
    pub phase: String,
    pub url: String,
    pub started_at: SystemTime,
}

impl InstanceDetails {
    pub fn new(
        engine: Engine,
        user_uuid: String,
        instance_uuid: String,
        template: &Template,
        phase: String,
        started_at: SystemTime,
    ) -> Self {
        InstanceDetails {
            user_uuid: user_uuid.clone(),
            instance_uuid: instance_uuid.clone(),
            phase,
            template: template.clone(),
            url: InstanceDetails::url(engine, instance_uuid),
            started_at,
        }
    }

    fn url(engine: Engine, instance_uuid: String) -> String {
        if let Some(host) = engine.host {
            format!("//{}.{}", instance_uuid, host)
        } else {
            format!("//{}", instance_uuid)
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
                .clone()
        } else {
            None
        };

        Ok(Engine { host, namespace })
    }

    fn owner_selector(user_uuid: &str) -> String {
        format!("{}={}", OWNER_LABEL, user_uuid)
    }

    fn pod_to_instance(self, pod: &Pod) -> Result<InstanceDetails, String> {
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
            self,
            user_uuid,
            instance_uuid,
            &Template::parse(&template)?,
            phase,
            started_at,
        ))
    }

    pub async fn get(self, instance_uuid: &str) -> Result<InstanceDetails, String> {
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

    /// Lists all currently running instances an identified user
    pub async fn list(self, user_uuid: &str) -> Result<Vec<String>, String> {
        let config = config().await?;
        let client = APIClient::new(config);
        let pod_api: Api<Pod> = Api::namespaced(client, &self.namespace);
        let pods = list_by_selector(&pod_api, Engine::owner_selector(user_uuid)).await?;
        let names: Vec<String> = pods
            .iter()
            .flat_map(|pod| {
                pod.metadata
                    .as_ref()
                    .and_then(|md| Some(md.labels.clone()?.get(INSTANCE_LABEL)?.to_string()))
            })
            .collect::<Vec<_>>();

        Ok(names)
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
        let names = pods
            .iter()
            .flat_map(|pod| {
                self.clone()
                    .pod_to_instance(pod)
                    .ok()
                    .map(|i| (i.clone().user_uuid, i))
            })
            .collect();

        Ok(names)
    }

    pub async fn patch_ingress(
        self,
        instances: BTreeMap<String, &Template>,
    ) -> Result<(), String> {
        if let Some(host) = &self.host {
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
                let subdomain = subdomain(host, &uuid);
                rules.push(create_ingress_rule(
                    subdomain.clone(),
                    service_name(&uuid),
                    template,
                ));
            }
            spec.rules.replace(rules);
            ingress.spec.replace(spec);

            ingress_api
                .replace(INGRESS_NAME, &PostParams::default(), &ingress)
                .await
                .map_err(error_to_string)?;
        }

        Ok(())
    }

    pub async fn deploy(self, user_uuid: &str, template_id: &str) -> Result<String, String> {
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

        // TODO attach template id and content as annotation
        // Deploy a new pod for this image
        let pod_api: Api<Pod> = Api::namespaced(client.clone(), &self.namespace);
        pod_api
            .create(
                &PostParams::default(),
                &create_pod(&user_uuid, &instance_uuid.clone(), instance_template)?,
            )
            .await
            .map_err(error_to_string)?;

        // Deploy the associated service
        let service_api: Api<Service> = Api::namespaced(client.clone(), &self.namespace);
        let service = create_service(&instance_uuid.clone(), instance_template);
        service_api
            .create(&PostParams::default(), &service)
            .await
            .map_err(error_to_string)?;

        let mut instances = BTreeMap::new();
        instances.insert(instance_uuid.clone(), instance_template);
        self.patch_ingress(instances).await?;

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

        if let Some(host) = &self.host {
            let subdomain = subdomain(host, instance_uuid);
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
                .filter(|rule| rule.clone().host.unwrap_or("unknown".to_string()) != subdomain)
                .collect();
            spec.rules.replace(rules);
            ingress.spec.replace(spec);

            ingress_api
                .replace(INGRESS_NAME, &PostParams::default(), &ingress)
                .await
                .map_err(error_to_string)?;
        }

        Ok(())
    }
}
