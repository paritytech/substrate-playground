// https://github.com/rust-lang/git2-rs

// start a job
//  https://kubernetes.io/docs/concepts/workloads/controllers/job/
// checkout
// read devcontainer.json, gitpod
//  https://code.visualstudio.com/docs/remote/devcontainerjson-reference
//  https://www.gitpod.io/docs/checkout-location
//  https://github.com/paritytech/ink-playgroung-flipper
// build rust
// update volume metadata

use crate::error::{Error, Result};
use crate::utils::jsonc::strip_jsonc_comments;
use git2::build::{CheckoutBuilder, RepoBuilder};
use git2::{FetchOptions, RemoteCallbacks};
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::process::{Command, Output};

#[derive(Debug)]
pub struct Configuration {
    pub on_create_command: Option<Vec<String>>,
    pub post_create_command: Option<Vec<String>>,
    pub post_start_command: Option<Vec<String>>,
}

pub fn clone(path: String, url: String) -> Result<()> {
    // https://stackoverflow.com/questions/55141013/how-to-get-the-behaviour-of-git-checkout-in-rust-git2
    let mut cb = RemoteCallbacks::new();
    cb.transfer_progress(|stats| true);

    let mut co = CheckoutBuilder::new();
    co.progress(|path, cur, total| {});

    let mut fo = FetchOptions::new();
    fo.remote_callbacks(cb);
    RepoBuilder::new()
        .fetch_options(fo)
        .with_checkout(co)
        .clone(&url, Path::new(&path))
        .map_err(|err| Error::Failure(err.into()))?;
    Ok(())
}

pub fn read_and_parse_devcontainer(path: String) -> Result<Configuration> {
    fs::read_to_string(format!("{}/.devcontainer/devcontainer.json", path))
        .map_err(|err| Error::Failure(err.into()))
        .and_then(|data| parse_devcontainer(&data))
}

fn value_to_vec(v: &Value) -> Result<Option<Vec<String>>> {
    return if let Some(arr) = v.as_array() {
        if arr.iter().all(|e| e.is_string()) {
            Ok(Some(
                arr.iter()
                    .filter_map(|e| e.as_str().map(|s| s.to_string()))
                    .collect(),
            ))
        } else {
            Err(Error::IncorrectDevContainerValue(
                "All values of an array must be strings",
            ))
        }
    } else if let Some(s) = v.as_str() {
        Ok(Some(vec![s.to_string()]))
    } else {
        Err(Error::IncorrectDevContainerValue(
            "Value is neither an array nor a string",
        ))
    };
}

pub fn exec(path: String, command: Vec<String>) -> Vec<Result<Output>> {
    if command.len() == 1 {
        vec![Command::new("sh")
            .current_dir(path)
            .arg("-c")
            .args(command[0].split_whitespace().collect::<Vec<_>>())
            .output()
            .map_err(|err| Error::Failure(err.into()))]
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
                    .map_err(|err| Error::Failure(err.into()))
            })
            .collect()
    }
}

/// Parses a `Value` into a `Vec<String>`. `Value` must be a `String` or an array of `String`s.
fn parse_value(v: &Value, name: &str) -> Result<Option<Vec<String>>> {
    v.get(name).map_or_else(|| Ok(None), value_to_vec)
}

/// Parses a `devcontainer.json` file into a Configuration.
/// See documentation for more information about `devcontainer.json`
/// https://github.com/microsoft/vscode-docs/blob/main/docs/remote/devcontainerjson-reference.md
fn parse_devcontainer(data: &str) -> Result<Configuration> {
    // First strip comments (valid inside devcontainer.json) so not to break JSON parsing
    // See https://code.visualstudio.com/docs/languages/json#_json-with-comments
    let data_sanitized = strip_jsonc_comments(data, true);
    let v: Value =
        serde_json::from_str(&data_sanitized).map_err(|err| Error::Failure(err.into()))?;
    Ok(Configuration {
        on_create_command: parse_value(&v, "onCreateCommand")?,
        post_create_command: parse_value(&v, "postCreateCommand")?,
        post_start_command: parse_value(&v, "postStartCommand")?,
    })
}

#[test]
#[should_panic]
fn it_fails_to_parse_devcontainer() {
    parse_devcontainer("").unwrap();
}

#[test]
fn it_parses_devcontainer() -> Result<()> {
    assert_eq!(parse_devcontainer("{}").is_ok(), true);
    assert_eq!(
        parse_devcontainer(r#"{ "onCreateCommand": "" }"#).is_ok(),
        true
    );
    assert_eq!(
        parse_devcontainer("{/* Comment */ // test comment\n }").is_ok(),
        true
    );
    assert_eq!(
        parse_devcontainer("{/* Comment */ \"onCreateCommand\": \"//\" // test comment \n}")
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

    Ok(())
}
