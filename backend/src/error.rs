///! Error type for the whole project
///
use std::result;
use thiserror::Error;

/// A specialized [`Result`] type.
pub type Result<T> = result::Result<T, Error>;

#[derive(Debug)]
pub enum Parameter {
    WorkflowDuration,
    WorkflowPoolAffinity,
}

#[derive(Debug)]
pub enum Permission {
    ResourceNotOwned,
    AdminRead,
    AdminEdit,
    Customize { what: Parameter },
}

// During startup
// - EnvVar

// At Runtime
// Missing data?

#[derive(Error, Debug)]
pub enum Error {
    #[error("Unauthorized")]
    Unauthorized(Permission),
    #[error("UnknownResource")]
    UnknownResource,
    #[error("UnknownRepositoryVersion")]
    UnknownRepositoryVersion,
    #[error("UnknownPool {0}")]
    UnknownPool(String),
    #[error("WorkspaceIdAlreayUsed")]
    WorkspaceIdAlreayUsed,
    #[error("RepositoryVersionNotReady")]
    RepositoryVersionNotReady,
    #[error("ConcurrentWorkspacesLimitBreached")]
    ConcurrentWorkspacesLimitBreached(usize),
    #[error("DurationLimitBreached")]
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
    Failure(#[from] Box<dyn std::error::Error>),
}
