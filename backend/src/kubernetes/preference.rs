//! Helper methods for ConfigMap based Preferences
use super::{
    client, delete_config_map_value, get_resource_from_config_map, list_resources_from_config_map,
    store_resource_as_config_map,
};
use crate::{
    error::{Error, ResourceError, Result},
    types::{Preference, PreferenceConfiguration, PreferenceUpdateConfiguration, ResourceType},
};

const CONFIG_MAP: &str = "playground-preferences";

pub async fn get_preference(id: &str) -> Result<Option<Preference>> {
    let client = client()?;
    get_resource_from_config_map(&client, id, CONFIG_MAP).await
}

pub async fn list_preferences() -> Result<Vec<Preference>> {
    let client = client()?;
    list_resources_from_config_map(&client, CONFIG_MAP).await
}

pub async fn create_preference(id: &str, conf: PreferenceConfiguration) -> Result<()> {
    if get_preference(id).await?.is_some() {
        return Err(Error::Resource(ResourceError::IdAlreayUsed(
            ResourceType::Preference,
            id.to_string(),
        )));
    }

    let client = client()?;
    let preference = Preference {
        id: id.to_string(),
        value: conf.value,
    };

    store_resource_as_config_map(&client, &preference.id, &preference, CONFIG_MAP).await
}

pub async fn update_preference(id: &str, conf: PreferenceUpdateConfiguration) -> Result<()> {
    let client = client()?;
    let mut preference: Preference = get_preference(id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(
            ResourceType::Preference,
            id.to_string(),
        ))
    })?;

    if let Some(value) = conf.value {
        preference.value = value;
    }

    store_resource_as_config_map(&client, &preference.id, &preference, CONFIG_MAP).await
}

pub async fn delete_preference(id: &str) -> Result<()> {
    let client = client()?;

    get_preference(id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(
            ResourceType::Preference,
            id.to_string(),
        ))
    })?;

    delete_config_map_value(&client, CONFIG_MAP, id).await
}
