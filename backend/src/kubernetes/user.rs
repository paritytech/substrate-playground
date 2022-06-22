//! Helper methods for ConfigMap based User
use super::{
    client, delete_config_map_value, get_resource_from_config_map, list_resources_from_config_map,
    store_resource_as_config_map,
};
use crate::{
    error::{Error, Result},
    types::{ResourceType, User, UserConfiguration, UserUpdateConfiguration},
};

const CONFIG_MAP: &str = "playground-users";

pub async fn get_user(id: &str) -> Result<Option<User>> {
    let client = client()?;
    get_resource_from_config_map(&client, id, CONFIG_MAP).await
}

pub async fn list_users() -> Result<Vec<User>> {
    let client = client()?;
    list_resources_from_config_map(&client, CONFIG_MAP).await
}

pub async fn create_user(id: &str, conf: UserConfiguration) -> Result<()> {
    let client = client()?;
    let user = User {
        id: id.to_string(),
        role: conf.role,
        preferences: conf.preferences,
    };

    store_resource_as_config_map(&client, &user.id, &user, CONFIG_MAP).await

    // TODO create namespace, serviceAccount
}

pub async fn update_user(id: &str, conf: UserUpdateConfiguration) -> Result<()> {
    let client = client()?;
    let mut user: User = get_resource_from_config_map(&client, id, CONFIG_MAP)
        .await?
        .ok_or_else(|| Error::UnknownResource(ResourceType::User, id.to_string()))?;
    user.role = conf.role;
    user.preferences = conf.preferences;

    store_resource_as_config_map(&client, &user.id, &user, CONFIG_MAP).await
}

pub async fn delete_user(id: &str) -> Result<()> {
    let client = client()?;
    delete_config_map_value(&client, CONFIG_MAP, id).await
}
