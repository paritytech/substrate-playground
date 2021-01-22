//! HTTP endpoints exposed in /api context
use crate::user::{LoggedAdmin, LoggedUser, UserConfiguration};
use crate::Context;
use crate::{
    github::{token_validity, GitHubUser},
    kubernetes::Environment,
};
use crate::{
    session::{SessionConfiguration, SessionUpdateConfiguration},
    user::UserUpdateConfiguration,
};
use request::FormItems;
use rocket::response::{content, status, Redirect};
use rocket::{
    catch, delete, get,
    http::{Cookie, Cookies, SameSite, Status},
    patch, put, Outcome, State,
};
use rocket::{
    http::uri::Origin,
    request::{self, FromRequest, Request},
};
use rocket_contrib::{
    json,
    json::{Json, JsonValue},
};
use rocket_oauth2::{OAuth2, TokenResponse};
use serde::Serialize;
use tokio::runtime::Runtime;

const COOKIE_TOKEN: &str = "token";

fn request_to_user<'a, 'r>(request: &'a Request<'r>) -> request::Outcome<LoggedUser, &'static str> {
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
            engine.configuration.github_client_id.as_str(),
            engine.secrets.github_client_secret.as_str(),
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
                Outcome::Success(LoggedUser {
                    id: id.clone(),
                    avatar: gh_user.avatar_url,
                    admin: user.map_or(false, |user| user.admin),
                    can_customize_duration: user.map_or(false, |user| user.can_customize_duration),
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

// Extract a User from cookies
impl<'a, 'r> FromRequest<'a, 'r> for LoggedUser {
    type Error = &'static str;

    fn from_request(request: &'a Request<'r>) -> request::Outcome<LoggedUser, &'static str> {
        request_to_user(request)
    }
}

impl<'a, 'r> FromRequest<'a, 'r> for LoggedAdmin {
    type Error = &'static str;

    fn from_request(request: &'a Request<'r>) -> request::Outcome<LoggedAdmin, &'static str> {
        let outcome = request_to_user(request);
        match outcome {
            Outcome::Success(user) => {
                if user.admin {
                    Outcome::Success(LoggedAdmin {
                        id: user.id,
                        avatar: user.avatar,
                    })
                } else {
                    Outcome::Forward(())
                }
            }
            Outcome::Failure((s, str)) => Outcome::Failure((s, str)),
            Outcome::Forward(()) => Outcome::Forward(()),
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
pub fn get(state: State<'_, Context>, user: LoggedUser) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.get(user))
}

#[get("/", rank = 2)]
pub fn get_unlogged(state: State<'_, Context>) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.get_unlogged())
}

// User resources. Only accessible to Admins.

#[get("/users/<id>")]
pub fn get_user(state: State<'_, Context>, _admin: LoggedAdmin, id: String) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.get_user(&id))
}

#[get("/users/<_id>", rank = 2)]
pub fn get_user_unlogged(_id: String) -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

#[get("/users")]
pub fn list_users(state: State<'_, Context>, _admin: LoggedAdmin) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.list_users())
}

#[get("/users", rank = 2)]
pub fn list_users_unlogged() -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

#[put("/users/<id>", data = "<conf>")]
pub fn create_user(
    state: State<'_, Context>,
    _admin: LoggedAdmin,
    id: String,
    conf: Json<UserConfiguration>,
) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.create_user(id, conf.0))
}

#[put("/users/<_id>", data = "<_conf>", rank = 2)]
pub fn create_user_unlogged(
    _id: String,
    _conf: Json<UserConfiguration>,
) -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

#[patch("/users/<id>", data = "<conf>")]
pub fn update_user(
    state: State<'_, Context>,
    _admin: LoggedAdmin,
    id: String,
    conf: Json<UserUpdateConfiguration>,
) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.update_user(id, conf.0))
}

#[patch("/users/<_id>", data = "<_conf>", rank = 2)]
pub fn update_user_unlogged(
    _id: String,
    _conf: Json<UserUpdateConfiguration>,
) -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

#[delete("/users/<id>")]
pub fn delete_user(state: State<'_, Context>, _admin: LoggedAdmin, id: String) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.delete_user(id))
}

#[delete("/users/<_id>", rank = 2)]
pub fn delete_user_unlogged(_id: String) -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

// Current Session

#[get("/session")]
pub fn get_current_session(state: State<'_, Context>, user: LoggedUser) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.get_session(&user.id))
}

#[get("/session", rank = 2)]
pub fn get_current_session_unlogged() -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

#[put("/session", data = "<conf>")]
pub fn create_current_session(
    state: State<'_, Context>,
    user: LoggedUser,
    conf: Json<SessionConfiguration>,
) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.create_session(&user.id, conf.0))
}

