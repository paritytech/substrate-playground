use crate::{
    error::{Error, Result},
    kubernetes::{preference::list_preferences, profile::get_profile, role::get_role},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    convert::TryFrom,
    fmt,
    time::{Duration, SystemTime},
};

#[derive(Serialize, Clone, Debug)]
pub struct Playground {
    pub configuration: Configuration,
    pub user: Option<User>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Configuration {
    pub github_client_id: String,
}

#[derive(Clone)]
pub struct Secrets {
    pub github_client_secret: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub hostname: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Pool {
    pub id: String,
    pub instance_type: Option<String>,
    pub nodes: Vec<Node>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Preference {
    pub id: String,
    pub value: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PreferenceConfiguration {
    pub value: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PreferenceUpdateConfiguration {
    pub value: Option<String>,
}

#[derive(PartialOrd, Ord, PartialEq, Eq, Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "PascalCase")]
pub enum Preferences {
    SessionDefaultDuration,
    SessionMaxDuration,
    SessionPoolAffinity,
    UserDefaultRoles,
}

impl fmt::Display for Preferences {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match &*self {
            Preferences::SessionDefaultDuration => write!(f, "SessionDefaultDuration"),
            Preferences::SessionMaxDuration => write!(f, "SessionMaxDuration"),
            Preferences::SessionPoolAffinity => write!(f, "SessionPoolAffinity"),
            Preferences::UserDefaultRoles => write!(f, "UserDefaultRoles"),
        }
    }
}

impl TryFrom<&str> for Preferences {
    type Error = Error;

    fn try_from(other: &str) -> Result<Self> {
        match other {
            "SessionDefaultDuration" => Ok(Preferences::SessionDefaultDuration),
            "SessionMaxDuration" => Ok(Preferences::SessionMaxDuration),
            "SessionPoolAffinity" => Ok(Preferences::SessionPoolAffinity),
            "UserDefaultRoles" => Ok(Preferences::UserDefaultRoles),
            _ => Err(Error::Failure(format!("Unknown preference: {}", other))),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub preferences: BTreeMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProfileConfiguration {
    pub preferences: BTreeMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProfileUpdateConfiguration {
    pub preferences: Option<BTreeMap<String, String>>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct RepositoryDetails {
    pub id: String,
    pub reference: String,
}

#[derive(PartialOrd, Ord, PartialEq, Eq, Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "PascalCase")]
pub enum ResourceType {
    Pool,
    Preference,
    Profile,
    Repository,
    RepositoryVersion,
    Role,
    Session,
    SessionExecution,
    Template,
    User,
    Workspace,
}

impl fmt::Display for ResourceType {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match &*self {
            ResourceType::Pool => write!(f, "Pool"),
            ResourceType::Preference => write!(f, "Preference"),
            ResourceType::Profile => write!(f, "Profile"),
            ResourceType::Repository => write!(f, "Repository"),
            ResourceType::RepositoryVersion => write!(f, "RepositoryVersion"),
            ResourceType::Role => write!(f, "Role"),
            ResourceType::Session => write!(f, "Session"),
            ResourceType::SessionExecution => write!(f, "SessionExecution"),
            ResourceType::Template => write!(f, "Template"),
            ResourceType::User => write!(f, "User"),
            ResourceType::Workspace => write!(f, "Workspace"),
        }
    }
}

#[derive(PartialOrd, Ord, PartialEq, Eq, Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "PascalCase")]
pub enum ResourcePermission {
    Create,
    Read,
    Update,
    Delete,
    Custom { name: String },
}

impl fmt::Display for ResourcePermission {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match &*self {
            ResourcePermission::Create => write!(f, "Create"),
            ResourcePermission::Read => write!(f, "Read"),
            ResourcePermission::Update => write!(f, "Update"),
            ResourcePermission::Delete => write!(f, "Delete"),
            ResourcePermission::Custom { name } => write!(f, "Custom: {}", name),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Role {
    pub id: String,
    pub permissions: BTreeMap<ResourceType, Vec<ResourcePermission>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RoleConfiguration {
    pub permissions: BTreeMap<ResourceType, Vec<ResourcePermission>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RoleUpdateConfiguration {
    pub permissions: Option<BTreeMap<ResourceType, Vec<ResourcePermission>>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub id: String,
    pub url: String,
    pub current_version: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RepositoryConfiguration {
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RepositoryUpdateConfiguration {
    pub current_version: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryVersion {
    pub id: String,
    pub state: RepositoryVersionState,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "PascalCase")]
pub enum RepositoryVersionState {
    Init,
    Cloning {
        progress: i32,
    },
    Building {
        progress: i32,
        #[serde(rename = "devcontainerJson")]
        devcontainer_json: String,
    },
    Ready {
        #[serde(rename = "devcontainerJson")]
        devcontainer_json: Option<String>,
    },
    Failed {
        message: String,
    },
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
    pub port: i32,
    pub target: Option<i32>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub user_id: String,
    pub state: SessionState,
    #[serde(with = "duration")]
    pub max_duration: Duration,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionRuntimeConfiguration {
    pub env: Vec<NameValuePair>,
    pub ports: Vec<Port>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "PascalCase")]
pub enum SessionState {
    Deploying,
    Running {
        #[serde(with = "system_time", rename = "startTime")]
        start_time: SystemTime,
        node: Node,
        #[serde(rename = "runtimeConfiguration")]
        runtime_configuration: SessionRuntimeConfiguration,
    },
    Failed {
        message: String,
        reason: String,
    },
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySource {
    pub repository_id: String,
    pub repository_version_id: Option<String>,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfiguration {
    pub repository_source: RepositorySource,
    #[serde(default)]
    #[serde(with = "option_duration")]
    pub duration: Option<Duration>,
    pub pool_affinity: Option<String>,
    pub runtime_configuration: Option<SessionRuntimeConfiguration>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct SessionUpdateConfiguration {
    #[serde(default)]
    #[serde(with = "option_duration")]
    pub duration: Option<Duration>,
    pub runtime_configuration: Option<SessionRuntimeConfiguration>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecution {
    pub stdout: String,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecutionConfiguration {
    pub command: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub role: String,
    pub profile: Option<String>,
    pub preferences: BTreeMap<String, String>,
}

impl User {
    ///
    /// A merged `BTreeMap` of all `Preference`s for `User`
    ///
    /// Order of precedence: (former overrides latter)
    /// * user preferences
    /// * profile preferences (if any)
    /// * global preferences
    ///
    pub async fn all_preferences(&self) -> Result<BTreeMap<String, String>> {
        let mut all_preferences = BTreeMap::new();
        all_preferences.extend(
            list_preferences()
                .await?
                .iter()
                .map(|pref| (pref.clone().id, pref.clone().value))
                .collect::<BTreeMap<String, String>>(),
        );
        if let Some(profile) = self.profile.clone() {
            if let Some(profile) = get_profile(&profile).await? {
                all_preferences.extend(profile.preferences);
            }
        }
        all_preferences.extend(self.preferences.clone());
        Ok(all_preferences)
    }

    // For now assume Roles are static
    pub async fn all_permissions(&self) -> BTreeMap<ResourceType, Vec<ResourcePermission>> {
        match get_role(&self.role).await {
            Ok(Some(role)) => {
                log::debug!("Adding perms for Role {}: {:?}", role.id, role.permissions);

                role.permissions
            }
            Ok(None) => {
                log::error!("Unknown role {}", self.role);

                BTreeMap::new()
            }
            Err(err) => {
                log::error!("Cannot read role {}: {:?}", self.role, err);

                BTreeMap::new()
            }
        }
    }

    pub async fn has_permission(
        &self,
        resource_type: &ResourceType,
        resource_permission: &ResourcePermission,
    ) -> bool {
        let permissions = self
            .all_permissions()
            .await
            .get(resource_type)
            .cloned()
            .unwrap_or_default();
        permissions.contains(resource_permission)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserConfiguration {
    pub role: String,
    pub profile: Option<String>,
    pub preferences: BTreeMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserUpdateConfiguration {
    pub role: Option<String>,
    pub profile: Option<String>,
    pub preferences: Option<BTreeMap<String, String>>,
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
