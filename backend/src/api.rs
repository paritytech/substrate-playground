//! HTTP endpoints exposed in /api context
use std::{
    collections::{BTreeMap, HashMap},
    io::Cursor,
};

use crate::{
    error::{Error, Result},
    kubernetes::{get_configuration, user},
    types::{
        Playground, Pool, Repository, RepositoryConfiguration, RepositoryUpdateConfiguration,
        RepositoryVersion, Role, RoleConfiguration, RoleUpdateConfiguration, Session,
        SessionConfiguration, SessionExecutionConfiguration, SessionUpdateConfiguration, User,
        UserConfiguration, UserUpdateConfiguration,
    },
    utils::github::{authorization_uri, current_user, exchange_code, orgs, GitHubUser},
    Context,
};
use rocket::{
    catch, delete, get,
    http::{uri::Origin, ContentType, Cookie, CookieJar, SameSite, Status},
    patch, put,
    request::{FromRequest, Outcome, Request},
    response::{Redirect, Responder},
    serde::json::{json, Json, Value},
    Response, State,
};
use serde::Serialize;

const COOKIE_TOKEN: &str = "token";

async fn is_paritytech_member(token: &str, user: &GitHubUser) -> bool {
    orgs(token, user)
        .await
        .unwrap_or_default()
        .iter()
        .map(|org| org.clone().login)
        .any(|organization| organization == *"paritytech".to_string())
}

async fn get_user_roles() -> BTreeMap<String, String> {
    match get_configuration().await {
        Ok(conf) => conf.user_roles,
        Err(err) => {
            log::warn!("Error while accessing configuration: {}", err);

            BTreeMap::new()
        }
    }
}

// Extract a User from cookies
#[rocket::async_trait]
impl<'r> FromRequest<'r> for User {
    type Error = Error;

    async fn from_request(request: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        let cookies = request.cookies();
        if let Some(token) = cookies.get_private(COOKIE_TOKEN) {
            let token_value = token.value();
            let user = current_user(token_value).await;
            match user {
                Ok(gh_user) => {
                    // User is a valid GitHub user
                    // Lookup associated User if exists, or create it
                    let user_id = &gh_user.login;
                    let user = user::get_user(user_id).await;
                    match user {
                        Ok(Some(user)) => {
                            return Outcome::Success(user);
                        }
                        Ok(None) => {
                            let user_roles = get_user_roles().await;
                            let is_paritytech_member =
                                is_paritytech_member(token_value, &gh_user).await;
                            let default_user_role = if is_paritytech_member {
                                "paritytech-member"
                            } else {
                                "user"
                            }
                            .to_string();
                            // Create a new User
                            let user = User {
                                id: user_id.to_string(),
                                role: user_roles
                                    .get(user_id)
                                    .unwrap_or(&default_user_role)
                                    .to_string(),
                                preferences: BTreeMap::new(),
                            };
                            let user_configuration = UserConfiguration {
                                role: user.clone().role,
                                preferences: user.clone().preferences,
                            };
                            if let Err(err) = user::create_user(user_id, user_configuration).await {
                                log::warn!("Error while creating user {} : {}", user_id, err);
                            };
                            return Outcome::Success(user);
                        }
                        Err(err) => {
                            // Failed to access user details
                            log::error!("Error while accessing user details: {}", err);

                            return Outcome::Failure((
                                Status::Unauthorized,
                                Error::Failure(err.to_string()),
                            ));
                        }
                    }
                }
                Err(err) => {
                    // A token is present, but can't be used to access user details
                    log::error!("Error while accessing GH user details: {}", err);

                    return Outcome::Failure((
                        Status::Unauthorized,
                        Error::Failure(err.to_string()),
                    ));
                }
            }
        } else {
            // No token in cookies, anonymous call
            Outcome::Forward(())
        }
    }
}

fn create_jsonrpc_error(_type: &str, message: String) -> Value {
    json!({ "error": { "type": _type, "message": message } })
}

// Responder implementations dealing with `Result` type

fn respond_to(value: &Value) -> rocket::response::Result<'static> {
    let str = value.to_string();
    Response::build()
        .header(ContentType::JSON)
        .sized_body(str.len(), Cursor::new(str))
        .ok()
}

