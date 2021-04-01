///! Error type for the whole project
///
use std::result;
use thiserror::Error;

/// A specialized [`Result`] type.
pub type Result<T> = result::Result<T, Error>;

#[derive(Error, Debug)]
pub enum Error {
    #[error("Unauthorized")]
    Unauthorized(/*Permission*/),
    #[error("Missing data {0}")]
    MissingData(&'static str),
    #[error("Failure: {0}")]
    Failure(#[from] Box<dyn std::error::Error>),
}
