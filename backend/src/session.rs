use crate::{kubernetes::PodDetails, template::Template};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Serialize, Clone, Debug)]
pub struct Session {
    pub user_id: String,
    pub template: Template,
    pub url: String,
    pub pod: PodDetails,
    #[serde(with = "duration")]
    pub duration: Duration,
    pub node: String,
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
