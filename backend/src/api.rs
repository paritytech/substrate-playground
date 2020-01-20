//! HTTP endpoints exposed in /api context

use crate::kubernetes;
use crate::Context;
use chrono;
use log::{info, warn};
use once_cell::sync::Lazy;
use rocket::{get, State};
use rocket_contrib::{json, json::JsonValue};
use rocket_prometheus::prometheus::{opts, IntCounterVec};

pub static NEW_COUNTER: Lazy<IntCounterVec> = Lazy::new(|| {
    IntCounterVec::new(opts!("new_counter", "Count of /new calls"), &["new"])
        .expect("Could not create lazy IntCounterVec")
});

/// Starts a Docker container with `template` as parameter.
///
/// Returns a `JsonValue` with following shape:
/// - {"status" "ok"
///    "uuid"     "xxxx"}
///  if the container statup was successful
/// - {"status" "ko"
///    "reason" "xxxx"} if not
#[get("/new?<template>")]
pub fn index(state: State<'_, Context>, template: String) -> JsonValue {
    NEW_COUNTER.with_label_values(&[&template]).inc();
    if let Some(image) = state.2.get(&template) {
        let host = state.0.clone();
        let namespace = state.1.clone();
        match kubernetes::deploy(&host, &namespace, image) {
            Ok(uuid) => {
                info!("Launched image {} (template: {})", uuid, template);
                let uuid2 = uuid.clone();
                state
                    .3
                    .lock()
                    .unwrap()
                    .schedule_with_delay(chrono::Duration::hours(3), move || {
                        info!("#Deleting! {}", uuid2);
                        if let Err(s) = kubernetes::undeploy(&host, &namespace, uuid2.as_str()) {
                            warn!("Failed to undeploy {}: {}", uuid2, s);
                        }
                    })
                    .ignore();
                json!({"status": "ok", "uuid": uuid})
            }
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
