//! Helper methods for ConfigMap based Profiles
use super::{
    client, delete_config_map_value, get_resource_from_config_map, list_resources_from_config_map,
    store_resource_as_config_map,
};
use crate::{
    error::{Error, ResourceError, Result},
    types::{Profile, ProfileConfiguration, ProfileUpdateConfiguration, ResourceType},
};

const CONFIG_MAP: &str = "playground-profiles";

pub async fn get_profile(id: &str) -> Result<Option<Profile>> {
    let client = client()?;
    get_resource_from_config_map(&client, id, CONFIG_MAP).await
}

pub async fn list_profiles() -> Result<Vec<Profile>> {
    let client = client()?;
    list_resources_from_config_map(&client, CONFIG_MAP).await
}

pub async fn create_profile(id: &str, conf: ProfileConfiguration) -> Result<()> {
    if get_profile(id).await?.is_some() {
        return Err(Error::Resource(ResourceError::IdAlreayUsed(
            ResourceType::Profile,
            id.to_string(),
        )));
    }

    let client = client()?;
    let profile = Profile {
        id: id.to_string(),
        preferences: conf.preferences,
    };

    store_resource_as_config_map(&client, &profile.id, &profile, CONFIG_MAP).await
}

pub async fn update_profile(id: &str, conf: ProfileUpdateConfiguration) -> Result<()> {
    let client = client()?;
    let mut profile: Profile = get_profile(id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(
            ResourceType::Profile,
            id.to_string(),
        ))
    })?;

    if let Some(preferences) = conf.preferences {
        profile.preferences = preferences;
    }

    store_resource_as_config_map(&client, &profile.id, &profile, CONFIG_MAP).await
}

pub async fn delete_profile(id: &str) -> Result<()> {
    let client = client()?;

    get_profile(id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(
            ResourceType::Profile,
            id.to_string(),
        ))
    })?;

    delete_config_map_value(&client, CONFIG_MAP, id).await
}
