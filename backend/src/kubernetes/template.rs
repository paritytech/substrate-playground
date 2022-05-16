//! Helper methods ton interact with k8s
use super::{client, get_config_map};
use crate::{error::Result, types::Template};
use log::error;

const TEMPLATES_CONFIG_MAP: &str = "playground-templates";

pub async fn list_templates() -> Result<Vec<Template>> {
    let client = client()?;

    Ok(get_config_map(&client, TEMPLATES_CONFIG_MAP)
        .await?
        .into_iter()
        .filter_map(|(k, v)| {
            if let Ok(template) = serde_yaml::from_str(&v) {
                Some(template)
            } else {
                error!("Error while parsing template {}", k);
                None
            }
        })
        .collect::<Vec<Template>>())
}
