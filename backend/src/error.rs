///! Error type for the whole project
///
use std::{collections::BTreeMap, result};
use serde::Serialize;
use thiserror::Error;

use crate::types::{ResourcePermission, ResourceType};

/// A specialized [`Result`] type.
pub type Result<T> = result::Result<T, Error>;

#[derive(Error, Debug)]
pub enum Error {
    #[error("Missing {0}: {1}")]
    MissingConstraint(String, String),
    #[error("Failure: {0}")]
    Failure(String),

    #[error("ResourceError: {0}")]
    Resource(#[from] ResourceError),

    #[error("K8sCommunicationFailure: {0}")]
    K8sCommunicationFailure(#[from] kube::Error),
}

#[derive(Serialize, Error, Debug)]
pub enum ResourceError {
    #[error("Unauthorized access to resource {0}: {1}")]
    UnauthorizedAccess(ResourceType, ResourcePermission),
    #[error("NotOwned {0} {1}")]
    NotOwned(ResourceType, String),
    #[error("UnknownResource {0} {1}")]
    Unknown(ResourceType, String),
    #[error("SessionIdAlreayUsed {0} {1}")]
    IdAlreayUsed(ResourceType, String),

    #[error("Misconfiguration: {0} {1}")]
    Misconfiguration(ResourceType, String, BTreeMap<String, String>),
}
