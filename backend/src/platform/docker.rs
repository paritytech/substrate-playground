use crate::utils;
use crate::platform::Platform;
use std::process::Command;

pub struct Docker {}

impl Docker {
    pub fn new() -> Self {
        Docker{}
    }
}

fn parse_port(output: String) -> Option<String> {
    let split: Vec<&str> = output.split(":").collect();
    match split.get(1) {
        Some(port) => Some(port.to_string().trim().to_string()),
        None => None
    }
}

impl Platform for Docker {

    fn deploy(&self, image: & str) -> Result<String, String> {
        let output = Command::new("docker")
                        .args(&["run", "-d", "-p", "2000-3000:3000", image])
                        .output();
        utils::output_result(output)
    }

    fn undeploy(&self, id: & str) -> Result<String, String> {
        let output = Command::new("docker")
                        .arg("stop").arg(id)
                        .output();
        utils::output_result(output)
    }

    fn url(&self, id: & str) -> Result<String, String> {
        let port = utils::output_result(Command::new("docker")
                                        .args(&["port", &id[..]])
                                        .output())?;
        Ok(format!("//localhost:{}/#/home/project", parse_port(port).unwrap()))
    }

}

#[cfg(test)]
mod tests {

    use super::*;

    #[test]
    fn test_parse_port() {
        assert_eq!(None, parse_port("".to_string()));
        assert_eq!(Some("12".to_string()), parse_port("test : 12".to_string()));
    }

}