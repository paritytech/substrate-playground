//! HTTP endpoints exposed in /api context

use crate::Context;
use hyper::{
    header::{qitem, Accept, Authorization, Basic, UserAgent},
    mime::Mime,
    net::HttpsConnector,
    status::StatusCode,
    Client,
};
use rocket::request::{self, FromRequest, Request};
use rocket::response::{content, status, Redirect};
use rocket::{
    catch, delete, get,
    http::{Cookie, Cookies, SameSite, Status},
    post, Outcome, State,
};
use rocket_contrib::{json, json::JsonValue};
use rocket_oauth2::{OAuth2, TokenResponse};
use serde::{Deserialize, Serialize};
use std::io::Read;
use tokio::runtime::Runtime;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct User {
    pub username: String,
    pub avatar: String,
    pub admin: bool,
}

const COOKIE_TOKEN: &str = "token";

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct GitHubTokenValidity {
    #[serde(default)]
    user: GitHubUser,
}

/// User information to be retrieved from the GitHub API.
#[derive(Clone, Default, Debug, serde::Serialize, serde::Deserialize)]
pub struct GitHubUser {
    #[serde(default)]
    login: String,
    #[serde(default)]
    avatar_url: String,
}

fn token_validity(token: &str, client_id: &str, client_secret: &str) -> Result<GitHubUser, String> {
    let https = HttpsConnector::new(hyper_sync_rustls::TlsClient::new());
    let client = Client::with_connector(https);

    let mime = "application/vnd.github.v3+json"
        .parse()
        .expect("parse GitHub MIME type");

    // https://docs.github.com/en/rest/reference/apps#check-a-token
    let response: hyper::client::response::Response = client
        .post(format!("https://api.github.com/applications/{}/token", client_id).as_str())
        .header(Authorization(Basic {
            username: client_id.to_owned(),
            password: Some(client_secret.to_owned()),
        }))
        .header(Accept(vec![qitem(mime)]))
        .header(UserAgent("Substrate Playground".into()))
        .body(format!("{{\"access_token\":\"{}\"}}", token).as_str())
        .send()
        .map_err(|op| {
            format!(
                "Failed to access Playground GitHub application: {}",
                op.to_string()
            )
        })?;

    if response.status == StatusCode::Ok {
        let token_validity: GitHubTokenValidity =
            serde_json::from_reader(response.take(2 * 1024 * 1024)).map_err(|error| {
                format!("Failed to read GitHubTokenValidity: {}", error.to_string())
            })?;
        Ok(token_validity.user)
    } else {
        Err("Invalid token".to_string())
    }
}

// Extract a User from private cookies
impl<'a, 'r> FromRequest<'a, 'r> for User {
    type Error = &'static str;

    fn from_request(request: &'a Request<'r>) -> request::Outcome<User, &'static str> {
        let engine = &request
            .guard::<State<Context>>()
            .map_failure(|f| (Status::BadRequest, "Can't access state"))?
            .manager
            .engine;
        let mut cookies = request.cookies();
        if let Some(token) = cookies.get_private(COOKIE_TOKEN) {
            let token_value = token.value();
            if let Ok(user) = token_validity(
                token_value,
                engine.configuration.client_id.as_str(),
                engine.configuration.client_secret.as_str(),
            ) {
                let login = user.login;
                Outcome::Success(User {
                    username: login.clone(),
                    avatar: user.avatar_url,
                    admin: Runtime::new()
                        .map_err(|_| {
                            Err((Status::ExpectationFailed, "Failed to execute async fn"))
                        })?
                        .block_on(engine.clone().get_admins())
                        .map_err(|_| Err((Status::FailedDependency, "Missing admins ConfiMap")))?
                        .contains(&login),
                })
            } else {
                clear(cookies);
                Outcome::Failure((Status::BadRequest, "4"))
            }
        } else {
            Outcome::Forward(())
        }
    }
}

fn result_to_jsonrpc<T: Serialize>(res: Result<T, String>) -> JsonValue {
    match res {
        Ok(val) => json!({ "result": val }),
        Err(err) => json!({ "error": err }),
    }
}

#[get("/")]
pub fn get(state: State<'_, Context>, user: User) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.get(user))
}

#[get("/", rank = 2)]
pub fn get_unlogged(state: State<'_, Context>) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.get_unlogged())
}

/// Deploy `template` Docker container for `user_id`.
#[post("/?<template>")]
pub fn deploy(state: State<'_, Context>, user: User, template: String) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.deploy(&user.username, &template))
}

#[post("/", rank = 2)]
pub fn deploy_unlogged() -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

#[delete("/")]
pub fn undeploy(state: State<'_, Context>, user: User) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.undeploy(&user.username))
}

#[delete("/<_instance_uuid>", rank = 2)]
pub fn undeploy_unlogged(_instance_uuid: String) -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

// GitHub login logic

#[get("/login/github")]
pub fn github_login(oauth2: OAuth2<GitHubUser>, mut cookies: Cookies<'_>) -> Redirect {
    oauth2.get_redirect(&mut cookies, &["user:read"]).unwrap()
}

/// Callback to handle the authenticated token recieved from GitHub
/// and store it as a private cookie
#[get("/auth/github")]
pub fn post_install_callback(
    token: TokenResponse<GitHubUser>,
    mut cookies: Cookies<'_>,
) -> Result<Redirect, String> {
    let https = HttpsConnector::new(hyper_sync_rustls::TlsClient::new());
    let client = Client::with_connector(https);

    // Use the token to retrieve the user's GitHub account information.
    let mime: Mime = "application/vnd.github.v3+json"
        .parse()
        .expect("parse GitHub MIME type");
    let response: hyper::client::response::Response = client
        .get("https://api.github.com/user")
        .header(Authorization(format!("token {}", token.access_token())))
        .header(Accept(vec![qitem(mime)]))
        .header(UserAgent("Substrate Playground".into()))
        .send()
        .map_err(|error| {
            format!(
                "Failed to access GitHub user profile: {}",
                error.to_string()
            )
        })?;

    if !response.status.is_success() {
        return Err(format!(
            "Error when accessing GitHub user profile:  {}",
            response.status
        ));
    }

    cookies.add_private(
        Cookie::build(COOKIE_TOKEN, token.access_token().to_string())
            .same_site(SameSite::Lax)
            .finish(),
    );

    Ok(Redirect::to("/logged"))
}

#[get("/logout")]
pub fn logout(cookies: Cookies<'_>) -> Redirect {
    clear(cookies);
    Redirect::to("/")
}

fn clear(mut cookies: Cookies<'_>) {
    cookies.remove_private(Cookie::named(COOKIE_TOKEN));
}

#[allow(dead_code)]
#[catch(400)] // TODO move to catch(default) once it's available
pub fn bad_request_catcher(_req: &Request<'_>) -> content::Html<String> {
    content::Html("<p>Sorry something unexpected happened!</p>".to_string())
}
