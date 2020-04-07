//! HTTP endpoints exposed in /api context

use crate::kubernetes;
use crate::Context;
use chrono::Duration;
use futures::executor::block_on;
use log::{info, warn};
use once_cell::sync::Lazy;
use rocket::{get, post, State};
use rocket_contrib::{json, json::JsonValue};
use rocket_prometheus::prometheus::{opts, IntCounterVec};
use tokio::runtime::Runtime;
use std::{thread, time::Duration as ODuration};

// Prometheus metrics definition

pub static DEPLOY_COUNTER: Lazy<IntCounterVec> = Lazy::new(|| {
    IntCounterVec::new(
        opts!("deploy_counter", "Count of deployments"),
        &["template", "user_uuid"],
    )
    .expect("Could not create lazy IntCounterVec")
});

pub static DEPLOY_FAILURES_COUNTER: Lazy<IntCounterVec> = Lazy::new(|| {
    IntCounterVec::new(
        opts!("deploy_failures_counter", "Count of deployment failures"),
        &["template"],
    )
    .expect("Could not create lazy IntCounterVec")
});

pub static UNDEPLOY_COUNTER: Lazy<IntCounterVec> = Lazy::new(|| {
    IntCounterVec::new(
        opts!("undeploy_counter", "Count of undeployments"),
        &["template", "user_uuid"],
    )
    .expect("Could not create lazy IntCounterVec")
});

pub static UNDEPLOY_FAILURES_COUNTER: Lazy<IntCounterVec> = Lazy::new(|| {
    IntCounterVec::new(
        opts!(
            "undeploy_failures_counter",
            "Count of undeployments failures"
        ),
        &["template", "user_uuid"],
    )
    .expect("Could not create lazy IntCounterVec")
});

#[get("/<user_uuid>")]
pub fn list(user_uuid: String) -> JsonValue {
    let mut runtime = Runtime::new().unwrap();
    match runtime.block_on(kubernetes::list(&user_uuid)) {
        Ok(names) => json!({"result": names}),
        Err(err) => json!({"error": err}),
    }
}

#[get("/<_user_uuid>/<instance_uuid>")]
pub fn get(_user_uuid: String, instance_uuid: String) -> JsonValue {
    let mut runtime = Runtime::new().unwrap();
    match runtime.block_on(kubernetes::get(&instance_uuid)) {
        Ok(phase) => json!({"result": phase}),
        Err(err) => json!({"error": err}),
    }
}

const DELAY_HOURS: i64 = 3;

/// Deploy `template` Docker container for `user_uuid`.
#[post("/<user_uuid>?<template>")]
pub fn deploy(state: State<'_, Context>, user_uuid: String, template: String) -> JsonValue {
    let host = state.0.clone();
    let mut runtime = Runtime::new().unwrap();
    match runtime.block_on(kubernetes::deploy(&host, &user_uuid, &template)) {
        Ok(instance_uuid) => {
            info!("Launched instance {} (template: {})", user_uuid, template);
            let delay = Duration::minutes(1); //Duration::hours(DELAY_HOURS);
            DEPLOY_COUNTER
                .with_label_values(&[&template, &user_uuid])
                .inc();
            let uuid2 = instance_uuid.clone();
            let timer = state.1.lock().unwrap();
            timer
                .schedule_with_delay(delay, move || {
                    info!("#Deleting! {}", instance_uuid);
                    if let Err(s) = block_on(kubernetes::undeploy(&host, &instance_uuid)) {
                        warn!("Failed to undeploy {}: {}", instance_uuid, s);
                        UNDEPLOY_FAILURES_COUNTER
                            .with_label_values(&[&template, &instance_uuid])
                            .inc();
                    } else {
                        UNDEPLOY_COUNTER
                            .with_label_values(&[&template, &instance_uuid])
                            .inc();
                    }
                })
                .ignore();
            let thread = thread::spawn(async move || {
                info!("New thread");
                loop {
                    info!("Loop!");
                    thread::sleep(ODuration::from_millis(1000));
                }
            });
            let mut guard = timer
                .schedule_repeating(Duration::seconds(3), || {
                    info!("#Ping!");
                })
                .ignore();
            json!({"result": uuid2})
        }
        Err(err) => {
            warn!("Error {}", err);
            DEPLOY_FAILURES_COUNTER
                .with_label_values(&[&template])
                .inc();
            json!({"error": err})
        }
    }
}
