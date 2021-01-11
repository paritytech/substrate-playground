use crate::{kubernetes::PodDetails, template::Template};
use serde::{Deserialize, Serialize};
use std::{
    fmt::{self, Display, Formatter},
    time::Duration,
};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Session {
    pub username: String,
    pub template: Template,
    pub url: String,
    pub pod: PodDetails,
    pub session_duration: Duration,
}

impl Display for Session {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}",
            serde_yaml::to_string(self).map_err(|_| fmt::Error {})?
        )
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SessionConfiguration {
    pub template: String,
    pub session_duration: Duration,
}

impl Display for SessionConfiguration {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}",
            serde_yaml::to_string(self).map_err(|_| fmt::Error {})?
        )
    }
}
