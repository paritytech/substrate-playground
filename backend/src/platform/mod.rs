pub mod docker;
pub mod kubernetes;

pub struct Wrapper(pub Box<dyn Platform>);

pub trait Platform: Sync + Send {
    
    fn deploy(&self, template: &str) -> Result<String, String>;

    fn undeploy(&self, id: &str) -> Result<String, String>;

    fn url(&self, id: &str) -> Result<String, String>;

}
