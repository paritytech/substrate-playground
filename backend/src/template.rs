use std::fmt::{self, Display, Formatter};
use serde::{Deserialize, Serialize};
use serde_yaml::from_str;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Template {
    pub image: String,
    pub name: String,
    pub description: String,
    pub runtime: Option<RuntimeConfiguration>,
}

impl Template {
    pub fn parse(s: &str) -> Result<Self, String> {
        from_str(s).map_err(|err| format!("{}", err))
    }
}

impl Display for Template {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(f, "{}", serde_yaml::to_string(self).map_err(|_| fmt::Error{})?)
    }
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