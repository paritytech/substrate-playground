#![feature(async_closure, proc_macro_hygiene, decl_macro)]
#![deny(intra_doc_link_resolution_failure)]

mod api;
mod kubernetes;

use log::info;
use prometheus::Registry;
use rocket::{http::Method, routes};
use rocket_contrib::serve::StaticFiles;
use rocket_cors::{AllowedOrigins, CorsOptions};
use rocket_prometheus::PrometheusMetrics;
use std::{
    env,
    error::Error,
    io::{self, ErrorKind},
    sync::Mutex,
};
use timer::Timer;

pub struct Context(pub String, pub Mutex<Timer>);

fn main() -> Result<(), Box<dyn Error>> {
    // Initialize log configuration. Reads `RUST_LOG` if any, otherwise fallsback to `default`
    if env::var("RUST_LOG").is_err() {
        env::set_var("RUST_LOG", "info,kube=debug");
    }
    env_logger::init();

    // Load configuration from environment variables
    let host = env::var("PLAYGROUND_HOST").map_err(|e| io::Error::new(ErrorKind::NotFound, e))?;

    info!("Configuration:");
    info!("host: {}", host);

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

    // Register all prometeus metrics
    let registry = Registry::new_custom(Some("backend_api".to_string()), None)?;
    registry.register(Box::new(api::DEPLOY_COUNTER.clone()))?;
    registry.register(Box::new(api::DEPLOY_FAILURES_COUNTER.clone()))?;
    registry.register(Box::new(api::UNDEPLOY_COUNTER.clone()))?;
    registry.register(Box::new(api::UNDEPLOY_FAILURES_COUNTER.clone()))?;

    let prometheus = PrometheusMetrics::with_registry(registry);
    rocket::ignite()
        .attach(prometheus.clone())
        .mount("/", StaticFiles::from("./static"))
        .mount("/api", routes![api::deploy, api::get, api::list])
        .mount("/metrics", prometheus)
        .manage(Context(host, Mutex::new(Timer::new())))
        .attach(cors)
        .launch();

    Ok(())
}