impl<'r> Responder<'r, 'static> for Error {
    fn respond_to(self, _: &'r Request<'_>) -> rocket::response::Result<'static> {
        // TODO make generic for all errors
        respond_to(&create_jsonrpc_error(
            "RepositoryVersionNotReady",
            self.to_string(),
        ))
    }
}

impl<'r, T: Serialize> Responder<'r, 'static> for JsonRPC<T> {
    fn respond_to(self, _: &'r Request<'_>) -> rocket::response::Result<'static> {
        respond_to(&json!({ "result": self.0 }))
    }
}

impl<'r> Responder<'r, 'static> for EmptyJsonRPC {
    fn respond_to(self, _: &'r Request<'_>) -> rocket::response::Result<'static> {
        respond_to(&json!({ "result": "" }))
    }
}

pub struct EmptyJsonRPC();
pub struct JsonRPC<T>(pub T);

/// Endpoints

#[get("/")]
pub async fn get(state: &State<Context>, caller: User) -> Result<JsonRPC<Playground>> {
    state.manager.clone().get(caller).await.map(JsonRPC)
}

#[get("/", rank = 2)]
pub async fn get_unlogged(state: &State<Context>) -> Result<JsonRPC<Playground>> {
    state.manager.get_unlogged().await.map(JsonRPC)
}

// Users

#[get("/users/<id>")]
pub async fn get_user(
    state: &State<Context>,
    caller: User,
    id: String,
) -> Result<JsonRPC<Option<User>>> {
    state.manager.get_user(&caller, &id).await.map(JsonRPC)
}

#[get("/users")]
pub async fn list_users(state: &State<Context>, caller: User) -> Result<JsonRPC<Vec<User>>> {
    state.manager.list_users(&caller).await.map(JsonRPC)
}

#[put("/users/<id>", data = "<conf>")]
pub async fn create_user(
    state: &State<Context>,
    caller: User,
    id: String,
    conf: Json<UserConfiguration>,
) -> Result<EmptyJsonRPC> {
    state
        .manager
        .clone()
        .create_user(&caller, id, conf.0)
        .await?;
    Ok(EmptyJsonRPC())
}

#[patch("/users/<id>", data = "<conf>")]
pub async fn update_user(
    state: &State<Context>,
    caller: User,
    id: String,
    conf: Json<UserUpdateConfiguration>,
) -> Result<EmptyJsonRPC> {
    state
        .manager
        .clone()
        .update_user(&caller, id, conf.0)
        .await?;
    Ok(EmptyJsonRPC())
}

#[delete("/users/<id>")]
pub async fn delete_user(state: &State<Context>, caller: User, id: String) -> Result<EmptyJsonRPC> {
    state.manager.clone().delete_user(&caller, id).await?;
    Ok(EmptyJsonRPC())
}

// Sessions

#[get("/users/<user_id>/sessions/<id>")]
pub async fn get_user_session(
    state: &State<Context>,
    caller: User,
    user_id: String,
    id: String,
) -> Result<JsonRPC<Option<Session>>> {
    state
        .manager
        .get_session(&caller, &user_id, &id)
        .await
        .map(JsonRPC)
}

#[get("/user/sessions/<id>")]
pub async fn get_session(
    state: &State<Context>,
    caller: User,
    id: String,
) -> Result<JsonRPC<Option<Session>>> {
    state
        .manager
        .get_session(&caller, &caller.id, &id)
        .await
        .map(JsonRPC)
}

#[get("/users/<user_id>/sessions")]
pub async fn list_user_sessions(
    state: &State<Context>,
    user_id: String,
    caller: User,
) -> Result<JsonRPC<Vec<Session>>> {
    state
        .manager
        .list_sessions(&caller, &user_id)
        .await
        .map(JsonRPC)
}

#[get("/user/sessions")]
pub async fn list_sessions(state: &State<Context>, caller: User) -> Result<JsonRPC<Vec<Session>>> {
    state
        .manager
        .list_sessions(&caller, &caller.id)
        .await
        .map(JsonRPC)
}

