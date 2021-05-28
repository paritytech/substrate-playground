use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    time::{Duration, SystemTime},
};

#[derive(Serialize, Clone, Debug)]
pub struct Playground {
    pub env: Environment,
    pub configuration: Configuration,
    pub user: Option<LoggedUser>,
}

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

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDefaults {
    #[serde(with = "duration")]
    pub duration: Duration,
    #[serde(with = "duration")]
    pub max_duration: Duration,
    pub pool_affinity: String,
    pub max_workspaces_per_pod: usize,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub user_id: String,
    pub repository_details: RepositoryDetails,
    pub state: WorkspaceState,
    #[serde(with = "duration")]
    pub max_duration: Duration,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryDetails {
    pub id: String,
    pub reference: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum WorkspaceState {
    Deploying,
    Running {
        #[serde(with = "system_time")]
        start_time: SystemTime,
        node: Node,
        runtime: RepositoryRuntimeConfiguration,
    },
    Paused,
    Failed {
        message: String,
        reason: String,
    },
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceConfiguration {
    pub repository_details: RepositoryDetails,
    #[serde(default, with = "option_duration")]
    pub duration: Option<Duration>,
    pub pool_affinity: Option<String>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct WorkspaceUpdateConfiguration {
    #[serde(default, with = "option_duration")]
    pub duration: Option<Duration>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
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
    pub id: String,
    pub tags: Option<BTreeMap<String, String>>,
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RepositoryConfiguration {
    pub tags: Option<BTreeMap<String, String>>,
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RepositoryUpdateConfiguration {
    pub tags: Option<BTreeMap<String, String>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryVersion {
    pub reference: String,
    pub image_source: Option<PrebuildSource>,
    pub state: RepositoryVersionState,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum PrebuildSource {
    DockerFile { location: String },
    Image { value: String },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RepositoryVersionConfiguration {
    pub reference: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum RepositoryVersionState {
    Cloning {
        progress: i32,
    },
    Building {
        runtime: RepositoryRuntimeConfiguration,
        progress: i32,
    },
    Ready {
        runtime: RepositoryRuntimeConfiguration,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryRuntimeConfiguration {
    pub env: Option<Vec<NameValuePair>>,
    pub ports: Option<Vec<Port>>,
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

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Pool {
    pub id: String,
    pub instance_type: Option<String>,
    pub nodes: Vec<Node>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub hostname: String,
}

/// Utils

mod system_time {
    use serde::{self, Serializer};
    use std::time::SystemTime;

    pub fn serialize<S>(date: &SystemTime, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match date.elapsed().ok() {
            Some(value) => serializer.serialize_some(&value.as_secs()),
            None => serializer.serialize_none(),
        }
    }
}

mod option_duration {
    use serde::{self, Deserialize, Deserializer};
    use std::time::Duration;

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<Duration>, D::Error>
    where
        D: Deserializer<'de>,
    {
        Ok(Some(Duration::from_secs(
            u64::deserialize(deserializer)? * 60,
        )))
    }
}

mod duration {
    use serde::{self, Serializer};
    use std::time::Duration;

    pub fn serialize<S>(date: &Duration, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_u64(date.as_secs() / 60)
    }
}

fn default_as_false() -> bool {
    false
}
