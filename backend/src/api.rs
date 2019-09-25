use crate::platform::Context;
use log::warn;
use rocket::{get, State};
use rocket_contrib::{json, json::{JsonValue}};

/// Starts a Docker container with `template` as parameter.
///
/// Returns a `JsonValue` with following shape:
/// - {"status" "ok"
///    "id"     "xxxx"}
///  if the container statup was successful
/// - {"status" "ko"
///    "reason" "xxxx"} if not
#[get("/new?<template>")]
pub fn index(state: State<'_, Context>, template: String) -> JsonValue {
    if let Some(image) = state.1.get(&template) {
        let result = state.0.deploy(image);
        match result {
            Ok(id) => json!({"status": "ok", "id": id}),
            Err(err) => {
                warn!("Error {}", err);
                json!({"status": "ko", "reason": err})
            }
        }
    } else {
        warn!("Unkown image {}", template);
        json!({"status": "ko", "reason": format!("Unknown template <{}>", template)})
    }
}

/// Access the URL of a running container identified by `id`.
///
/// Returns a `JsonValue` with following shape:
/// - {"status" "ok"
///    "id"    "xxxx"}
///  if the container statup was successful
/// - {"status" "ko"
///    "reason" "xxxx"} if not
#[get("/url?<id>")]
pub fn get(platform: State<'_, Context>, id: String) -> JsonValue {
    let result = platform.0.url(&id.to_string());
    match result {
        Ok(id) => json!({"status": "ok", "URL": id}),
        Err(err) => json!({"status": "ko", "reason": err})
    }
}