#[put("/users/<user_id>/sessions/<id>", data = "<conf>")]
pub async fn create_user_session(
    state: &State<Context>,
    caller: User,
    user_id: String,
    id: String,
    conf: Json<SessionConfiguration>,
) -> Result<EmptyJsonRPC> {
    state
        .manager
        .create_session(&caller, &user_id, &id, &conf.0)
        .await?;
    Ok(EmptyJsonRPC())
}

#[put("/user/sessions/<id>", data = "<conf>")]
pub async fn create_session(
    state: &State<Context>,
    caller: User,
    id: String,
    conf: Json<SessionConfiguration>,
) -> Result<EmptyJsonRPC> {
    state
        .manager
        .create_session(&caller, &caller.id, &id, &conf.0)
        .await?;
    Ok(EmptyJsonRPC())
}

#[patch("/users/<user_id>/sessions/<id>", data = "<conf>")]
pub async fn update_user_session(
    state: &State<Context>,
    caller: User,
    user_id: String,
    id: String,
    conf: Json<SessionUpdateConfiguration>,
) -> Result<EmptyJsonRPC> {
    state
        .manager
        .update_session(&caller, &user_id, &id, conf.0)
        .await?;
    Ok(EmptyJsonRPC())
}

#[patch("/user/sessions/<id>", data = "<conf>")]
pub async fn update_session(
    state: &State<Context>,
    caller: User,
    id: String,
    conf: Json<SessionUpdateConfiguration>,
) -> Result<EmptyJsonRPC> {
    state
        .manager
        .update_session(&caller, &caller.id, &id, conf.0)
        .await?;
    Ok(EmptyJsonRPC())
}

#[delete("/users/<user_id>/sessions/<id>")]
pub async fn delete_user_session(
    state: &State<Context>,
    caller: User,
    user_id: String,
    id: String,
) -> Result<EmptyJsonRPC> {
    state.manager.delete_session(&caller, &user_id, &id).await?;
    Ok(EmptyJsonRPC())
}

#[delete("/user/sessions/<id>")]
pub async fn delete_session(
    state: &State<Context>,
    caller: User,
    id: String,
) -> Result<EmptyJsonRPC> {
    state
        .manager
        .delete_session(&caller, &caller.id, &id)
        .await?;
    Ok(EmptyJsonRPC())
}

// Session executions

#[put("/users/<user_id>/sessions/<id>/executions", data = "<conf>")]
pub async fn create_user_session_execution(
    state: &State<Context>,
    caller: User,
    user_id: String,
    id: String,
    conf: Json<SessionExecutionConfiguration>,
) -> Result<EmptyJsonRPC> {
    state
        .manager
        .create_session_execution(&caller, &user_id, &id, conf.0)
        .await?;
    Ok(EmptyJsonRPC())
}

#[put("/user/sessions/<id>/executions", data = "<conf>")]
pub async fn create_session_execution(
    state: &State<Context>,
    caller: User,
    id: String,
    conf: Json<SessionExecutionConfiguration>,
) -> Result<EmptyJsonRPC> {
    state
        .manager
        .create_session_execution(&caller, &caller.id, &id, conf.0)
        .await?;
    Ok(EmptyJsonRPC())
}

// All sessions

#[get("/sessions")]
pub async fn list_all_sessions(
    state: &State<Context>,
    caller: User,
) -> Result<JsonRPC<Vec<Session>>> {
    state.manager.list_all_sessions(&caller).await.map(JsonRPC)
}

// Roles

#[get("/roles/<id>")]
pub async fn get_role(
    state: &State<Context>,
    caller: User,
    id: String,
) -> Result<JsonRPC<Option<Role>>> {
    state.manager.get_role(&caller, &id).await.map(JsonRPC)
}

#[get("/roles")]
pub async fn list_roles(state: &State<Context>, caller: User) -> Result<JsonRPC<Vec<Role>>> {
    state.manager.list_roles(&caller).await.map(JsonRPC)
}

