//! JSONC related utility functions

use crate::error::{Error, Result};
use crate::utils::jsonc::strip_jsonc_comments;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::{
    fs,
    process::{Command, Output},
};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevContainer {
    pub image: String,
    pub container_env: Option<BTreeMap<String, String>>,
    pub forward_ports: Option<Vec<i32>>,
    pub ports_attributes: Option<BTreeMap<String, BTreeMap<String, String>>>,
    pub on_create_command: Option<String>,
    pub post_create_command: Option<String>,
    pub post_start_command: Option<String>,
}

// https://containers.dev/implementors/json_reference/
// TODO add support for multiple devcontainer files (.devcontainer/FOLDER1/devcontainer.json)
pub fn read_devcontainer(path: &str) -> Result<String> {
    fs::read_to_string(format!("{}/.devcontainer/devcontainer.json", path))
        .map_err(|err| Error::Failure(format!("Failed to read devcontainer in {} : {}", path, err)))
}

pub fn exec(path: &str, command: String) -> Result<Output> {
    Command::new("sh")
        .current_dir(path)
        .arg("-c")
        .args(vec![command.clone()])
        .output()
        .map_err(|err| Error::Failure(format!("Failed to exec {}/{} : {}", path, command, err)))
}

/// Parses a `devcontainer.json` file into a Configuration.
/// See documentation for more information about `devcontainer.json`
/// https://github.com/microsoft/vscode-docs/blob/main/docs/remote/devcontainerjson-reference.md
pub fn parse_devcontainer(data: &str) -> Result<DevContainer> {
    // First strip comments (valid inside devcontainer.json) so not to break JSON parsing
    // See https://code.visualstudio.com/docs/languages/json#_json-with-comments
    let data_sanitized = strip_jsonc_comments(data, true);
    serde_json::from_str(&data_sanitized)
        .map_err(|err| Error::Failure(format!("Failed to parse devcontainer : {}", err)))
}

#[test]
#[should_panic]
fn it_fails_to_parse_devcontainer() {
    parse_devcontainer("").unwrap();
}

#[test]
fn it_parses_devcontainer() -> Result<()> {
    assert_eq!(parse_devcontainer("{}").is_ok(), false);
    assert_eq!(
        parse_devcontainer(
            "{/* Comment */ \"image\": \"image\",  \"onCreateCommand\": \"//\" // test comment \n}"
        )
        .is_ok(),
        true
    );
    assert_eq!(
        parse_devcontainer("{ \"image\": \"image\", \"onCreateCommand\": \"\" }").is_ok(),
        true
    );
    assert_eq!(
        parse_devcontainer("{ \"image\": \"image\", \"onCreateCommand\": \"1\" }")?
            .on_create_command
            .unwrap(),
        "1".to_string()
    );
    assert_eq!(
        parse_devcontainer("{ \"image\": \"image\" }")?.image,
        "image".to_string()
    );
    assert_eq!(
        parse_devcontainer(
            r#"{ "image": "image", "containerEnv": { "MY_VARIABLE": "${localEnv:MY_VARIABLE}" } }"#
        )?
        .container_env
        .unwrap(),
        BTreeMap::from([(
            "MY_VARIABLE".to_string(),
            "${localEnv:MY_VARIABLE}".to_string()
        )])
    );
    assert_eq!(
        parse_devcontainer(r#"{ "image": "image", "forwardPorts": [1000] }"#)?
            .forward_ports
            .unwrap(),
        vec![1000]
    );

    Ok(())
}
