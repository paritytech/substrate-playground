///! Error type for the whole project
///
use std::result;
use thiserror::Error;

use crate::types::{ResourcePermission, ResourceType};

/// A specialized [`Result`] type.
pub type Result<T> = result::Result<T, Error>;

#[derive(Error, Debug)]
pub enum Error {
    #[error("Unauthorized access to resource {0}: {1}")]
    Unauthorized(ResourceType, ResourcePermission),
    #[error("ResourceNotOwned {0} {1}")]
    ResourceNotOwned(ResourceType, String),
    #[error("UnknownResource {0} {1}")]
    UnknownResource(ResourceType, String),
    #[error("SessionIdAlreayUsed")]
    SessionIdAlreayUsed,
    #[error("RepositoryVersionNotReady")]
    RepositoryVersionNotReady,
    #[error("ConcurrentSessionsLimitBreached: {0}")]
    ConcurrentSessionsLimitBreached(usize),
    #[error("DurationLimitBreached {0}")]
    DurationLimitBreached(u128),
    #[error("Missing data {0}")]
    MissingData(&'static str),
    #[error("Missing annotation {0}")]
    MissingAnnotation(&'static str),
    #[error("Missing env var {0}")]
    MissingEnvironmentVariable(&'static str),
    #[error("IncorrectDevContainer {0}")]
    IncorrectDevContainerValue(&'static str),
    #[error("Failure: {0}")]
    Failure(String),
    #[error("K8sCommunicationFailure: {0}")]
    K8sCommunicationFailure(#[from] kube::Error),
}