#[put("/roles/<id>", data = "<conf>")]
pub async fn create_role(
    state: &State<Context>,
    caller: User,
    id: String,
    conf: Json<RoleConfiguration>,
) -> Result<EmptyJsonRPC> {
    state.manager.create_role(&caller, &id, conf.0).await?;
    Ok(EmptyJsonRPC())
}

#[patch("/roles/<id>", data = "<conf>")]
pub async fn update_role(
    state: &State<Context>,
    caller: User,
    id: String,
    conf: Json<RoleUpdateConfiguration>,
) -> Result<EmptyJsonRPC> {
    state.manager.update_role(&caller, &id, conf.0).await?;
    Ok(EmptyJsonRPC())
}

#[delete("/roles/<id>")]
pub async fn delete_role(state: &State<Context>, caller: User, id: String) -> Result<EmptyJsonRPC> {
    state.manager.delete_role(&caller, &id).await?;
    Ok(EmptyJsonRPC())
}

// Repositories

#[get("/repositories/<id>")]
pub async fn get_repository(
    state: &State<Context>,
    caller: User,
    id: String,
) -> Result<JsonRPC<Option<Repository>>> {
    state
        .manager
        .get_repository(&caller, &id)
        .await
        .map(JsonRPC)
}

#[get("/repositories")]
pub async fn list_repositories(
    state: &State<Context>,
    caller: User,
) -> Result<JsonRPC<Vec<Repository>>> {
    state.manager.list_repositories(&caller).await.map(JsonRPC)
}

#[put("/repositories/<id>", data = "<conf>")]
pub async fn create_repository(
    state: &State<Context>,
    caller: User,
    id: String,
    conf: Json<RepositoryConfiguration>,
) -> Result<EmptyJsonRPC> {
    state
        .manager
        .create_repository(&caller, &id, conf.0)
        .await?;
    Ok(EmptyJsonRPC())
}

#[patch("/repositories/<id>", data = "<conf>")]
pub async fn update_repository(
    state: &State<Context>,
    caller: User,
    id: String,
    conf: Json<RepositoryUpdateConfiguration>,
) -> Result<EmptyJsonRPC> {
    state
        .manager
        .update_repository(&caller, &id, conf.0)
        .await?;
    Ok(EmptyJsonRPC())
}

#[delete("/repositories/<id>")]
pub async fn delete_repository(
    state: &State<Context>,
    caller: User,
    id: String,
) -> Result<EmptyJsonRPC> {
    state.manager.delete_repository(&caller, &id).await?;
    Ok(EmptyJsonRPC())
}

// Repository versions

#[get("/repositories/<repository_id>/versions/<id>")]
pub async fn get_repository_version(
    state: &State<Context>,
    caller: User,
    repository_id: String,
    id: String,
) -> Result<JsonRPC<Option<RepositoryVersion>>> {
    state
        .manager
        .get_repository_version(&caller, &repository_id, &id)
        .await
        .map(JsonRPC)
}

#[get("/repositories/<repository_id>/versions")]
pub async fn list_repository_versions(
    state: &State<Context>,
    caller: User,
    repository_id: String,
) -> Result<JsonRPC<Vec<RepositoryVersion>>> {
    state
        .manager
        .list_repository_versions(&caller, &repository_id)
        .await
        .map(JsonRPC)
}

#[put("/repositories/<repository_id>/versions/<id>")]
pub async fn create_repository_version(
    state: &State<Context>,
    caller: User,
    repository_id: String,
    id: String,
) -> Result<EmptyJsonRPC> {
    state
        .manager
        .create_repository_version(&caller, &repository_id, &id)
        .await?;
    Ok(EmptyJsonRPC())
}

#[delete("/repositories/<repository_id>/versions/<id>")]
pub async fn delete_repository_version(
    state: &State<Context>,
    caller: User,
    repository_id: String,
    id: String,
) -> Result<EmptyJsonRPC> {
    state
        .manager
        .delete_repository_version(&caller, &repository_id, &id)
        .await?;
    Ok(EmptyJsonRPC())
}

// Pools

#[get("/pools/<id>")]
pub async fn get_pool(
    state: &State<Context>,
    caller: User,
    id: String,
) -> Result<JsonRPC<Option<Pool>>> {
    state.manager.get_pool(&caller, &id).await.map(JsonRPC)
}

