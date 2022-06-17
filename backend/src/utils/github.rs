//! GitHub utility functions

use crate::{
    error::{Error, Result},
    utils::http::send,
};
use hyper::{
    header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, USER_AGENT},
    http::request::Builder,
    Body, Method, Request,
};
use serde_json::Value;

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

/// Create a `Request` `Builder` with necessary headers
fn create_request_builder() -> Builder {
    Request::builder()
        .header(CONTENT_TYPE, "application/vnd.github.v3+json")
        .header(USER_AGENT, "Substrate Playground")
}

fn create_request_builder_with_token(token: &str) -> Builder {
    create_request_builder().header(AUTHORIZATION, format!("token {}", token))
}

///
/// Returns current GitHubUser represented by a `token`.
///
/// # Arguments
///
/// * `token` - a github token
///
pub async fn current_user(token: &str) -> Result<GitHubUser> {
    let builder = create_request_builder_with_token(token).uri("https://api.github.com/user");
    send(builder, Body::default()).await
}

///
/// Returns a Vec<GitHubOrg> associated to a GitHubUser.
///
/// # Arguments
///
/// * `token` - a github token
/// * `user` - a GitHubUser
///
pub async fn orgs(token: &str, user: &GitHubUser) -> Result<Vec<GitHubOrg>> {
    let builder = create_request_builder_with_token(token).uri(user.organizations_url.as_str());
    send(builder, Body::default()).await
}

/// OAuth

// Web Application flow
// See https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps

const AUTH_URI: &str = "https://github.com/login/oauth/authorize";
const TOKEN_URI: &str = "https://github.com/login/oauth/access_token";

pub fn authorization_uri(client_id: &str, state: &str) -> String {
    format!(
        "{}?response_type=code&client_id={}&state={}&scope=user%3Aread",
        AUTH_URI, client_id, state
    )
}

pub async fn exchange_code(client_id: &str, client_secret: &str, code: &str) -> Result<String> {
    let builder = create_request_builder()
        .header(ACCEPT, "application/json")
        .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
        .method(Method::POST)
        .uri(TOKEN_URI);
    let body = format!(
        "grant_type=authorization_code&code={}&client_id={}&client_secret={}",
        code, client_id, client_secret
    );
    let value: Value = send(builder, Body::from(body)).await?;
    value
        .get("access_token")
        .and_then(Value::as_str)
        .map(String::from)
        .ok_or_else(|| Error::Failure("No access_token provided".to_string()))
}
