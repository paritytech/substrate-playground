#![feature(proc_macro_hygiene, decl_macro)]
#![deny(intra_doc_link_resolution_failure)]

mod api;
mod kubernetes;
mod utils;

use env_logger;
use log::{error, info};
use rocket::{http::Method, routes};
use rocket_contrib::serve::StaticFiles;
use rocket_cors::{AllowedOrigins, CorsOptions};
use rocket_prometheus::PrometheusMetrics;
use serde::Deserialize;
use std::{
    collections::HashMap,
    env,
    io::{Error, ErrorKind},
    path::Path,
    sync::Mutex,
};
use timer::Timer;

#[derive(Deserialize)]
struct Config {
    assets: String,
    images: HashMap<String, String>,
}

fn read_config() -> Config {
    let conf = match utils::read(&Path::new("Playground.toml")) {
        Err(why) => {
            error!("! {:?}", why.kind());
            std::process::exit(9)
        }
        Ok(s) => s,
    };
    toml::from_str(conf.as_str()).unwrap()
}

pub struct Context(
    pub String,
    pub String,
    pub HashMap<String, String>,
    pub Mutex<Timer>,
);

fn main() -> Result<(), Error> {
    // Initialize log configuration. Reads RUST_LOG if any, otherwise fallsback to `default`
    if env::var("RUST_LOG").is_err() {
        env::set_var("RUST_LOG", "info,kube=debug");
    }
    env_logger::init();

    // Load configuration from `Playground.toml`
    let config = read_config();
    let assets = env::var("PLAYGROUND_ASSETS").unwrap_or(config.assets);
    let namespace = env::var("K8S_NAMESPACE").map_err(|e| Error::new(ErrorKind::NotFound, e))?;
    let host = env::var("PLAYGROUND_HOST").map_err(|e| Error::new(ErrorKind::NotFound, e))?;

    info!("Configuration:");
    info!("assets: {}", assets);
    info!("host: {}", host);
    info!("namespace: {}", namespace);

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
    .to_cors()
    .unwrap();

    let prometheus = PrometheusMetrics::new();
    prometheus
        .registry()
        .register(Box::new(api::NEW_COUNTER.clone()))
        .unwrap();

    let t = Mutex::new(Timer::new());
    rocket::ignite()
        .mount("/", StaticFiles::from(assets.as_str()))
        .mount("/api", routes![api::index])
        .mount("/metrics", prometheus.clone())
        .manage(Context(host, namespace, config.images, t))
        .attach(prometheus)
        .attach(cors)
        .launch();

    Ok(())
}
