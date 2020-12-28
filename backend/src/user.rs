use serde::{Deserialize, Serialize};
use serde_yaml::from_str;
use std::fmt::{self, Display, Formatter};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct User {
    pub id: String,
    pub admin: bool,
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
pub struct UserConfiguration {
    pub admin: bool,
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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LoggedAdmin {
    pub id: String,
    pub avatar: String,
}
