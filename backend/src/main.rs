#![feature(proc_macro_hygiene, decl_macro)]

#[macro_use] extern crate log;
#[macro_use] extern crate rocket;
#[macro_use] extern crate rocket_contrib;

mod api;
mod platform;
mod utils;

use crate::platform::{Wrapper, kubernetes};
use std::env;
use rocket::http::Method;
use rocket_contrib::serve::StaticFiles;
use rocket_cors::{AllowedOrigins, CorsOptions};

fn main() {
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
      .mount("/", StaticFiles::from("/static"))
      .mount("/api", routes![api::index, api::get])
      .manage(Wrapper(Box::new(kubernetes::K8s::new())))
      .attach(cors).launch();
}