#[put("/session", data = "<_conf>", rank = 2)]
pub fn create_current_session_unlogged(
    _conf: Json<SessionConfiguration>,
) -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

#[patch("/session", data = "<conf>")]
pub fn update_current_session(
    state: State<'_, Context>,
    user: LoggedUser,
    conf: Json<SessionUpdateConfiguration>,
) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.update_session(&user.id, conf.0))
}

#[patch("/session", data = "<_conf>", rank = 2)]
pub fn update_current_session_unlogged(
    _conf: Json<SessionUpdateConfiguration>,
) -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

#[delete("/session")]
pub fn delete_current_session(state: State<'_, Context>, user: LoggedUser) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.delete_session(&user.id))
}

#[delete("/session", rank = 2)]
pub fn delete_current_session_unlogged() -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

// Sessions

#[get("/sessions")]
pub fn list_sessions(state: State<'_, Context>, _admin: LoggedAdmin) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.list_sessions())
}

#[get("/sessions", rank = 2)]
pub fn list_sessions_unlogged() -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

#[put("/sessions/<id>", data = "<conf>")]
pub fn create_session(
    state: State<'_, Context>,
    _admin: LoggedAdmin,
    id: String,
    conf: Json<SessionConfiguration>,
) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.create_session(&id, conf.0))
}

#[put("/sessions/<_id>", data = "<_conf>", rank = 2)]
pub fn create_session_unlogged(
    _id: String,
    _conf: Json<SessionConfiguration>,
) -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

#[patch("/sessions/<id>", data = "<conf>")]
pub fn update_session(
    state: State<'_, Context>,
    _admin: LoggedAdmin,
    id: String,
    conf: Json<SessionUpdateConfiguration>,
) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.update_session(&id, conf.0))
}

#[patch("/sessions/<_id>", data = "<_conf>", rank = 2)]
pub fn update_session_unlogged(
    _id: String,
    _conf: Json<SessionConfiguration>,
) -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

#[delete("/sessions/<id>")]
pub fn delete_session(state: State<'_, Context>, _admin: LoggedAdmin, id: String) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.delete_session(&id))
}

#[delete("/sessions/<_id>", rank = 2)]
pub fn delete_session_unlogged(_id: String) -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

// TODO Nodes / Pods

// kubectl get pod -o=custom-columns=NAME:.metadata.name,STATUS:.status.phase,NODE:.spec.nodeName --namespace playground

// GitHub login logic

fn query_segment(origin: &Origin) -> String {
    origin.query().map_or("".to_string(), |query| {
        let v: Vec<String> = FormItems::from(query)
            .map(|i| i.key_value_decoded())
            .filter(|(k, _)| k != "code" && k != "state")
            .map(|(k, v)| format!("{}={}", k, v))
            .collect();
        if v.is_empty() {
            "".to_string()
        } else {
            format!("?{}", v.join("&"))
        }
    })
}

fn protocol(env: &Environment) -> String {
    if env.secured { "https" } else { "http" }.to_string()
}

// Gets called from UI. Then redirects to the GitHub `auth_uri` which itself redirects to `/auth/github`
#[get("/login/github")]
pub fn github_login(
    state: State<'_, Context>,
    origin: &Origin,
    oauth2: OAuth2<GitHubUser>,
    mut cookies: Cookies<'_>,
) -> Redirect {
    let manager = state.manager.clone();
    oauth2
        .get_redirect_extras(
            &mut cookies,
            &["user:read"],
            &[(
                "redirect_uri",
                &format!(
                    "{}://{}/api/auth/github{}",
                    protocol(&manager.engine.env),
                    manager.engine.env.host,
                    query_segment(origin)
                ),
            )],
        )
        .unwrap()
}

/// Callback to handle the authenticated token received from GitHub
/// and store it as a cookie
#[get("/auth/github")]
pub fn post_install_callback(
    origin: &Origin,
    token: TokenResponse<GitHubUser>,
    mut cookies: Cookies<'_>,
) -> Result<Redirect, String> {
    cookies.add_private(
        Cookie::build(COOKIE_TOKEN, token.access_token().to_string())
            .same_site(SameSite::Lax)
            .finish(),
    );

    Ok(Redirect::to(format!("/{}", query_segment(origin))))
}

#[get("/logout")]
pub fn logout(cookies: Cookies<'_>) -> JsonValue {
    clear(cookies);
    result_to_jsonrpc(Ok(()))
}

fn clear(mut cookies: Cookies<'_>) {
    cookies.remove_private(Cookie::named(COOKIE_TOKEN));
}

#[allow(dead_code)]
#[catch(400)] // TODO move to catch(default) once it's available
pub fn bad_request_catcher(_req: &Request<'_>) -> content::Html<String> {
    content::Html("<p>Sorry something unexpected happened!</p>".to_string())
}
