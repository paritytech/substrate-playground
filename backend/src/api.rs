//! HTTP endpoints exposed in /api context

use crate::kubernetes;
use crate::Context;
use chrono;
use log::{info, warn};
use once_cell::sync::Lazy;
use rocket::{get, State};
use rocket_contrib::{json, json::JsonValue};
use rocket_prometheus::prometheus::{opts, IntCounterVec};

// Prometheus metrics definition

pub static UNKNOWN_TEMPLATE_COUNTER: Lazy<IntCounterVec> = Lazy::new(|| {
    IntCounterVec::new(opts!("unknown_template_counter", "Count of unknown template"), &["template"])
        .expect("Could not create lazy IntCounterVec")
});

pub static DEPLOY_COUNTER: Lazy<IntCounterVec> = Lazy::new(|| {
    IntCounterVec::new(opts!("deploy_counter", "Count of deployments"), &["template", "uuid"])
        .expect("Could not create lazy IntCounterVec")
});

pub static DEPLOY_FAILURES_COUNTER: Lazy<IntCounterVec> = Lazy::new(|| {
    IntCounterVec::new(opts!("deploy_failures_counter", "Count of deployment failures"), &["template"])
        .expect("Could not create lazy IntCounterVec")
});

pub static UNDEPLOY_COUNTER: Lazy<IntCounterVec> = Lazy::new(|| {
    IntCounterVec::new(opts!("undeploy_counter", "Count of undeployments"), &["template", "uuid"])
        .expect("Could not create lazy IntCounterVec")
});

pub static UNDEPLOY_FAILURES_COUNTER: Lazy<IntCounterVec> = Lazy::new(|| {
    IntCounterVec::new(opts!("undeploy_failures_counter", "Count of undeployments failures"), &["template", "uuid"])
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
    if let Some(image) = state.2.get(&template) {
        let host = state.0.clone();
        let namespace = state.1.clone();
        match kubernetes::deploy(&host, &namespace, image) {
            Ok(uuid) => {
                info!("Launched image {} (template: {})", uuid, template);
                DEPLOY_COUNTER.with_label_values(&[&template, &uuid]).inc();
                let uuid2 = uuid.clone();
                state
                    .3
                    .lock()
                    .unwrap()
                    .schedule_with_delay(chrono::Duration::hours(3), move || {
                        info!("#Deleting! {}", uuid2);
                        if let Err(s) = kubernetes::undeploy(&host, &namespace, &uuid2) {
                            warn!("Failed to undeploy {}: {}", uuid2, s);
                            UNDEPLOY_FAILURES_COUNTER.with_label_values(&[&template, &uuid2]).inc();
                        } else {
                            UNDEPLOY_COUNTER.with_label_values(&[&template, &uuid2]).inc();
                        }
                    })
                    .ignore();
                json!({"status": "ok", "uuid": uuid})
            }
            Err(err) => {
                warn!("Error {}", err);
                DEPLOY_FAILURES_COUNTER.with_label_values(&[&template]).inc();
                json!({"status": "ko", "reason": err})
            }
        }
    } else {
        warn!("Unkown template {}", template);
        UNKNOWN_TEMPLATE_COUNTER.with_label_values(&[&template]).inc();
        json!({"status": "ko", "reason": format!("Unknown template <{}>", template)})
    }
}
