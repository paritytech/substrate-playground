//! Helper methods for ConfigMap based Editors
use super::{
    client, delete_config_map_value, get_resource_from_config_map, list_resources_from_config_map,
    store_resource_as_config_map,
};
use crate::{
    error::{Error, ResourceError, Result},
    types::{Editor, EditorConfiguration, EditorUpdateConfiguration, ResourceType},
};

const CONFIG_MAP: &str = "playground-editors";

pub async fn get_editor(id: &str) -> Result<Option<Editor>> {
    let client = client()?;
    get_resource_from_config_map(&client, id, CONFIG_MAP).await
}

pub async fn list_editors() -> Result<Vec<Editor>> {
    let client = client()?;
    list_resources_from_config_map(&client, CONFIG_MAP).await
}

pub async fn create_editor(id: &str, conf: EditorConfiguration) -> Result<()> {
    if get_editor(id).await?.is_some() {
        return Err(Error::Resource(ResourceError::IdAlreayUsed(
            ResourceType::Editor,
            id.to_string(),
        )));
    }

    let client = client()?;
    let editor = Editor {
        id: id.to_string(),
        image: conf.image,
        env: conf.env,
    };

    store_resource_as_config_map(&client, &editor.id, &editor, CONFIG_MAP).await
}

pub async fn update_editor(id: &str, conf: EditorUpdateConfiguration) -> Result<()> {
    let client = client()?;
    let mut editor = get_editor(id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(ResourceType::Editor, id.to_string()))
    })?;

    if let Some(value) = conf.image {
        editor.image = value;
    }
    if let Some(value) = conf.env {
        editor.env = value;
    }

    store_resource_as_config_map(&client, &editor.id, &editor, CONFIG_MAP).await
}

pub async fn delete_editor(id: &str) -> Result<()> {
    let client = client()?;

    get_editor(id).await?.ok_or_else(|| {
        Error::Resource(ResourceError::Unknown(ResourceType::Editor, id.to_string()))
    })?;

    delete_config_map_value(&client, CONFIG_MAP, id).await
}
