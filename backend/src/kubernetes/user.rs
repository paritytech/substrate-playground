//! User resource
//!
//! Users are represented as k8s Namespaces and all associated metadata stored as annotations or labels.
//!
//!

use super::{
    all_namespaces_api, delete_all_resource, delete_annotation_value, get_all_resource, get_host,
    list_all_resources, serialize_json, unserialize_json, update_annotation_value, user_namespace,
    user_namespaced_api, APP_LABEL, APP_VALUE, COMPONENT_LABEL,
};
use crate::{
    error::{Error, ResourceError, Result},
    types::{ResourceType, Session, User, UserConfiguration, UserUpdateConfiguration},
};
use k8s_openapi::api::{
    core::v1::{Namespace, Service, ServiceAccount},
    networking::v1::{
        HTTPIngressPath, HTTPIngressRuleValue, Ingress, IngressBackend, IngressRule,
        IngressServiceBackend, IngressSpec, ServiceBackendPort,
    },
};
use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;
use kube::{
    api::{Api, PostParams},
    ResourceExt,
};
use std::collections::BTreeMap;

const RESOURCE_ID: &str = "RESOURCE_ID";
const COMPONENT: &str = "user";
const ROLE_ANNOTATION: &str = "ROLE";
const PROFILE_ANNOTATION: &str = "PROFILE";
const PREFERENCES_ANNOTATION: &str = "PREFERENCES";
pub const DEFAULT_SERVICE_ACCOUNT: &str = "default-service-account";
pub const INGRESS_NAME: &str = "ingress";

fn namespace_to_user(namespace: &Namespace) -> Result<User> {
    let annotations = namespace.annotations();
    Ok(User {
        id: namespace
            .labels()
            .get(RESOURCE_ID)
            .ok_or_else(|| Error::Failure(format!("Missing label {}", RESOURCE_ID)))?
            .to_string(),
        role: annotations
            .get(ROLE_ANNOTATION)
            .ok_or_else(|| Error::Failure(format!("Missing annotation {}", ROLE_ANNOTATION)))?
            .to_string(),
        profile: annotations.get(PROFILE_ANNOTATION).cloned(),
        preferences: unserialize_json(annotations.get(PREFERENCES_ANNOTATION).ok_or_else(
            || Error::Failure(format!("Missing annotation {}", PREFERENCES_ANNOTATION)),
        )?)?,
    })
}

fn user_to_namespace(user: &User) -> Result<Namespace> {
    let labels = BTreeMap::from([
        (APP_LABEL.to_string(), APP_VALUE.to_string()),
        (COMPONENT_LABEL.to_string(), COMPONENT.to_string()),
        (RESOURCE_ID.to_string(), user.id.clone()),
    ]);
    let mut annotations = BTreeMap::from([
        (
            PREFERENCES_ANNOTATION.to_string(),
            serialize_json(&user.preferences)?,
        ),
        (ROLE_ANNOTATION.to_string(), user.role.clone()),
    ]);
    if let Some(profile) = user.profile.clone() {
        annotations.insert(PROFILE_ANNOTATION.to_string(), profile);
    }
    Ok(Namespace {
        metadata: ObjectMeta {
            name: Some(user_namespace(&user.id)),
            labels: Some(labels),
            annotations: Some(annotations),
            ..Default::default()
        },
        ..Default::default()
    })
}

pub async fn get_user(id: &str) -> Result<Option<User>> {
    get_all_resource::<Namespace, User>(&user_namespace(id), namespace_to_user).await
}

pub async fn list_users() -> Result<Vec<User>> {
    list_all_resources(COMPONENT, namespace_to_user).await
}

