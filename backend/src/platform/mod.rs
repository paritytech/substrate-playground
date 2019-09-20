//! Platforms.
//!
//! A platform abstract the deployment of the IDE docker image.
//! Some metadata (e.g. final IDE URL) can be accessed.
//!
pub mod docker;
pub mod kubernetes;

use std::collections::HashMap;

pub struct Context(pub Box<dyn Platform>, pub HashMap<String, String>);

/// Returns the proper [`Platform`] for `name` if it exists.
///
/// # Examples
///
/// ```
/// let platform = platform::platform_for("kubernetes");
///
/// assert!(platform.is_some());
/// ```
pub fn platform_for(name: &str) -> Option<Box<dyn Platform>> {
    match name {
        "kubernetes" => Some(Box::new(kubernetes::K8s::new())),
        "docker" => Some(Box::new(docker::Docker::new())),
        _ => None
    }
}

pub trait Platform: Sync + Send {

    fn deploy(&self, template: &str) -> Result<String, String>;

    fn undeploy(&self, id: &str) -> Result<String, String>;

    fn url(&self, id: &str) -> Result<String, String>;

}
