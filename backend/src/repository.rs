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
use serde_json::{json, Value};
use std::fs;

pub struct Configuration {}

pub fn clone() -> Result<()> {
    Ok(())
}

pub fn read_and_parse_configuration() -> Result<Configuration> {
    read_and_parse_devcontainer().map_err(|_| Error::InvalidState("No configuration file found"))
}

fn read_and_parse_devcontainer() -> Result<Configuration> {
    fs::read_to_string("devcontainer.json")
        .map_err(|err| Error::Failure(err.into()))
        .and_then(|data| parse_devcontainer(&data))
}

// https://github.com/microsoft/vscode-docs/blob/main/docs/remote/devcontainerjson-reference.md
fn parse_devcontainer(data: &str) -> Result<Configuration> {
    let v: Value = serde_json::from_str(data).map_err(|err| Error::Failure(err.into()))?;
    Ok(Configuration {})
}

#[test]
fn parse() {
    let data = json!({
        "name": "John Doe",
        "age": 43,
        "phones": [
            "+44 1234567",
            "+44 2345678"
        ]
    });

    assert_eq!(43, data["age"]);

    //  let v: Value = serde_json::from_str(data);

    // Access parts of the data by indexing with square brackets.
    println!(
        "Please call {} at the number {}",
        data["name"], data["phones"][0]
    );
}
