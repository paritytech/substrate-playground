pub mod docker;
pub mod kubernetes;

pub struct Wrapper(pub Box<dyn Platform>);

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
