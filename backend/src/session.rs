use crate::{kubernetes::PodDetails, template::Template};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Serialize, Clone, Debug)]
pub struct Session {
    pub username: String,
    pub template: Template,
    pub url: String,
    pub pod: PodDetails,
    #[serde(with = "duration")]
    pub duration: Duration,
}

#[derive(Deserialize, Clone, Debug)]
pub struct SessionConfiguration {
    pub template: String,
    #[serde(default)]
    #[serde(with = "option_duration")]
    pub duration: Option<Duration>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct SessionUpdateConfiguration {
    #[serde(default)]
    #[serde(with = "option_duration")]
    pub duration: Option<Duration>,
}

#[derive(Serialize, Debug, Clone)]
pub struct SessionDefaults {
    #[serde(with = "duration")]
    pub duration: Duration,
}

mod option_duration {
    use serde::{self, de::Error, Deserialize, Deserializer};
    use std::time::Duration;

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<Duration>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        match s.parse() {
            Ok(res) => Ok(Some(Duration::from_secs(res) / 60)),
            Err(e) => Err(Error::custom(format!(
                "Failed to deserialize duration: {}",
                e
            ))),
        }
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
