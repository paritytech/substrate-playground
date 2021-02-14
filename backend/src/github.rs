//! GitHub utility functions

use core::fmt;
use hyper::{Client, client::{Body, RequestBuilder}, header::{qitem, Accept, Authorization, Basic, UserAgent}, mime::Mime, net::HttpsConnector, status::StatusCode};
use serde::de::DeserializeOwned;
use serde_json::from_reader;
use std::{error::Error, io::Read};

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct GitHubTokenValidity {
    #[serde(default)]
    pub user: GitHubUser,
}

/// User information to be retrieved from the GitHub API.
#[derive(Clone, Default, Debug, serde::Serialize, serde::Deserialize)]
pub struct GitHubUser {
    #[serde(default)]
    pub login: String,
    #[serde(default)]
    pub avatar_url: String,
    pub organizations_url: String,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct GitHubOrg {
    #[serde(default)]
    pub login: String,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct GitHubError2 {
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub documentation_url: Option<String>,
}

/// Create a GitHub specific `Mime` type
fn mime_type() -> Mime {
    "application/vnd.github.v3+json"
        .parse()
        .expect("parse GitHub MIME type")
}

/// Create a new `Client`
fn create_client() -> Client {
    Client::with_connector(HttpsConnector::new(hyper_sync_rustls::TlsClient::new()))
}

#[derive(Debug)]
struct GitHubError {
    details: String,
}

impl fmt::Display for GitHubError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.details)
    }
}

impl Error for GitHubError {
    fn description(&self) -> &str {
        &self.details
    }
}

fn tokena(token: &str) -> String {
    format!("{{\"access_token\":\"{}\"}}", token)
}

fn send<T>(request_builder: RequestBuilder, token: &str) -> Result<T, Box<dyn Error>>
where
    T: DeserializeOwned,
{
    let a = tokena(token).clone();
    let c = a.clone();
    let b = c.as_bytes().clone();
    let body = Body::BufBody(b, b.len());
    let mut response = request_builder
        .header(Accept(vec![qitem(mime_type())]))
        .header(UserAgent("Substrate Playground".into()))
        //.body(format!("{{\"access_token\":\"{}\"}}", token).as_str())
       // .body(body)
        .send()?;
    if response.status == StatusCode::Ok {
        from_reader(response.take(2 * 1024 * 1024)).map_err(Into::into)
    } else {
        let mut s = String::new();
        if let Ok(_) = response.read_to_string(&mut s) {
            log::warn!("response {}", s);
        }
        Err(GitHubError {
            details: "".to_string(),
        }
        .into())
    }
}

///
/// Returns a GitHubUser representing provided token.
/// See https://docs.github.com/en/rest/reference/apps#check-a-token
///
/// # Arguments
///
/// * `token` - a github token
/// * `client_id` - a github OAuth client ID
/// * `client_secret` - a github OAuth client secret (matching client ID)
///
#[allow(dead_code)]
pub fn token_validity(
    token: &str,
    client_id: &str,
    client_secret: &str,
) -> Result<GitHubTokenValidity, Box<dyn Error>> {
    let client = create_client();
    let builder = client
        .post(format!("https://api.github.com/applications/{}/token", client_id).as_str())
        .header(Authorization(Basic {
            username: client_id.to_owned(),
            password: Some(client_secret.to_owned()),
        }));
    send(builder, token)
}

///
/// Returns current GitHubUser represented by a `token`.
///
/// # Arguments
///
/// * `token` - a github token
///
pub fn current_user(token: &str) -> Result<GitHubUser, Box<dyn Error>> {
    let client = create_client();
    let builder = client
        .get("https://api.github.com/user");
    send(builder, token)
}

///
/// Returns a Vec<GitHubOrg> associated to a GitHubUser.
///
/// # Arguments
///
/// * `token` - a github token
/// * `user` - a GitHubUser
///
pub fn orgs(token: &str, user: &GitHubUser) -> Result<Vec<GitHubOrg>, Box<dyn Error>> {
    let client = create_client();
    let builder = client
        .get(user.organizations_url.as_str());
    send(builder, token)
}
