//! HTTP endpoints exposed in /api context
//! 

use crate::kubernetes;
use crate::Context;
use log::{info, warn};
use rocket::{get, State};
use rocket_contrib::{json, json::{JsonValue}};
use chrono;

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
    if let Some(image) = state.0.get(&template) {
        match kubernetes::deploy(image) {
            Ok(id) => {
                info!("Launched image {} (template: {})", id, template);
                let id2 = id.clone();
                state.1.lock().unwrap().schedule_with_delay(chrono::Duration::hours(3), move || {
                    info!("#Deleting! {}", id2);
                    if let Err(s) = kubernetes::undeploy(id2.as_str()) {
                        warn!("Failed to undeploy {}: {}", id2, s);
                    }
                }).ignore();
                json!({"status": "ok", "id": id})
            },
            Err(err) => {
                warn!("Error {}", err);
                json!({"status": "ko", "reason": err})
            }
        }
    } else {
        warn!("Unkown template {}", template);
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
pub fn get(id: String) -> JsonValue {
    let result = kubernetes::url(&id.to_string());
    match result {
        Ok(id) => {
            if id.is_empty() {
                json!({"status": "pending"})
            } else {
                json!({"status": "ok", "URL": id})
            }
        },
        Err(err) => json!({"status": "ko", "reason": err})
    }
}