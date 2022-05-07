///! Error type for the whole project
///
use std::{result, fmt};
use thiserror::Error;

/// A specialized [`Result`] type.
pub type Result<T> = result::Result<T, Error>;

#[derive(Debug)]
pub enum Parameter {
    SessionDuration,
    SessionPoolAffinity,
}

impl fmt::Display for Parameter {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
       match *self {
        Parameter::SessionDuration => write!(f, "SessionDuration"),
        Parameter::SessionPoolAffinity => write!(f, "SessionPoolAffinity"),
       }
    }
}

#[derive(Debug)]
pub enum Permission {
    ResourceNotOwned,
    InvalidSessionId,
    AdminRead,
    AdminEdit,
    Customize { what: Parameter },
}

impl fmt::Display for Permission {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
       match &*self {
        Permission::ResourceNotOwned => write!(f, "ResourceNotOwned"),
        Permission::InvalidSessionId => write!(f, "InvalidSessionId"),
        Permission::AdminRead => write!(f, "AdminRead"),
        Permission::AdminEdit => write!(f, "AdminEdit"),
        Permission::Customize{what} => write!(f, "Customize: {}", what),
       }
    }
}

#[derive(Debug)]
pub enum ResourceType {
    Pool,
    Repository,
    RepositoryVersion,
    Session,
    Template,
    User,
    Workspace,
}

impl fmt::Display for ResourceType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
       match &*self {
        ResourceType::Pool => write!(f, "Pool"),
        ResourceType::Repository => write!(f, "Repository"),
        ResourceType::RepositoryVersion => write!(f, "RepositoryVersion"),
        ResourceType::Session => write!(f, "Session"),
        ResourceType::Template => write!(f, "Template"),
        ResourceType::User => write!(f, "User"),
        ResourceType::Workspace => write!(f, "Workspace"),
       }
    }
}

// During startup
// - EnvVar

// At Runtime
// Missing data?

#[derive(Error, Debug)]
pub enum Error {
    #[error("Unauthorized {0}")]
    Unauthorized(Permission),
    #[error("UnknownResource {0} {1}")]
    UnknownResource(ResourceType, String),
    #[error("SessionIdAlreayUsed")]
    SessionIdAlreayUsed,
    #[error("RepositoryVersionNotReady")]
    RepositoryVersionNotReady,
    #[error("ConcurrentSessionsLimitBreached  {0}")]
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
    Failure(#[from] Box<dyn std::error::Error>),
}
