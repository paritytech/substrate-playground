//! Helper methods for ConfigMap based repositories.
//!
use crate::{
    error::{Error, ResourceError, Result},
    types::{Repository, RepositoryConfiguration, RepositoryUpdateConfiguration, ResourceType},
};

use super::{
    client, delete_config_map_value, get_resource_from_config_map, list_resources_from_config_map,
    store_resource_as_config_map,
};

const CONFIG_MAP: &str = "playground-repositories";

pub async fn get_repository(id: &str) -> Result<Option<Repository>> {
    let client = client()?;
    get_resource_from_config_map(&client, id, CONFIG_MAP).await
}

pub async fn list_repositories() -> Result<Vec<Repository>> {
    let client = client()?;
    list_resources_from_config_map(&client, CONFIG_MAP).await
}

pub async fn create_repository(id: &str, conf: RepositoryConfiguration) -> Result<()> {
    if get_repository(id).await?.is_some() {
        return Err(Error::Resource(ResourceError::Unknown(
            ResourceType::Repository,
            id.to_string(),
        )));
    }

    let client = client()?;

    let repository = Repository {
        id: id.to_string(),
        url: conf.url,
        current_version: None,
    };

    store_resource_as_config_map(&client, &repository.id, &repository, CONFIG_MAP).await
}

pub async fn update_repository(id: &str, conf: RepositoryUpdateConfiguration) -> Result<()> {
    let client = client()?;

    let mut repository: Repository = get_resource_from_config_map(&client, id, CONFIG_MAP)
        .await?
        .ok_or_else(|| {
            Error::Resource(ResourceError::Unknown(
                ResourceType::Repository,
                id.to_string(),
            ))
        })?;
    repository.current_version = conf.current_version;

    store_resource_as_config_map(&client, &repository.id, &repository, CONFIG_MAP).await
}

pub async fn delete_repository(id: &str) -> Result<()> {
    let client = client()?;

    get_repository(id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(
            ResourceType::Repository,
            id.to_string(),
        ))
    })?;

    delete_config_map_value(&client, CONFIG_MAP, id).await
}
