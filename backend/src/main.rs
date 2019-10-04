#![feature(proc_macro_hygiene, decl_macro)]
#![deny(intra_doc_link_resolution_failure)]

mod api;
mod kubernetes;
mod utils;

use std::{collections::HashMap, env, path::Path, sync::Mutex};
use env_logger;
use log::{error, info};
use rocket::{routes, http::Method};
use rocket_contrib::serve::StaticFiles;
use rocket_cors::{AllowedOrigins, CorsOptions};
use serde::Deserialize;
use timer::Timer;

#[derive(Deserialize)]
struct Config {
    assets: String,
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

pub struct Context(pub HashMap<String, String>, pub Mutex<Timer>);

fn main() {
    // Initialize log configuration. Reads RUST_LOG if any, otherwise fallsback to `default`
    if env::var("RUST_LOG").is_err() {
        env::set_var("RUST_LOG", "info,kube=debug");
    }
    env_logger::init();

    // Load configuration from `Playground.toml`
    let config = read_config();
    let assets = env::var("PLAYGROUND_ASSETS").unwrap_or(config.assets);

    info!("Configuration:");
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

    let t = Mutex::new(Timer::new());
    rocket::ignite()
      .mount("/", StaticFiles::from(assets.as_str()))
      .mount("/api", routes![api::index, api::get])
      .manage(Context(config.images, t))
      .attach(cors).launch();
}