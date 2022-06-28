//! JSONC related utility functions

use crate::error::{Error, Result};
use crate::utils::jsonc::strip_jsonc_comments;
use serde::Deserialize;
use std::collections::HashMap;
use std::{
    fs,
    process::{Command, Output},
};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevContainer {
    pub image: Option<String>,
    pub container_env: Option<HashMap<String, String>>,
    pub forward_ports: Option<Vec<i32>>,
    pub ports_attributes: Option<HashMap<String, String>>,
    pub on_create_command: Option<Vec<String>>,
    pub post_create_command: Option<Vec<String>>,
    pub post_start_command: Option<Vec<String>>,
}

// TODO add support for multiple devcontainer files (.devcontainer/FOLDER1/devcontainer.json)
pub fn read_and_parse_devcontainer(path: String) -> Result<DevContainer> {
    fs::read_to_string(format!("{}/.devcontainer/devcontainer.json", path))
        .map_err(|err| Error::Failure(err.to_string()))
        .and_then(|data| parse_devcontainer(&data))
}

pub fn exec(path: String, command: Vec<String>) -> Vec<Result<Output>> {
    if command.len() == 1 {
        vec![Command::new("sh")
            .current_dir(path)
            .arg("-c")
            .args(command[0].split_whitespace().collect::<Vec<_>>())
            .output()
            .map_err(|err| Error::Failure(err.to_string()))]
    } else {
        command
            .iter()
            .map(|command| {
                let mut members = command.split_whitespace().collect::<Vec<_>>();
                let program = members.remove(0);
                Command::new(program)
                    .current_dir(path.clone())
                    .args(members)
                    .output()
                    .map_err(|err| Error::Failure(err.to_string()))
            })
            .collect()
    }
}

/// Parses a `devcontainer.json` file into a Configuration.
/// See documentation for more information about `devcontainer.json`
/// https://github.com/microsoft/vscode-docs/blob/main/docs/remote/devcontainerjson-reference.md
pub fn parse_devcontainer(data: &str) -> Result<DevContainer> {
    // First strip comments (valid inside devcontainer.json) so not to break JSON parsing
    // See https://code.visualstudio.com/docs/languages/json#_json-with-comments
    let data_sanitized = strip_jsonc_comments(data, true);
    serde_json::from_str(&data_sanitized).map_err(|err| Error::Failure(err.to_string()))
}

#[test]
#[should_panic]
fn it_fails_to_parse_devcontainer() {
    parse_devcontainer("").unwrap();
}

#[test]
fn it_parses_devcontainer() -> Result<()> {
    parse_devcontainer("{}")?;
    assert_eq!(parse_devcontainer("{}").is_ok(), true);
    /*assert_eq!(
        parse_devcontainer(r#"{ "onCreateCommand": "" }"#)?.on_create_command,
        Some(vec!["".to_string()])
    );*/
    assert_eq!(
        parse_devcontainer("{/* Comment */ // test comment\n }").is_ok(),
        true
    );
    assert_eq!(
        parse_devcontainer("{/* Comment */ \"onCreateCommand\": [\"//\"] // test comment \n}")
            .is_ok(),
        true
    );
    assert_eq!(
        parse_devcontainer("{ \"onCreateCommand\": [\"\"] }").is_ok(),
        true
    );
    assert_eq!(
        parse_devcontainer("{ \"onCreateCommand\": [\"\", 5] }").is_ok(),
        false
    );
    assert_eq!(
        parse_devcontainer("{ \"onCreateCommand\": [\"1\"] }")?
            .on_create_command
            .unwrap()[0],
        "1".to_string()
    );
    assert_eq!(
        parse_devcontainer("{ \"image\": \"image\" }")?
            .image
            .unwrap(),
        "image".to_string()
    );
    assert_eq!(
        parse_devcontainer(r#"{ "containerEnv": { "MY_VARIABLE": "${localEnv:MY_VARIABLE}" } }"#)?
            .container_env
            .unwrap(),
        HashMap::from([(
            "MY_VARIABLE".to_string(),
            "${localEnv:MY_VARIABLE}".to_string()
        )])
    );
    assert_eq!(
        parse_devcontainer(r#"{ "forwardPorts": [1000] }"#)?
            .forward_ports
            .unwrap(),
        vec![1000]
    );

    Ok(())
}
