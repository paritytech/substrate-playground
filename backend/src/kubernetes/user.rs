//! Helper methods for ConfigMap based User
use super::{add_config_map_value, client, delete_config_map_value, get_config_map, serialize};
use crate::{
    error::{Error, Result, ResourceType},
    types::{User, UserConfiguration, UserUpdateConfiguration},
};
use kube::Client;
use std::collections::BTreeMap;

const USERS_CONFIG_MAP: &str = "playground-users";

fn yaml_to_user(s: &str) -> Result<User> {
    serde_yaml::from_str(s).map_err(|err| Error::Failure(err.into()))
}

async fn all_users(client: &Client) -> Result<BTreeMap<String, String>> {
    get_config_map(client, USERS_CONFIG_MAP).await
}

async fn user(client: &Client, id: &str) -> Result<Option<User>> {
    let users = all_users(client).await?;
    match users.get(id).map(|user| yaml_to_user(user)) {
        Some(user) => user.map(Some),
        None => Ok(None),
    }
}

async fn store_user(client: &Client, user: User) -> Result<()> {
    add_config_map_value(
        client,
        USERS_CONFIG_MAP,
        &user.id,
        serialize(&user)?.as_str(),
    )
    .await?;

    Ok(())
}

pub async fn get_user(id: &str) -> Result<Option<User>> {
    let client = client().await?;
    user(&client, id).await
}

pub async fn list_users() -> Result<Vec<User>> {
    let client = client().await?;
    Ok(all_users(&client)
        .await?
        .into_iter()
        .flat_map(|(_k, v)| yaml_to_user(&v))
        .collect())
}

pub async fn create_user(id: &str, conf: UserConfiguration) -> Result<()> {
    let client = client().await?;
    let user = User {
        id: id.to_string(),
        admin: conf.admin,
        can_customize_duration: conf.can_customize_duration,
        can_customize_pool_affinity: conf.can_customize_pool_affinity,
        pool_affinity: conf.pool_affinity,
    };

    store_user(&client, user).await
}

pub async fn update_user(id: &str, conf: UserUpdateConfiguration) -> Result<()> {
    let client = client().await?;
    let mut user = user(&client, id).await?.ok_or(Error::UnknownResource(ResourceType::User, id.to_string()))?;
    user.admin = conf.admin;
    user.can_customize_duration = conf.can_customize_duration;
    user.can_customize_pool_affinity = conf.can_customize_pool_affinity;
    user.pool_affinity = conf.pool_affinity;

    store_user(&client, user).await
}

pub async fn delete_user(id: &str) -> Result<()> {
    let client = client().await?;
    delete_config_map_value(&client, USERS_CONFIG_MAP, id).await
}
