use serde::{Deserialize, Serialize};
use serde_yaml::from_str;
use std::fmt::{self, Display, Formatter};

fn default_as_false() -> bool {
    false
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

impl Display for User {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}",
            serde_yaml::to_string(self).map_err(|_| fmt::Error {})?
        )
    }
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

impl UserConfiguration {
    pub fn parse(s: &str) -> Result<Self, String> {
        from_str(s).map_err(|err| format!("{}", err))
    }
}

impl Display for UserConfiguration {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}",
            serde_yaml::to_string(self).map_err(|_| fmt::Error {})?
        )
    }
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

impl Display for LoggedUser {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}",
            serde_yaml::to_string(self).map_err(|_| fmt::Error {})?
        )
    }
}