#[get("/pools")]
pub async fn list_pools(state: &State<Context>, caller: User) -> Result<JsonRPC<Vec<Pool>>> {
    state.manager.list_pools(&caller).await.map(JsonRPC)
}

// GitHub login logic

fn query_segment(origin: &Origin) -> String {
    origin.query().map_or("".to_string(), |query| {
        let v: Vec<String> = query
            .segments()
            .filter(|(k, _)| *k != "code" && *k != "state")
            .map(|(k, v)| format!("{}={}", k, v))
            .collect();
        if v.is_empty() {
            "".to_string()
        } else {
            format!("?{}", v.join("&"))
        }
    })
}

const STATE_COOKIE_NAME: &str = "rocket_oauth2_state";

// Random generation of state for defense against CSRF.
// See RFC 6749 §10.12 for more details.
fn generate_state(rng: &mut impl rand::RngCore) -> Result<String> {
    let mut buf = [0; 16]; // 128 bits
    rng.try_fill_bytes(&mut buf)
        .map_err(|_| Error::Failure("Failed to generate random data".to_string()))?;
    Ok(base64::encode_config(&buf, base64::URL_SAFE_NO_PAD))
}

// Gets called from UI. Then redirects to the GitHub `auth_uri` which itself redirects to `/auth/github`
#[get("/login/github")]
pub fn github_login(context: &State<Context>, cookies: &CookieJar<'_>) -> Result<Redirect> {
    let client_id = context.configuration.github_client_id.clone();
    let state = generate_state(&mut rand::thread_rng())?;
    let uri = authorization_uri(&client_id, &state);
    cookies.add_private(
        Cookie::build(STATE_COOKIE_NAME, state)
            .same_site(SameSite::Lax)
            .finish(),
    );
    Ok(Redirect::to(uri))
}

/// Callback to handle the authenticated token received from GitHub
/// and store it as a cookie
#[get("/auth/github")]
pub async fn post_install_callback(
    origin: &Origin<'_>,
    context: &State<Context>,
    cookies: &CookieJar<'_>,
) -> Result<Redirect> {
    let query = match origin.query() {
        Some(q) => q,
        None => return Err(Error::Failure("Failed to access query".to_string())),
    };
    let segments = query.segments().collect::<HashMap<&str, &str>>();
    // Make sure that the 'state' value provided matches the generated one
    if let Some(state) = segments.get("state") {
        if let Some(cookie) = cookies.get_private(STATE_COOKIE_NAME) {
            if cookie.value() == *state {
                if let Some(code) = segments.get("code") {
                    add_access_token(
                        cookies,
                        exchange_code(
                            &context.configuration.github_client_id,
                            &context.secrets.github_client_secret,
                            *code,
                        )
                        .await?,
                    );

                    Ok(Redirect::to(format!("/{}", query_segment(origin))))
                } else {
                    Err(Error::Failure("Missing code".to_string()))
                }
            } else {
                Err(Error::Failure("No matching state".to_string()))
            }
        } else {
            Err(Error::Failure("No state cookie".to_string()))
        }
    } else {
        Err(Error::Failure("Missing state".to_string()))
    }
}

fn add_access_token(cookies: &CookieJar<'_>, access_token: String) {
    cookies.add_private(
        Cookie::build(COOKIE_TOKEN, access_token)
            .same_site(SameSite::Lax)
            .finish(),
    )
}

#[get("/login?<bearer>")]
pub fn login(cookies: &CookieJar<'_>, bearer: String) {
    add_access_token(cookies, bearer)
}

#[get("/logout")]
pub fn logout(cookies: &CookieJar<'_>) {
    clear(cookies)
}

fn clear(cookies: &CookieJar<'_>) {
    cookies.remove_private(
        Cookie::build(COOKIE_TOKEN, "")
            .same_site(SameSite::Lax)
            .finish(),
    );
}

#[allow(dead_code)]
#[catch(401)]
pub fn bad_request_catcher(_req: &Request<'_>) {
    clear(_req.cookies())
}
