#![feature(async_closure, proc_macro_hygiene, decl_macro)]

extern crate playground;

use ::prometheus::Registry;
use playground::github::GitHubUser;
use playground::manager::Manager;
use playground::prometheus::PrometheusMetrics;
use playground::Context;
use rocket::fairing::AdHoc;
use rocket::{catchers, config::Environment, http::Method, routes};
use rocket_cors::{AllowedOrigins, CorsOptions};
use rocket_oauth2::{HyperSyncRustlsAdapter, OAuth2, OAuthConfig, StaticProvider};
use std::{env, error::Error};

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // Initialize log configuration. Reads `RUST_LOG` if any, otherwise fallsback to `default`
    if env::var("RUST_LOG").is_err() {
        env::set_var("RUST_LOG", "info");
    }
    env_logger::init();

    // Prints basic details
    log::info!("Running ROCKET in {:?} mode", Environment::active()?);

    match env::var("GITHUB_SHA") {
        Ok(version) => log::info!("Version {}", version),
        Err(_) => log::warn!("Unknown version"),
    }

    let manager = Manager::new().await?;
    let engine = manager.clone().engine;
    manager.clone().spawn_background_thread();

    // Configure CORS
    let cors = CorsOptions {
        allowed_origins: AllowedOrigins::all(),
        allowed_methods: vec![Method::Get, Method::Post, Method::Put, Method::Delete]
            .into_iter()
            .map(From::from)
            .collect(),
        allow_credentials: true,
        ..Default::default()
    }
    .to_cors()?;

    let registry = Registry::new_custom(Some("playground".to_string()), None)?;
    manager.clone().metrics.register(registry.clone())?;
    let prometheus = PrometheusMetrics::with_registry(registry);
    let error = rocket::ignite()
        .register(catchers![playground::api::bad_request_catcher])
        .attach(cors)
        .attach(AdHoc::on_attach("github", |rocket| {
            let config = OAuthConfig::new(
                StaticProvider {
                    auth_uri: "https://github.com/login/oauth/authorize".into(),
                    token_uri: "https://github.com/login/oauth/access_token".into(),
                },
                engine.configuration.github_client_id,
                engine.secrets.github_client_secret,
                None,
            );
            Ok(rocket.attach(OAuth2::<GitHubUser>::custom(
                HyperSyncRustlsAdapter::default().basic_auth(false),
                config,
            )))
        }))
        .mount(
            "/api",
            routes![
                playground::api::get,
                playground::api::get_unlogged,
                // Users
                playground::api::get_user,
                playground::api::list_users,
                playground::api::create_user,
                playground::api::update_user,
                playground::api::delete_user,
                // Current Workspace
                playground::api::get_current_workspace,
                playground::api::create_current_workspace,
                playground::api::update_current_workspace,
                playground::api::delete_current_workspace,
                // Workspaces
                playground::api::get_workspace,
                playground::api::list_workspaces,
                playground::api::create_workspace,
                playground::api::update_workspace,
                playground::api::delete_workspace,
                // Repositories
                playground::api::get_repository,
                playground::api::list_repositories,
                playground::api::create_repository,
                playground::api::update_repository,
                playground::api::delete_repository,
                // Repository versions
                playground::api::get_repository_version,
                playground::api::list_repository_versions,
                playground::api::create_repository_version,
                playground::api::delete_repository_version,
                // Pools
                playground::api::get_pool,
                playground::api::list_pools,
                // Login
                playground::api::github_login,
                playground::api::post_install_callback,
                playground::api::login,
                playground::api::logout,
            ],
        )
        .mount("/metrics", prometheus)
        .manage(Context { manager })
        .launch();

    // Launch blocks unless an error is returned
    Err(error.into())
}
