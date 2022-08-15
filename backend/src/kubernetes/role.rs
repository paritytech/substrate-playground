//! Helper methods for ConfigMap based Roles
use super::{
    client, delete_config_map_value, get_resource_from_config_map, list_resources_from_config_map,
    store_resource_as_config_map,
};
use crate::{
    error::{Error, ResourceError, Result},
    types::{ResourceType, Role, RoleConfiguration, RoleUpdateConfiguration},
};

const CONFIG_MAP: &str = "playground-roles";

pub async fn get_role(id: &str) -> Result<Option<Role>> {
    let client = client()?;
    get_resource_from_config_map(&client, id, CONFIG_MAP).await
}

pub async fn list_roles() -> Result<Vec<Role>> {
    let client = client()?;
    list_resources_from_config_map(&client, CONFIG_MAP).await
}

pub async fn create_role(id: &str, conf: RoleConfiguration) -> Result<()> {
    if get_role(id).await?.is_some() {
        return Err(Error::Resource(ResourceError::IdAlreayUsed(
            ResourceType::Role,
            id.to_string(),
        )));
    }

    let client = client()?;
    let role = Role {
        id: id.to_string(),
        permissions: conf.permissions,
    };

    store_resource_as_config_map(&client, &role.id, &role, CONFIG_MAP).await
}

pub async fn update_role(id: &str, conf: RoleUpdateConfiguration) -> Result<()> {
    let client = client()?;
    let mut role: Role = get_role(id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(ResourceType::Role, id.to_string()))
    })?;

    if let Some(permissions) = conf.permissions {
        role.permissions = permissions;
    }

    store_resource_as_config_map(&client, &role.id, &role, CONFIG_MAP).await
}

pub async fn delete_role(id: &str) -> Result<()> {
    let client = client()?;

    get_role(id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(ResourceType::Role, id.to_string()))
    })?;

    delete_config_map_value(&client, CONFIG_MAP, id).await
}
