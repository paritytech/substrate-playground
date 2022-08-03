//! User resource
//!
//! Users are represented as k8s Namespaces and all associated metadata stored as annotations or labels.
//!
//!

use super::{
    client, delete_resource, get_resource, list_all_resources, serialize_json, unserialize_json,
    update_annotation_value, user_namespace, APP_LABEL, APP_VALUE, COMPONENT_LABEL,
};
use crate::{
    error::{Error, ResourceError, Result},
    types::{ResourceType, User, UserConfiguration, UserUpdateConfiguration},
};
use k8s_openapi::api::core::v1::{Namespace, ServiceAccount};
use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;
use kube::{
    api::{Api, PostParams},
    ResourceExt,
};
use std::collections::BTreeMap;

const RESOURCE_ID: &str = "RESOURCE_ID";
const COMPONENT: &str = "user";
const ROLE_ANNOTATION: &str = "ROLE";
const PREFERENCES_ANNOTATION: &str = "PREFERENCES";
pub const DEFAULT_SERVICE_ACCOUNT: &str = "default-service-account";

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
    let annotations = BTreeMap::from([
        (
            PREFERENCES_ANNOTATION.to_string(),
            serialize_json(&user.preferences)?,
        ),
        (ROLE_ANNOTATION.to_string(), user.role.clone()),
    ]);
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
    let client = client()?;
    let api: Api<Namespace> = Api::all(client.clone());
    get_resource(api, &user_namespace(id), namespace_to_user).await
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

    let client = client()?;

    let user = User {
        id: id.to_string(), // Store
        role: conf.role,
        preferences: conf.preferences,
    };

    let namespace_api: Api<Namespace> = Api::all(client.clone());
    namespace_api
        .create(&PostParams::default(), &user_to_namespace(&user)?)
        .await
        .map_err(Error::K8sCommunicationFailure)?;

    let service_account_api: Api<ServiceAccount> =
        Api::namespaced(client.clone(), &user_namespace(id));
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

    Ok(())
}

pub async fn update_user(id: &str, conf: UserUpdateConfiguration) -> Result<()> {
    let client = client()?;

    let user = get_user(id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(ResourceType::User, id.to_string()))
    })?;

    let namespace_api: Api<Namespace> = Api::namespaced(client.clone(), &user_namespace(id));
    if conf.role != user.role {
        update_annotation_value(&namespace_api, &user.id, ROLE_ANNOTATION, conf.role.into())
            .await?;
    }
    if conf.preferences != user.preferences {
        update_annotation_value(
            &namespace_api,
            &user.id,
            PREFERENCES_ANNOTATION,
            serialize_json(&conf.preferences)?.into(),
        )
        .await?;
    }

    Ok(())
}

pub async fn delete_user(id: &str) -> Result<()> {
    get_user(id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(ResourceType::User, id.to_string()))
    })?;

    let client = client()?;
    let api: Api<Namespace> = Api::all(client.clone());
    delete_resource(api, &user_namespace(id)).await
}
