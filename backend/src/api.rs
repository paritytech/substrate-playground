//! HTTP endpoints exposed in /api context
use std::{
    collections::{BTreeMap, HashMap},
    io::Cursor,
};

use crate::{
    error::{Error, Result},
    kubernetes::{parse_user_roles, user},
    types::{
        Playground, Pool, Preference, PreferenceConfiguration, PreferenceUpdateConfiguration,
        Profile, ProfileConfiguration, ProfileUpdateConfiguration, Repository,
        RepositoryConfiguration, RepositoryUpdateConfiguration, RepositoryVersion, Role,
        RoleConfiguration, RoleUpdateConfiguration, Session, SessionConfiguration,
        SessionExecutionConfiguration, SessionUpdateConfiguration, User, UserConfiguration,
        UserUpdateConfiguration,
    },
    utils::{
        github::{authorization_uri, current_user, exchange_code, orgs, GitHubUser},
        var,
    },
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

fn get_user_roles() -> Result<BTreeMap<String, String>> {
    var("USER_ROLES").map(parse_user_roles)
}

// Extract a User from cookies
// If User doesn't Exist yet it will be created
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
                            match get_user_roles() {
                                Ok(user_roles) => {
                                    let is_paritytech_member =
                                        is_paritytech_member(token_value, &gh_user).await;
                                    let default_user_role = if is_paritytech_member {
                                        "paritytech-member"
                                    } else {
                                        "user"
                                    }
                                    .to_string();
                                    let profiles =
                                        request.headers().get("profile").collect::<Vec<&str>>();
                                    if !profiles.is_empty() {
                                        if profiles.len() > 1 {
                                            log::warn!(
                                                "Multiple profile headers found: {:?}",
                                                profiles
                                            );
                                        }
                                        log::debug!("Using profile {:?}", profiles.get(0));
                                    }
                                    // Create a new User
                                    let user = User {
                                        id: user_id.to_string(),
                                        role: user_roles
                                            .get(user_id)
                                            .unwrap_or(&default_user_role)
                                            .to_string(),
                                        profile: profiles.get(0).map(|s| s.to_string()),
                                        preferences: BTreeMap::new(),
                                    };
                                    let user_configuration = UserConfiguration {
                                        role: user.clone().role,
                                        preferences: user.clone().preferences,
                                        profile: user.clone().profile,
                                    };
                                    if let Err(err) =
                                        user::create_user(user_id, user_configuration).await
                                    {
                                        log::warn!(
                                            "Error while creating user {} : {}",
                                            user_id,
                                            err
                                        );
                                    } else {
                                        log::debug!(
                                            "Created user {} with role {}",
                                            user_id,
                                            user.role
                                        );
                                    }
                                    return Outcome::Success(user);
                                }
                                Err(err) => {
                                    log::error!(
                                        "Error while accessing USER_ROLES env variable: {}",
                                        err
                                    );

                                    return Outcome::Failure((
                                        Status::ExpectationFailed,
                                        Error::Failure(err.to_string()),
                                    ));
                                }
                            }
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
        let error = match self {
            Error::MissingConstraint(_, _) => {
                json!({ "message": "Missing constraint", "data": {"type": "MissingConstraint"} })
            }
            Error::Failure(message) => json!({ "message": message, "data": {"type": "Failure"} }),
            Error::Resource(resource) => {
                json!({ "message": resource.to_string(), "data": {"type": "Resource"} })
            }
            Error::K8sCommunicationFailure(reason) => {
                json!({ "message": reason.to_string(), "data": {"type": "K8sCommunicationFailure"} })
            }
        };
        respond_to(&json!({ "error": error }))
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

// Utils

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

/// Endpoints

#[get("/")]
pub async fn get(state: &State<Context>, caller: User) -> Result<JsonRPC<Playground>> {
    state.manager.clone().get(caller).await.map(JsonRPC)
}

#[get("/", rank = 2)]
pub async fn get_unlogged(state: &State<Context>) -> Result<JsonRPC<Playground>> {
    state.manager.get_unlogged().await.map(JsonRPC)
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

// Preferences

#[get("/preferences/<id>")]
pub async fn get_preference(
    state: &State<Context>,
    caller: User,
    id: String,
) -> Result<JsonRPC<Option<Preference>>> {
    state
        .manager
        .get_preference(&caller, &id)
        .await
        .map(JsonRPC)
}

#[get("/preferences")]
pub async fn list_preferences(
    state: &State<Context>,
    caller: User,
) -> Result<JsonRPC<Vec<Preference>>> {
    state.manager.list_preferences(&caller).await.map(JsonRPC)
}

#[put("/preferences/<id>", data = "<conf>")]
pub async fn create_preference(
    state: &State<Context>,
    caller: User,
    id: String,
    conf: Json<PreferenceConfiguration>,
) -> Result<EmptyJsonRPC> {
    state
        .manager
        .create_preference(&caller, &id, conf.0)
        .await?;
    Ok(EmptyJsonRPC())
}

#[patch("/preferences/<id>", data = "<conf>")]
pub async fn update_preference(
    state: &State<Context>,
    caller: User,
    id: String,
    conf: Json<PreferenceUpdateConfiguration>,
) -> Result<EmptyJsonRPC> {
    state
        .manager
        .update_preference(&caller, &id, conf.0)
        .await?;
    Ok(EmptyJsonRPC())
}

#[delete("/preferences/<id>")]
pub async fn delete_preference(
    state: &State<Context>,
    caller: User,
    id: String,
) -> Result<EmptyJsonRPC> {
    state.manager.delete_preference(&caller, &id).await?;
    Ok(EmptyJsonRPC())
}

// Profiles

#[get("/profiles/<id>")]
pub async fn get_profile(
    state: &State<Context>,
    caller: User,
    id: String,
) -> Result<JsonRPC<Option<Profile>>> {
    state.manager.get_profile(&caller, &id).await.map(JsonRPC)
}

#[get("/profiles")]
pub async fn list_profiles(state: &State<Context>, caller: User) -> Result<JsonRPC<Vec<Profile>>> {
    state.manager.list_profiles(&caller).await.map(JsonRPC)
}

#[put("/profiles/<id>", data = "<conf>")]
pub async fn create_profile(
    state: &State<Context>,
    caller: User,
    id: String,
    conf: Json<ProfileConfiguration>,
) -> Result<EmptyJsonRPC> {
    state.manager.create_profile(&caller, &id, conf.0).await?;
    Ok(EmptyJsonRPC())
}

#[patch("/profiles/<id>", data = "<conf>")]
pub async fn update_profile(
    state: &State<Context>,
    caller: User,
    id: String,
    conf: Json<ProfileUpdateConfiguration>,
) -> Result<EmptyJsonRPC> {
    state.manager.update_profile(&caller, &id, conf.0).await?;
    Ok(EmptyJsonRPC())
}

#[delete("/profiles/<id>")]
pub async fn delete_profile(
    state: &State<Context>,
    caller: User,
    id: String,
) -> Result<EmptyJsonRPC> {
    state.manager.delete_profile(&caller, &id).await?;
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

// Sessions

#[get("/sessions")]
pub async fn list_sessions(state: &State<Context>, caller: User) -> Result<JsonRPC<Vec<Session>>> {
    state.manager.list_sessions(&caller).await.map(JsonRPC)
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

// User sessions

#[get("/users/<user_id>/sessions/<id>")]
pub async fn get_user_session(
    state: &State<Context>,
    caller: User,
    user_id: String,
    id: String,
) -> Result<JsonRPC<Option<Session>>> {
    state
        .manager
        .get_user_session(&caller, &user_id, &id)
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
        .list_user_sessions(&caller, &user_id)
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
        .create_user_session(&caller, &user_id, &id, &conf.0)
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
        .update_user_session(&caller, &user_id, &id, conf.0)
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
    state
        .manager
        .delete_user_session(&caller, &user_id, &id)
        .await?;
    Ok(EmptyJsonRPC())
}

// User session executions

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
        .create_user_session_execution(&caller, &user_id, &id, conf.0)
        .await?;
    Ok(EmptyJsonRPC())
}
