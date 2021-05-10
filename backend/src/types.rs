use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    time::{Duration, SystemTime},
};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Environment {
    pub secured: bool,
    pub host: String,
    pub namespace: String,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Configuration {
    pub github_client_id: String,
    pub workspace: WorkspaceDefaults,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub user_id: String,
    pub repository_version: RepositoryVersion,
    pub state: WorkspaceState,
    pub max_duration: Duration,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceState {
    Deploying,
    Running { start_time: SystemTime, node: Node },
    Paused,
    Failed { message: String, reason: String },
    Unknown,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Pool {
    pub name: String,
    pub instance_type: Option<String>,
    pub nodes: Vec<Node>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub hostname: String,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceConfiguration {
    pub repository_id: String,
    pub repository_reference: String,
    #[serde(default)]
    pub duration: Option<Duration>,
    pub pool_affinity: Option<String>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct WorkspaceUpdateConfiguration {
    #[serde(default)]
    pub duration: Option<Duration>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDefaults {
    pub duration: Duration,
    pub max_duration: Duration,
    pub pool_affinity: String,
    pub max_workspaces_per_pod: usize,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub admin: bool,
    #[serde(default = "default_as_false")]
    pub can_customize_duration: bool,
    #[serde(default = "default_as_false")]
    pub can_customize_pool_affinity: bool,
    pub pool_affinity: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserConfiguration {
    pub admin: bool,
    #[serde(default = "default_as_false")]
    pub can_customize_duration: bool,
    #[serde(default = "default_as_false")]
    pub can_customize_pool_affinity: bool,
    pub pool_affinity: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserUpdateConfiguration {
    pub admin: bool,
    #[serde(default = "default_as_false")]
    pub can_customize_duration: bool,
    #[serde(default = "default_as_false")]
    pub can_customize_pool_affinity: bool,
    pub pool_affinity: Option<String>,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LoggedUser {
    pub id: String,
    pub admin: bool,
    pub organizations: Vec<String>,
    pub pool_affinity: Option<String>,
    pub can_customize_duration: bool,
    pub can_customize_pool_affinity: bool,
}

impl LoggedUser {
    pub fn is_paritytech_member(&self) -> bool {
        self.organizations.contains(&"paritytech".to_string())
    }
    pub fn can_customize_duration(&self) -> bool {
        self.admin || self.can_customize_duration || self.is_paritytech_member()
    }

    pub fn can_customize_pool_affinity(&self) -> bool {
        self.admin || self.can_customize_pool_affinity || self.is_paritytech_member()
    }

    pub fn has_admin_read_rights(&self) -> bool {
        self.admin || self.is_paritytech_member()
    }

    pub fn has_admin_edit_rights(&self) -> bool {
        self.admin
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Repository {
    #[serde(skip)]
    pub id: Option<String>,
    pub tags: Option<BTreeMap<String, String>>,
    pub url: String,
    pub versions: Vec<RepositoryVersion>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RepositoryConfiguration {
    #[serde(skip)]
    pub id: String,
    pub tags: Option<BTreeMap<String, String>>,
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RepositoryVersion {
    #[serde(skip)]
    pub reference: String,
    pub state: RepositoryVersionState,
    pub runtime: Runtime,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum RepositoryVersionState {
    BUILDING { progress: i32 },
    BUILT,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Runtime {
    pub container_configuration: ContainerConfiguration,
    pub env: Option<Vec<NameValuePair>>,
    pub ports: Option<Vec<Port>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum ContainerConfiguration {
    IMAGE(String),
    DOCKERFILE(String),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NameValuePair {
    pub name: String,
    pub value: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Port {
    pub name: String,
    pub protocol: Option<String>,
    pub path: String,
    pub port: i32,
    pub target: Option<i32>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Command {
    pub name: String,
    pub run: String,
    pub working_directory: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Volume {
    #[serde(skip)]
    pub id: String,
    pub created_at: SystemTime,
    pub lifetime: Option<Duration>,
}

fn default_as_false() -> bool {
    false
}
