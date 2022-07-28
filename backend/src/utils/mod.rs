use crate::error::{Error, Result};
use std::env;

pub mod devcontainer;
pub mod git;
pub mod github;
pub mod http;
pub mod jsonc;

/// Access an environment variable by its name
pub fn var(name: &'static str) -> Result<String> {
    env::var(name).map_err(|_| Error::MissingConstraint("EnvironmentVariable".to_string(), name.to_string()))
}
