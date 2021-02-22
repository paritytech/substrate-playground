use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    str::FromStr,
    time::{Duration, SystemTime},
};

#[derive(Serialize, Clone, Debug)]
pub struct Session {
    pub user_id: String,
    pub template: Template,
    pub url: String,
    pub pod: Pod,
    #[serde(with = "duration")]
    pub duration: Duration,
    pub node: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum Phase {
    Pending,
    Running,
    Succeeded,
    Failed,
    Unknown,
}

impl FromStr for Phase {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "Pending" => Ok(Phase::Pending),
            "Running" => Ok(Phase::Running),
            "Succeeded" => Ok(Phase::Succeeded),
            "Failed" => Ok(Phase::Failed),
            "Unknown" => Ok(Phase::Unknown),
            _ => Err(format!("'{}' is not a valid value for Phase", s)),
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Pod {
    pub phase: Phase,
    pub reason: String,
    pub message: String,
    #[serde(with = "system_time")]
    pub start_time: Option<SystemTime>,
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
pub struct SessionConfiguration {
    pub template: String,
    #[serde(default)]
    #[serde(with = "option_duration")]
    pub duration: Option<Duration>,
    pub pool_affinity: Option<String>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct SessionUpdateConfiguration {
    #[serde(default)]
    #[serde(with = "option_duration")]
    pub duration: Option<Duration>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionDefaults {
    #[serde(with = "duration")]
    pub duration: Duration,
    pub pool_affinity: String,
    pub max_sessions_per_pod: usize,
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
pub struct LoggedUser {
    pub id: String,
    pub avatar: String,
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
pub struct Template {
    pub name: String,
    pub image: String,
    pub description: String,
    pub tags: Option<BTreeMap<String, String>>,
    pub runtime: Option<RuntimeConfiguration>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RuntimeConfiguration {
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

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Command {
    pub name: String,
    pub run: String,
    pub working_directory: String,
}

/// Utils

mod system_time {
    use serde::{self, Serializer};
    use std::time::SystemTime;

    pub fn serialize<S>(date: &Option<SystemTime>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match date.and_then(|v| v.elapsed().ok()) {
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
