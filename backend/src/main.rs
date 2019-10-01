#![feature(proc_macro_hygiene, decl_macro)]
#![deny(intra_doc_link_resolution_failure)]

mod api;
mod platform;
mod utils;

use crate::platform::Context;
use std::collections::HashMap;
use std::env;
use std::path::Path;
use env_logger;
use log::{error, info, warn};
use rocket::routes;
use rocket::http::Method;
use rocket_contrib::serve::StaticFiles;
use rocket_cors::{AllowedOrigins, CorsOptions};
use serde::Deserialize;

#[derive(Deserialize)]
struct Config {
    assets: String,
    platform: String,
    images: HashMap<String, String>
}

fn read_config() -> Config {
    let conf = match utils::read(&Path::new("Playground.toml")) {
        Err(why) => {
            error!("! {:?}", why.kind());
            std::process::exit(9)
        },
        Ok(s) => s
    };
    toml::from_str(conf.as_str()).unwrap()
}

fn main() {
    // Initialize log configuration. Reads RUST_LOG if any, otherwise fallsback to `default`
    if env::var("RUST_LOG").is_err() {
        env::set_var("RUST_LOG", "info,kube=debug");
    }
    env_logger::init();

    // Load configuration from `Playground.toml`
    let config = read_config();
    let assets = env::var("PLAYGROUND_ASSETS").unwrap_or(config.assets);

    let platform = match platform::platform_for(config.platform.as_str()) {
        None => {
            warn!("! No platform with name {}", config.platform);
            std::process::exit(9)
        },
        Some(o) => o
    };

    info!("Configuration:");
    info!("platform: {}", config.platform);
    info!("assets: {}", assets);

    // Configure CORS
    let allowed_origins = AllowedOrigins::All;
    let cors = CorsOptions {
        allowed_origins,
        allowed_methods: vec![Method::Get].into_iter().map(From::from).collect(),
        //allowed_headers: AllowedHeaders::some(&["Authorization", "Accept"]),
        allow_credentials: true,
        ..Default::default()
    }.to_cors().unwrap();

    rocket::ignite()
      .mount("/", StaticFiles::from(assets.as_str()))
      .mount("/api", routes![api::index, api::get])
      .manage(Context(platform, config.images))
      .attach(cors).launch();
}