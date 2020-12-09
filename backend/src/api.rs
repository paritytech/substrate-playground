//! HTTP endpoints exposed in /api context
use crate::github::token_validity;
use crate::user::{Admin, User, UserConfiguration};
use crate::Context;
use rocket::request::{self, FromRequest, Request};
use rocket::response::{content, status, Redirect};
use rocket::{
    catch, delete, get,
    http::{Cookie, Cookies, SameSite, Status},
    post, put, Outcome, State,
};
use rocket_contrib::{
    json,
    json::{Json, JsonValue},
};
use rocket_oauth2::{OAuth2, TokenResponse};
use serde::Serialize;
use tokio::runtime::Runtime;

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

// Extract a User from private cookies
impl<'a, 'r> FromRequest<'a, 'r> for User {
    type Error = &'static str;

    fn from_request(request: &'a Request<'r>) -> request::Outcome<User, &'static str> {
        let engine = &request
            .guard::<State<Context>>()
            .map_failure(|_f| (Status::BadRequest, "Can't access state"))?
            .manager
            .engine;
        let mut cookies = request.cookies();
        if let Some(token) = cookies.get_private(COOKIE_TOKEN) {
            let token_value = token.value();
            if let Ok(gh_user) = token_validity(
                token_value,
                engine.configuration.client_id.as_str(),
                engine.configuration.client_secret.as_str(),
            ) {
                let id = gh_user.login;
                let users = Runtime::new()
                    .map_err(|_| Err((Status::ExpectationFailed, "Failed to execute async fn")))?
                    .block_on(engine.clone().list_users())
                    .map_err(|_| Err((Status::FailedDependency, "Missing users ConfiMap")))?;
                let user = users.get(&id);
                // If at least one non-admin user is defined, then users are only allowed if whitelisted
                let filtered = users.values().any(|user| !user.admin);
                if !filtered || user.is_some() {
                    Outcome::Success(User {
                        id: id.clone(),
                        avatar: gh_user.avatar_url,
                    })
                } else {
                    Outcome::Failure((Status::Forbidden, "User is not whitelisted"))
                }
            } else {
                clear(cookies);
                Outcome::Failure((Status::BadRequest, "Token is invalid"))
            }
        } else {
            Outcome::Forward(())
        }
    }
}

// Extract an Admin from private cookies
impl<'a, 'r> FromRequest<'a, 'r> for Admin {
    type Error = &'static str;

    fn from_request(request: &'a Request<'r>) -> request::Outcome<Admin, &'static str> {
        let engine = &request
            .guard::<State<Context>>()
            .map_failure(|_f| (Status::BadRequest, "Can't access state"))?
            .manager
            .engine;
        let mut cookies = request.cookies();
        if let Some(token) = cookies.get_private(COOKIE_TOKEN) {
            let token_value = token.value();
            if let Ok(gh_user) = token_validity(
                token_value,
                engine.configuration.client_id.as_str(),
                engine.configuration.client_secret.as_str(),
            ) {
                let id = gh_user.login;
                let users = Runtime::new()
                    .map_err(|_| Err((Status::ExpectationFailed, "Failed to execute async fn")))?
                    .block_on(engine.clone().list_users())
                    .map_err(|_| Err((Status::FailedDependency, "Missing users ConfiMap")))?;
                let user = users.get(&id);
                if user.map_or_else(|| false, |user| user.admin) {
                    Outcome::Success(Admin {
                        id: id.clone(),
                        avatar: gh_user.avatar_url,
                    })
                } else {
                    // Give the opportunity to be a regular User
                    Outcome::Forward(())
                }
            } else {
                clear(cookies);
                Outcome::Failure((Status::BadRequest, "Token is invalid"))
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
pub fn get_admin(state: State<'_, Context>, admin: Admin) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.get_admin(admin))
}

#[get("/", rank = 2)]
pub fn get(state: State<'_, Context>, user: User) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.get(user))
}

#[get("/", rank = 3)]
pub fn get_unlogged(state: State<'_, Context>) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.get_unlogged())
}

// User resources. Only accessible to Admins.

#[get("/users")]
pub fn list_users(state: State<'_, Context>, _admin: Admin) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.list_users())
}

#[put("/users/<id>", data = "<user>")]
pub fn create_or_update_user(
    state: State<'_, Context>,
    _admin: Admin,
    id: String,
    user: Json<UserConfiguration>,
) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.create_or_update_user(id, user.0))
}

#[delete("/users/<id>")]
pub fn delete_user(state: State<'_, Context>, _admin: Admin, id: String) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.delete_user(id))
}

/// Deploy `template` Docker container for `user_id`.
#[post("/?<template>")]
pub fn deploy(state: State<'_, Context>, user: User, template: String) -> JsonValue {
    // TODO get parameters as body (sessionDuration, ..)
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.deploy(&user.id, &template))
}

// GET for instance details?
// PUT for instance configuration

#[post("/", rank = 2)]
pub fn deploy_unlogged() -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

#[delete("/")]
pub fn undeploy(state: State<'_, Context>, user: User) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.undeploy(&user.id))
}

#[delete("/", rank = 2)]
pub fn undeploy_unlogged() -> status::Unauthorized<()> {
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
