use crate::platform::Wrapper;
use log::warn;
use rocket::{get, State};
use rocket_contrib::{json, json::{JsonValue}};

fn image_for(template: &str) -> Option<&str> {
    match template {
        "default" => Some("jeluard/theia-substrate:next"),
        _ => None
    }
}

/// Starts a Docker container with `template` as parameter.
///
/// Returns a `JsonValue` with following shape:
/// - {"status" "ok"
///     "id"    "xxxx"}
///  if the container statup was successful
/// - {"status" "ko"} if not
#[get("/new?<template>")]
pub fn index(platform: State<'_, Wrapper>, template: String) -> JsonValue {
    if let Some(image) = image_for(template.as_str()) {
        let result = platform.0.deploy(image);
        match result {
            Ok(id) => json!({"status": "ok", "id": id}),
            Err(err) => {
                warn!("Error {}", err);
                json!({"status": "ko", "reason": err})
            }
        }
    } else {
        warn!("ssd");
        json!({"status": "ko", "reason": format!("Unknown template <{}>", template)})
    }
}

#[get("/<id>")]
pub fn get(platform: State<'_, Wrapper>, id: String) -> JsonValue {
    let result = platform.0.url(&id.to_string());
    match result {
        Ok(id) => json!({"status": "ok", "URL": id}),
        Err(err) => json!({"status": "ko", "reason": err})
    }
}