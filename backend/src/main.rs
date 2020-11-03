#![feature(async_closure, proc_macro_hygiene, decl_macro)]
#![deny(broken_intra_doc_links)]

mod api;
mod kubernetes;
mod manager;
mod metrics;
mod template;

use crate::api::GitHubUserInfo;
use crate::manager::Manager;
use rocket::fairing::AdHoc;
use rocket::{catchers, config::Environment, http::Method, routes};
use rocket_cors::{AllowedOrigins, CorsOptions};
use rocket_oauth2::{HyperSyncRustlsAdapter, OAuth2, OAuthConfig, StaticProvider};
use rocket_prometheus::PrometheusMetrics;
use std::{env, error::Error};

pub struct Context {
    manager: Manager,
}

/// manager -> kubernetes, metrics
/// manager is injected into api
#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // Initialize log configuration. Reads `RUST_LOG` if any, otherwise fallsback to `default`
    if env::var("RUST_LOG").is_err() {
        env::set_var("RUST_LOG", "info");
    }
    env_logger::init();

    // Prints basic details

    log::info!("Running in {:?} mode", Environment::active()?);

    match env::var("GITHUB_SHA") {
        Ok(version) => log::info!("Version {}", version),
        Err(_) => log::warn!("Unknown version"),
    }

    let client_id = env::var("GITHUB_CLIENT_ID").map_err(|_| "GITHUB_CLIENT_ID must be set")?;
    let client_secret =
        env::var("GITHUB_CLIENT_SECRET").map_err(|_| "GITHUB_CLIENT_SECRET must be set")?;

    let manager = Manager::new().await?;
    let engine = manager.clone().engine;
    let host = engine.host;
    let namespace = engine.namespace;
    manager.clone().spawn_background_thread();

    log::info!("Host {} {}", host, namespace);

    // Configure CORS
    let cors = CorsOptions {
        allowed_origins: AllowedOrigins::some_regex(&[
            format!("https?://{}", host),
            format!("^https?://(.+).{}$", host),
        ]),
        allowed_methods: vec![Method::Get, Method::Delete]
            .into_iter()
            .map(From::from)
            .collect(),
        allow_credentials: true,
        ..Default::default()
    }
    .to_cors()?;

    let prometheus = PrometheusMetrics::with_registry(manager.clone().metrics.create_registry()?);
    let error = rocket::ignite()
        .register(catchers![api::bad_request_catcher])
        .attach(prometheus.clone())
        .attach(cors)
        .attach(AdHoc::on_attach("github", |rocket| {
            let config = OAuthConfig::new(
                StaticProvider {
                    auth_uri: "https://github.com/login/oauth/authorize".into(),
                    token_uri: "https://github.com/login/oauth/access_token".into(),
                },
                client_id,
                client_secret,
                None,
            );
            Ok(rocket.attach(OAuth2::<GitHubUserInfo>::custom(
                HyperSyncRustlsAdapter::default().basic_auth(false),
                config,
            )))
        }))
        .mount(
            "/api",
            routes![
                api::deploy,
                api::deploy_unlogged,
                api::get,
                api::get_unlogged,
                api::github_login,
                api::logout,
                api::post_install_callback,
                api::undeploy,
                api::undeploy_unlogged,
            ],
        )
        .mount("/metrics", prometheus)
        .manage(Context { manager })
        .launch();

    // Launch blocks unless an error is returned
    Err(error.into())
}
