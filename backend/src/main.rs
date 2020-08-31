#![feature(async_closure, proc_macro_hygiene, decl_macro)]
#![deny(intra_doc_link_resolution_failure)]

mod api;
mod kubernetes;
mod manager;
mod metrics;
mod template;

use crate::api::GitHubUserInfo;
use crate::manager::Manager;
use rocket::fairing::AdHoc;
use rocket::{config::Environment, http::Method, routes};
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
        env::set_var("RUST_LOG", "warn");
    }
    env_logger::init();

    // Configure CORS
    let allowed_origins = AllowedOrigins::All;
    let cors = CorsOptions {
        allowed_origins,
        allowed_methods: vec![Method::Get].into_iter().map(From::from).collect(),
        //TODO only from host
        //allowed_headers: AllowedHeaders::some(&["Authorization", "Accept"]),
        allow_credentials: true,
        ..Default::default()
    }
    .to_cors()?;

    log::info!("Running in {:?} mode", Environment::active()?);
    let version = env::var("GITHUB_SHA")?;
    println!("Version {:?}", version);

    let manager = Manager::new().await?;

    let client_id = env::var("GITHUB_CLIENT_ID")?;
    let client_secret = env::var("GITHUB_CLIENT_SECRET")?;

    manager.clone().spawn_background_thread();
    let prometheus = PrometheusMetrics::with_registry(manager.clone().metrics.create_registry()?);
    let error = rocket::ignite()
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
                api::get_user_instance,
                api::get_user_instance_unlogged,
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
