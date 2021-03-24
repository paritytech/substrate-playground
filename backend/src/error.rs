///! Error type for the whole project
///
use std::result;
use thiserror::Error;

/// A specialized [`Result`] type.
pub type Result<T> = result::Result<T, Error>;

#[derive(Error, Debug)]
pub enum Error {
    #[error("data store disconnected")]
    Unauthorized(/*Permission*/),
    #[error("data store disconnected")]
    MissingData(&'static str),
    #[error("data store disconnected")]
    Failure(#[from] Box<dyn std::error::Error>),
}
