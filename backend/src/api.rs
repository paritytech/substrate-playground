//! HTTP endpoints exposed in /api context
use crate::{
    error::Result,
    github::{current_user, orgs, GitHubUser},
    types::{
        Environment, LoggedUser, UserConfiguration, UserUpdateConfiguration,
        WorkspaceConfiguration, WorkspaceUpdateConfiguration,
    },
    Context,
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

// Extract a User from cookies
impl<'a, 'r> FromRequest<'a, 'r> for LoggedUser {
    type Error = String;

    fn from_request(request: &'a Request<'r>) -> request::Outcome<LoggedUser, String> {
        let engine = &request
            .guard::<State<Context>>()
            .map_failure(|_f| (Status::BadRequest, "Can't access state".to_string()))?
            .manager
            .engine;
        let mut cookies = request.cookies();
        if let Some(token) = cookies.get_private(COOKIE_TOKEN) {
            let token_value = token.value();
            let runtime = Runtime::new().map_err(|_| {
                Err((
                    Status::ExpectationFailed,
                    "Failed to execute async fn".to_string(),
                ))
            })?;
            let gh_user = runtime.block_on(current_user(token_value)).map_err(|err| {
                // A token is present, but can't be used to access user details
                clear(cookies);
                log::warn!("Error while accessing user details: {}", err);
                Err((
                    Status::BadRequest,
                    format!("Can't access user details {}", err),
                ))
            })?;
            let id = gh_user.clone().login;
            let users = runtime.block_on(engine.clone().list_users()).map_err(|_| {
                Err((
                    Status::FailedDependency,
                    "Missing users ConfigMap".to_string(),
                ))
            })?;
            let organizations = runtime
                .block_on(orgs(token_value, &gh_user))
                .unwrap_or_default()
                .iter()
                .map(|org| org.clone().login)
                .collect();
            let user = users.get(&id);
            // If at least one non-admin user is defined, then users are only allowed if whitelisted
            let filtered = users.values().any(|user| !user.admin);
            if !filtered || user.is_some() {
                Outcome::Success(LoggedUser {
                    id: id.clone(),
                    admin: user.map_or(false, |user| user.admin),
                    pool_affinity: user.and_then(|user| user.pool_affinity.clone()),
                    can_customize_duration: user.map_or(false, |user| user.can_customize_duration),
                    can_customize_pool_affinity: user
                        .map_or(false, |user| user.can_customize_pool_affinity),
                    organizations,
                })
            } else {
                Outcome::Failure((Status::Forbidden, "User is not whitelisted".to_string()))
            }
        } else {
            // No token in cookies, anonymous call
            Outcome::Forward(())
        }
    }
}

fn result_to_jsonrpc<T: Serialize>(res: Result<T>) -> JsonValue {
    match res {
        Ok(val) => json!({ "result": val }),
        Err(err) => json!({ "error": err.to_string() }),
    }
}

#[get("/")]
pub fn get(state: State<'_, Context>, user: LoggedUser) -> JsonValue {
    result_to_jsonrpc(state.manager.clone().get(user))
}

#[get("/", rank = 2)]
pub fn get_unlogged(state: State<'_, Context>) -> JsonValue {
    result_to_jsonrpc(state.manager.get_unlogged())
}

// User resources. Only accessible to Admins.

#[get("/users/<id>")]
pub fn get_user(state: State<'_, Context>, user: LoggedUser, id: String) -> JsonValue {
    result_to_jsonrpc(state.manager.get_user(&user, &id))
}

#[get("/users")]
pub fn list_users(state: State<'_, Context>, user: LoggedUser) -> JsonValue {
    result_to_jsonrpc(state.manager.list_users(&user))
}

#[put("/users/<id>", data = "<conf>")]
pub fn create_user(
    state: State<'_, Context>,
    user: LoggedUser,
    id: String,
    conf: Json<UserConfiguration>,
) -> JsonValue {
    result_to_jsonrpc(state.manager.clone().create_user(&user, id, conf.0))
}

#[patch("/users/<id>", data = "<conf>")]
pub fn update_user(
    state: State<'_, Context>,
    user: LoggedUser,
    id: String,
    conf: Json<UserUpdateConfiguration>,
) -> JsonValue {
    result_to_jsonrpc(state.manager.clone().update_user(user, id, conf.0))
}

#[delete("/users/<id>")]
pub fn delete_user(state: State<'_, Context>, user: LoggedUser, id: String) -> JsonValue {
    result_to_jsonrpc(state.manager.clone().delete_user(&user, id))
}

// Current Workspace

#[get("/workspace")]
pub fn get_current_workspace(state: State<'_, Context>, user: LoggedUser) -> JsonValue {
    result_to_jsonrpc(state.manager.get_workspace(&user, &user.id))
}

#[get("/workspace", rank = 2)]
pub fn get_current_workspace_unlogged() -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

///
/// Create a new workspace for `LoggedUser`. A single workspace can exist at a time.
///
/// There is a short time window where multiple concurrent calls can succeed.
/// As this call is idempotent this won't lead to multiple workspace creation.
///
#[put("/workspace", data = "<conf>")]
pub fn create_current_workspace(
    state: State<'_, Context>,
    user: LoggedUser,
    conf: Json<WorkspaceConfiguration>,
) -> JsonValue {
    result_to_jsonrpc(state.manager.create_workspace(&user, &user.id, conf.0))
}

#[put("/workspace", data = "<_conf>", rank = 2)]
pub fn create_current_workspace_unlogged(
    _conf: Json<WorkspaceConfiguration>,
) -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

#[patch("/workspace", data = "<conf>")]
pub fn update_current_workspace(
    state: State<'_, Context>,
    user: LoggedUser,
    conf: Json<WorkspaceUpdateConfiguration>,
) -> JsonValue {
    result_to_jsonrpc(state.manager.update_workspace(&user.id, &user, conf.0))
}

#[patch("/workspace", data = "<_conf>", rank = 2)]
pub fn update_current_workspace_unlogged(
    _conf: Json<WorkspaceUpdateConfiguration>,
) -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

#[delete("/workspace")]
pub fn delete_current_workspace(state: State<'_, Context>, user: LoggedUser) -> JsonValue {
    result_to_jsonrpc(state.manager.delete_workspace(&user, &user.id))
}

#[delete("/workspace", rank = 2)]
pub fn delete_current_workspace_unlogged() -> status::Unauthorized<()> {
    status::Unauthorized::<()>(None)
}

// Workspaces

#[get("/workspaces/<id>")]
pub fn get_workspace(state: State<'_, Context>, user: LoggedUser, id: String) -> JsonValue {
    result_to_jsonrpc(state.manager.get_workspace(&user, &id))
}

#[get("/workspaces")]
pub fn list_workspaces(state: State<'_, Context>, user: LoggedUser) -> JsonValue {
    result_to_jsonrpc(state.manager.list_workspaces(&user))
}

#[put("/workspaces/<id>", data = "<conf>")]
pub fn create_workspace(
    state: State<'_, Context>,
    user: LoggedUser,
    id: String,
    conf: Json<WorkspaceConfiguration>,
) -> JsonValue {
    result_to_jsonrpc(state.manager.create_workspace(&user, &id, conf.0))
}

#[patch("/workspaces/<id>", data = "<conf>")]
pub fn update_workspace(
    state: State<'_, Context>,
    user: LoggedUser,
    id: String,
    conf: Json<WorkspaceUpdateConfiguration>,
) -> JsonValue {
    result_to_jsonrpc(state.manager.update_workspace(&id, &user, conf.0))
}

#[delete("/workspaces/<id>")]
pub fn delete_workspace(state: State<'_, Context>, user: LoggedUser, id: String) -> JsonValue {
    result_to_jsonrpc(state.manager.delete_workspace(&user, &id))
}

/*
#[get("/templates/<id>/<version>")]
pub fn get_template_version(state: State<'_, Context>, id: String, version: String) -> JsonValue {
    result_to_jsonrpc(state.manager.list_templates())
}

#[put("/templates/<id>/<version>", data = "<conf>")]
pub fn create_template_version(
    state: State<'_, Context>,
    user: LoggedUser,
    id: String,
    conf: Json<TemplateVersionConfiguration>,
) -> JsonValue {
    result_to_jsonrpc(state.manager.create_workspace(&user, &id, conf.0))
}

*/
/*
#[get("/repositories")]
pub fn list_favorites(state: State<'_, Context>) -> JsonValue {
    result_to_jsonrpc(state.manager.list_templates())
}
*/
// Pools

#[get("/pools/<id>")]
pub fn get_pool(state: State<'_, Context>, user: LoggedUser, id: String) -> JsonValue {
    result_to_jsonrpc(state.manager.get_pool(&user, &id))
}

#[get("/pools")]
pub fn list_pools(state: State<'_, Context>, user: LoggedUser) -> JsonValue {
    result_to_jsonrpc(state.manager.list_pools(&user))
}

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
    let redirect_uri = format!(
        "{}://{}/api/auth/github{}",
        protocol(&manager.engine.env),
        manager.engine.env.host,
        query_segment(origin)
    );
    oauth2
        .get_redirect_extras(
            &mut cookies,
            &["user:read"],
            &[("redirect_uri", &redirect_uri)],
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
) -> Redirect {
    cookies.add_private(
        Cookie::build(COOKIE_TOKEN, token.access_token().to_string())
            .same_site(SameSite::Lax)
            .finish(),
    );

    Redirect::to(format!("/{}", query_segment(origin)))
}

#[get("/login?<bearer>")]
pub fn login(mut cookies: Cookies<'_>, bearer: String) {
    cookies.add_private(
        Cookie::build(COOKIE_TOKEN, bearer)
            .same_site(SameSite::Lax)
            .finish(),
    )
}

#[get("/logout")]
pub fn logout(cookies: Cookies<'_>) {
    clear(cookies)
}

fn clear(mut cookies: Cookies<'_>) {
    cookies.remove_private(Cookie::named(COOKIE_TOKEN));
}

#[allow(dead_code)]
#[catch(400)] // TODO move to catch(default) once it's available
pub fn bad_request_catcher(_req: &Request<'_>) -> content::Html<String> {
    content::Html("<p>Sorry something unexpected happened!</p>".to_string())
}
