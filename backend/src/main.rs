#![feature(proc_macro_hygiene, decl_macro)]

mod api;
mod platform;
mod utils;

use crate::platform::{Wrapper, kubernetes};
use std::collections::HashMap;
use std::fs::File;
use std::io;
use std::io::prelude::*;
use std::path::Path;
use rocket::routes;
use rocket::http::Method;
use rocket_contrib::serve::StaticFiles;
use rocket_cors::{AllowedOrigins, CorsOptions};
use serde::Deserialize;

#[derive(Deserialize)]
struct Config {
    assets: String,
    images: HashMap<String, String>
}

fn read(path: &Path) -> io::Result<String> {
    let mut f = File::open(path)?;
    let mut s = String::new();
    match f.read_to_string(&mut s) {
        Ok(_) => Ok(s),
        Err(e) => Err(e),
    }
}

fn read_config() -> Config {
    let conf = match read(&Path::new("Playground.toml")) {
        Err(why) => {
            println!("! {:?}", why.kind());
            std::process::exit(9)
        },
        Ok(s) => s
    };
    toml::from_str(conf.as_str()).unwrap()
}

fn main() {
    let config = read_config();

    let allowed_origins = AllowedOrigins::All;

    // You can also deserialize this
    let cors = CorsOptions {
        allowed_origins,
        allowed_methods: vec![Method::Get].into_iter().map(From::from).collect(),
        //allowed_headers: AllowedHeaders::some(&["Authorization", "Accept"]),
        allow_credentials: true,
        ..Default::default()
    }.to_cors().unwrap();
    rocket::ignite()
      .mount("/", StaticFiles::from(config.assets.as_str()))
      .mount("/api", routes![api::index, api::get])
      .manage(Wrapper(Box::new(kubernetes::K8s::new())))
      .attach(cors).launch();
}