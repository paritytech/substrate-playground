//! GitHub utility functions

use body::aggregate;
use core::fmt;
use hyper::{
    body::{self, Buf},
    client::HttpConnector,
    header::{AUTHORIZATION, CONTENT_TYPE, USER_AGENT},
    http::request::Builder,
    Body, Client, Request,
};
use hyper_tls::HttpsConnector;
use serde::de::DeserializeOwned;
use serde_json::from_reader;
use std::error::Error as StdError;

// Custom Error type
#[derive(Debug)]
struct Error {
    pub cause: GitHubError,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.cause.message)
    }
}

impl StdError for Error {
    fn description(&self) -> &str {
        &self.cause.message
    }
}

/// User information to be retrieved from the GitHub API.
#[derive(Clone, Default, Debug, serde::Serialize, serde::Deserialize)]
pub struct GitHubUser {
    pub login: String,
    pub organizations_url: String,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct GitHubOrg {
    pub login: String,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct GitHubError {
    pub message: String,
    pub documentation_url: Option<String>,
    pub errors: Option<Vec<GitHubClientError>>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct GitHubClientError {
    pub resource: String,
    pub field: String,
    pub code: String,
}

/// Create a new `Client`
fn create_client() -> Client<HttpsConnector<HttpConnector>> {
    Client::builder().build(HttpsConnector::new())
}

/// Create a `Request` `Builder` with necessary headers
fn create_request_builder(token: &str) -> Builder {
    Request::builder()
        .header(CONTENT_TYPE, "application/vnd.github.v3+json")
        .header(USER_AGENT, "Substrate Playground")
        .header(AUTHORIZATION, format!("token {}", token))
}

// Send a fresh `Request` created from a `Builder`, sends it and return the object `T` parsed from JSON.
async fn send<T>(builder: Builder) -> Result<T, Box<dyn StdError>>
where
    T: DeserializeOwned,
{
    let client = create_client();
    let req = builder.body(Body::default())?;
    let res = client.request(req).await?;
    let status = res.status();
    let whole_body = aggregate(res).await?;
    if status.is_success() {
        from_reader(whole_body.reader()).map_err(Into::into)
    } else {
        let cause: GitHubError = from_reader(whole_body.reader())?;
        Err(Error { cause }.into())
    }
}

///
/// Returns current GitHubUser represented by a `token`.
///
/// # Arguments
///
/// * `token` - a github token
///
pub async fn current_user(token: &str) -> Result<GitHubUser, Box<dyn StdError>> {
    let builder = create_request_builder(token).uri("https://api.github.com/user");
    send(builder).await
}

///
/// Returns a Vec<GitHubOrg> associated to a GitHubUser.
///
/// # Arguments
///
/// * `token` - a github token
/// * `user` - a GitHubUser
///
pub async fn orgs(token: &str, user: &GitHubUser) -> Result<Vec<GitHubOrg>, Box<dyn StdError>> {
    let builder = create_request_builder(token).uri(user.organizations_url.as_str());
    send(builder).await
}
