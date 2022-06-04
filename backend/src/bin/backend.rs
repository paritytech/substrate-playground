#![feature(async_closure, proc_macro_hygiene, decl_macro)]

extern crate playground;

use ::prometheus::Registry;
use playground::kubernetes::{get_configuration, get_secrets};
use playground::manager::Manager;
use playground::prometheus::PrometheusMetrics;
use playground::Context;
use rocket::{catchers, routes};
use std::env;

#[rocket::main]
async fn main() {
    // Initialize log configuration. Reads `RUST_LOG` if any, otherwise fallsback to `default`
    if env::var("RUST_LOG").is_err() {
        env::set_var("RUST_LOG", "info");
    }
    env_logger::init();

    match env::var("GITHUB_SHA") {
        Ok(version) => log::info!("Version {}", version),
        Err(_) => log::warn!("Unknown version"),
    }

    let manager = Manager::new().await.unwrap();
    manager.spawn_session_reaper_thread().await.unwrap();

    log::info!("Spawned session reaper thread");

    let configuration = get_configuration().await.unwrap();
    let secrets = get_secrets().await.unwrap();
    let registry = Registry::new_custom(Some("playground".to_string()), None).unwrap();
    manager.clone().metrics.register(registry.clone()).unwrap();
    let prometheus = PrometheusMetrics::with_registry(registry);
    let _ = rocket::build()
        .register("/", catchers![playground::api::bad_request_catcher])
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
                // Sessions
                playground::api::get_session,
                playground::api::list_sessions,
                playground::api::create_session,
                playground::api::update_session,
                playground::api::delete_session,
                playground::api::create_session_execution,
                // Roles
                playground::api::get_role,
                playground::api::list_roles,
                playground::api::create_role,
                playground::api::update_role,
                playground::api::delete_role,
                // Repositories
                playground::api::get_repository,
                playground::api::list_repositories,
                playground::api::create_repository,
                playground::api::update_repository,
                playground::api::delete_repository,
                // Templates
                playground::api::list_templates,
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
        .manage(Context {
            manager,
            configuration,
            secrets,
        })
        .launch()
        .await
        .unwrap();
}
