use crate::error::{Error, Result};
use std::env;

pub mod jsonc;

/// Access an environment variable by its name
pub fn var(name: &'static str) -> Result<String> {
    env::var(name).map_err(|_| Error::MissingEnvironmentVariable(name))
}
