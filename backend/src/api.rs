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
use rocket::response::Redirect;
use rocket::{
    delete, get,
    http::{Cookie, Cookies, SameSite, Status},
    post, Outcome, State,
};
use rocket_contrib::{json, json::JsonValue};
use rocket_oauth2::{OAuth2, TokenResponse};
use serde::{Deserialize, Serialize};
use std::{env, io::Read};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct User {
    pub username: String,
    pub avatar: String,
    pub token: String,
    pub parity: bool,
    pub admin: bool,
}

const COOKIE_USERNAME: &str = "username";
const COOKIE_AVATAR: &str = "avatar";
const COOKIE_TOKEN: &str = "token";
const COOKIE_PARITY: &str = "parity";
const COOKIE_ADMIN: &str = "admin";

fn token_valid(token: &str, client_id: &str, client_secret: &str) -> Result<bool, String> {
    let https = HttpsConnector::new(hyper_sync_rustls::TlsClient::new());
    let client = Client::with_connector(https);

    let mime: Mime = "application/vnd.github.v3+json"
        .parse()
        .expect("parse GitHub MIME type");

    // https://docs.github.com/en/rest/reference/apps#check-a-token
    let response: hyper::client::response::Response = client
        .post(format!("https://api.github.com/applications/{}/token", client_id).as_str())
        .header(Authorization(Basic {
            username: client_id.to_owned(),
            password: Some(client_secret.to_owned()),
        }))
        .header(Accept(vec![qitem(mime.clone())]))
        .header(UserAgent("Substrate Playground".into()))
        .body(format!("{{\"access_token\":\"{}\"}}", token).as_str())
        .send()
        .map_err(|a| a.to_string())?;

    Ok(response.status == StatusCode::Ok)
}

// Extract a User from private cookies
impl<'a, 'r> FromRequest<'a, 'r> for User {
    type Error = ();

    fn from_request(request: &'a Request<'r>) -> request::Outcome<User, ()> {
        let mut cookies = request.guard::<Cookies<'_>>().expect("request cookies");
        if let (Some(username), Some(avatar), Some(token), Some(parity), Some(admin)) = (
            cookies.get_private(COOKIE_USERNAME),
            cookies.get_private(COOKIE_AVATAR),
            cookies.get_private(COOKIE_TOKEN),
            cookies.get_private(COOKIE_PARITY),
            cookies.get_private(COOKIE_ADMIN),
        ) {
            let token_value = token.value();
            if token_valid(
                token_value,
                &env::var("GITHUB_CLIENT_ID").map_err(|_| Err((Status::BadRequest, ())))?,
                &env::var("GITHUB_CLIENT_SECRET").map_err(|_| Err((Status::BadRequest, ())))?,
            )
            .map_err(|_| Err((Status::BadRequest, ())))?
            {
                return Outcome::Success(User {
                    username: username.value().to_string(),
                    avatar: avatar.value().to_string(),
                    token: token_value.to_string(),
                    parity: parity.value().to_string().parse().unwrap_or(false),
                    admin: admin.value().to_string().parse().unwrap_or(false),
                });
            } else {
                clear(cookies);
            }
        }

        Outcome::Failure((Status::Unauthorized, ()))
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
    result_to_jsonrpc(manager.get_logged(user))
}

#[get("/<instance_uuid>")]
pub fn get_user_instance(
    state: State<'_, Context>,
    user: User,
    instance_uuid: String,
) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.get_instance(&user.username, &instance_uuid))
}

/// Deploy `template` Docker container for `user_id`.
#[post("/?<template>")]
pub fn deploy(state: State<'_, Context>, user: User, template: String) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.deploy(&user.username, &template))
}

#[delete("/<instance_uuid>")]
pub fn undeploy(state: State<'_, Context>, user: User, instance_uuid: String) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.undeploy(&user.username, &instance_uuid))
}

// GitHub login logic

/// User information to be retrieved from the GitHub API.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct GitHubUserInfo {
    #[serde(default)]
    login: String,
    #[serde(default)]
    avatar_url: String,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct GitHubOrg {
    #[serde(default)]
    login: String,
}

#[rocket::get("/login/github")]
pub fn github_login(oauth2: OAuth2<GitHubUserInfo>, mut cookies: Cookies<'_>) -> Redirect {
    oauth2.get_redirect(&mut cookies, &["user:read"]).unwrap()
}

/// Callback to handle the authenticated token recieved from GitHub
/// and store it as a private cookie
#[get("/auth/github")]
pub fn post_install_callback(
    token: TokenResponse<GitHubUserInfo>,
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
        .header(Accept(vec![qitem(mime.clone())]))
        .header(UserAgent("Substrate Playground".into()))
        .send()
        .map_err(|a| a.to_string())?;

    if !response.status.is_success() {
        return Err(format!("got non-success status {}", response.status));
    }

    let user_info: GitHubUserInfo =
        serde_json::from_reader(response.take(2 * 1024 * 1024)).map_err(|a| a.to_string())?;

    let response2: hyper::client::response::Response = client
        .get(format!("https://api.github.com/users/{}/orgs", user_info.login).as_str())
        .header(Authorization(format!("token {}", token.access_token())))
        .header(Accept(vec![qitem(mime)]))
        .header(UserAgent("Substrate Playground".into()))
        .send()
        .map_err(|a| a.to_string())?;

    if !response2.status.is_success() {
        return Err(format!("got non-success status {}", response2.status));
    }

    let orgs: Vec<GitHubOrg> =
        serde_json::from_reader(response2.take(2 * 1024 * 1024)).map_err(|a| a.to_string())?;

    cookies.add_private(
        Cookie::build(COOKIE_USERNAME, user_info.clone().login)
            .same_site(SameSite::Lax)
            .finish(),
    );
    cookies.add_private(
        Cookie::build(COOKIE_AVATAR, user_info.avatar_url)
            .same_site(SameSite::Lax)
            .finish(),
    );
    cookies.add_private(
        Cookie::build(COOKIE_TOKEN, token.access_token().to_string())
            .same_site(SameSite::Lax)
            .finish(),
    );
    cookies.add_private(
        Cookie::build(
            COOKIE_PARITY,
            orgs.into_iter()
                .any(|org| org.login == "paritytech")
                .to_string(),
        )
        .same_site(SameSite::Lax)
        .finish(),
    );
    cookies.add_private(
        Cookie::build(COOKIE_ADMIN, (user_info.login == "jeluard").to_string())
            .same_site(SameSite::Lax)
            .finish(),
    );
    Ok(Redirect::to("/"))
}

#[get("/logout")]
pub fn logout(cookies: Cookies<'_>) -> Redirect {
    clear(cookies);
    Redirect::to("/")
}

fn clear(mut cookies: Cookies<'_>) {
    cookies.remove_private(Cookie::named(COOKIE_USERNAME));
    cookies.remove_private(Cookie::named(COOKIE_AVATAR));
    cookies.remove_private(Cookie::named(COOKIE_TOKEN));
}
