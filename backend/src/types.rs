use crate::kubernetes::role::get_role;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fmt,
    str::FromStr,
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
    pub session: SessionDefaults,
}

#[derive(Clone)]
pub struct Secrets {
    pub github_client_secret: String,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionDefaults {
    #[serde(with = "duration")]
    pub duration: Duration,
    #[serde(with = "duration")]
    pub max_duration: Duration,
    pub pool_affinity: String,
    pub max_sessions_per_pod: usize,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryDetails {
    pub id: String,
    pub reference: String,
}

#[derive(PartialOrd, Ord, PartialEq, Eq, Serialize, Deserialize, Clone, Debug)]
pub enum ResourceType {
    Pool,
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
#[serde(tag = "type")]
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
            ResourcePermission::Custom { .. } => write!(f, "Custom"),
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
    pub permissions: BTreeMap<ResourceType, Vec<ResourcePermission>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub roles: Vec<String>,
    pub preferences: BTreeMap<String, String>,
}

fn merge_permissions(
    mut permissions1: BTreeMap<ResourceType, Vec<ResourcePermission>>,
    permissions2: &BTreeMap<ResourceType, Vec<ResourcePermission>>,
) -> BTreeMap<ResourceType, Vec<ResourcePermission>> {
    for (key, mut value) in permissions2.clone().into_iter() {
        let mut old_value = permissions1.get(&key).cloned().unwrap_or_default();
        old_value.append(&mut value);
        old_value.dedup();
        permissions1.insert(key.clone(), old_value);
    }
    permissions1
}

#[test]
fn it_merges_permissions() {
    let mut permissions1 = BTreeMap::new();
    permissions1.insert(
        ResourceType::Pool,
        vec![ResourcePermission::Read, ResourcePermission::Create],
    );
    permissions1.insert(ResourceType::Repository, vec![ResourcePermission::Read]);
    let mut permissions2 = BTreeMap::new();
    permissions2.insert(ResourceType::Repository, vec![ResourcePermission::Create]);
    let permissions = merge_permissions(permissions1, &permissions2);
    assert_eq!(permissions.len(), 2);
    assert_eq!(
        permissions.get(&ResourceType::Repository).unwrap(),
        &vec![ResourcePermission::Read, ResourcePermission::Create]
    );
}

impl User {
    // For now assume Roles are static
    pub async fn all_permissions(&self) -> BTreeMap<ResourceType, Vec<ResourcePermission>> {
        let all_permissions: Vec<BTreeMap<ResourceType, Vec<ResourcePermission>>> =
            futures::stream::iter(self.roles.clone())
                .filter_map(|role| async move {
                    match get_role(&role).await {
                        Ok(Some(role)) => {
                            log::info!("Adding perms for Role {}: {:?}", role.id, role.permissions);
                            Some(role.permissions)
                        },
                        Ok(None) => None,
                        Err(err) => {
                            log::error!("Cannot read role {:?}", err);

                            None
                        }
                    }
                })
                .collect()
                .await;
        log::info!("All permissions {:?}", all_permissions);
        all_permissions.iter().fold(BTreeMap::new(), |accum, item| {
            merge_permissions(accum, item)
        })
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
    pub roles: Vec<String>,
    pub preferences: BTreeMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserUpdateConfiguration {
    pub roles: Vec<String>,
    pub preferences: BTreeMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Repository {
    pub id: String,
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RepositoryConfiguration {
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RepositoryUpdateConfiguration {
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryVersion {
    pub id: String,
    pub state: RepositoryVersionState,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum RepositoryVersionState {
    Cloning {
        progress: i32,
    },
    Building {
        progress: i32,
        devcontainer_json: String,
    },
    Ready {
        devcontainer_json: String,
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

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub user_id: String,
    pub state: SessionState,
    #[serde(with = "duration")]
    pub max_duration: Duration,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SessionState {
    Deploying,
    Running {
        #[serde(with = "system_time")]
        start_time: SystemTime,
        node: Node,
        runtime_configuration: SessionRuntimeConfiguration,
    },
    Failed {
        message: String,
        reason: String,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionRuntimeConfiguration {
    pub env: Vec<NameValuePair>,
    pub ports: Vec<Port>,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySource {
    pub repository_id: String,
    pub repository_version_id: String,
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

#[derive(Serialize, Clone, Debug)]
pub struct ContainerStatus {
    pub phase: ContainerPhase,
    pub reason: Option<String>,
    pub message: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum Status {
    True,
    False,
    Unknown,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum ContainerPhase {
    Running,
    Terminated,
    Waiting,
    Unknown,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum Phase {
    Pending,
    Running,
    Succeeded,
    Failed,
    Unknown,
}

impl FromStr for Status {
    type Err = String;

    fn from_str(s: &str) -> Result<Status, Self::Err> {
        match s {
            "True" => Ok(Status::True),
            "False" => Ok(Status::False),
            "Unknown" => Ok(Status::Unknown),
            _ => Err(format!("'{}' is not a valid value for Status", s)),
        }
    }
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