pub async fn create_user(id: &str, conf: UserConfiguration) -> Result<()> {
    if get_user(id).await?.is_some() {
        return Err(Error::Resource(ResourceError::IdAlreayUsed(
            ResourceType::User,
            id.to_string(),
        )));
    }

    let user = User {
        id: id.to_string(), // Store
        role: conf.role,
        profile: conf.profile,
        preferences: conf.preferences,
    };

    let namespace_api: Api<Namespace> = all_namespaces_api()?;
    namespace_api
        .create(&PostParams::default(), &user_to_namespace(&user)?)
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    // Create the ServiceAccount that will be used for all user's Sessions
    let service_account_api: Api<ServiceAccount> = user_namespaced_api(id)?;
    service_account_api
        .create(
            &PostParams::default(),
            &ServiceAccount {
                metadata: ObjectMeta {
                    name: Some(DEFAULT_SERVICE_ACCOUNT.to_string()),
                    ..Default::default()
                },
                ..Default::default()
            },
        )
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    // Create the ServiceAccount that will be used for all user's Sessions
    let ingress_api: Api<Ingress> = user_namespaced_api(id)?;
    ingress_api
        .create(
            &PostParams::default(),
            &Ingress {
                metadata: ObjectMeta {
                    name: Some(INGRESS_NAME.to_string()),
                    ..Default::default()
                },
                spec: Some(IngressSpec {
                    ingress_class_name: Some("nginx".to_string()),
                    rules: Some(vec![IngressRule {
                        host: Some(format!("{}.{}", user.id, get_host().await?)),
                        http: Some(HTTPIngressRuleValue { paths: vec![] }),
                    }]),
                    ..Default::default()
                }),
                ..Default::default()
            },
        )
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    Ok(())
}

pub async fn add_user_session(user_id: &str, id: &str, service: Service) -> Result<()> {
    let ingress_api: Api<Ingress> = user_namespaced_api(user_id)?;
    let mut ingress: Ingress = ingress_api
        .get(INGRESS_NAME)
        .await
        .map_err(Error::K8sCommunicationFailure)?
        .clone();
    let mut spec = ingress
        .clone()
        .spec
        .ok_or_else(|| Error::MissingConstraint("ingress".to_string(), "spec".to_string()))?;
    let rules: Vec<IngressRule> = spec.rules.unwrap_or_default();
    if let Some(rule) = rules.first() {
        if let Some(mut http) = rule.http.clone() {
            // TODO use service.clone().spec.unwrap_or_default().ports;
            http.paths.push(HTTPIngressPath {
                backend: IngressBackend {
                    service: Some(IngressServiceBackend {
                        name: service.name_any(),
                        port: Some(ServiceBackendPort {
                            number: Some(3000),
                            ..Default::default()
                        }),
                    }),
                    ..Default::default()
                },
                path: Some(format!("/{}", id)),
                path_type: "Exact".to_string(),
            });
        }
    }
    spec.rules = Some(rules);
    ingress.spec.replace(spec);

    ingress_api
        .replace(INGRESS_NAME, &PostParams::default(), &ingress)
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    Ok(())
}

pub async fn remove_user_session(_session: Session) -> Result<()> {
    // TODO

    Ok(())
}

pub async fn update_user(id: &str, conf: UserUpdateConfiguration) -> Result<()> {
    let user = get_user(id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(ResourceType::User, id.to_string()))
    })?;

    let namespace_api: Api<Namespace> = all_namespaces_api()?;
    if let Some(role) = conf.role {
        if user.role != role {
            update_annotation_value(&namespace_api, &user.id, ROLE_ANNOTATION, role.into()).await?;
        }
    }

    if conf.profile != user.profile {
        if conf.profile.is_some() {
            update_annotation_value(
                &namespace_api,
                &user.id,
                PROFILE_ANNOTATION,
                conf.profile.into(),
            )
            .await?;
        } else {
            delete_annotation_value(&namespace_api, &user.id, PROFILE_ANNOTATION).await?;
        }
    }

    if let Some(preferences) = conf.preferences {
        if preferences != user.preferences {
            update_annotation_value(
                &namespace_api,
                &user.id,
                PREFERENCES_ANNOTATION,
                serialize_json(&preferences)?.into(),
            )
            .await?;
        }
    }

    Ok(())
}

pub async fn delete_user(id: &str) -> Result<()> {
    get_user(id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(ResourceType::User, id.to_string()))
    })?;

    delete_all_resource::<Namespace>(&user_namespace(id)).await
}
