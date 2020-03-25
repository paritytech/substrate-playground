//! HTTP endpoints exposed in /api context

use crate::kubernetes;
use crate::Context;
use futures::executor::block_on;
use log::{info, warn};
use once_cell::sync::Lazy;
use rocket::{get, post, State};
use rocket_contrib::{json, json::JsonValue};
use rocket_prometheus::prometheus::{opts, IntCounterVec};
use tokio::runtime::Runtime;

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

/// Deploy `image_id` Docker container for `user_uuid`.
///
/// Returns a `JsonValue` with following shape:
/// - {"status" "ok"
///    "uuid"     "xxxx"}
///  if the container statup was successful
/// - {"status" "ko"
///    "reason" "xxxx"} if not
#[get("/<user_uuid>")]
pub fn list(user_uuid: String) -> JsonValue {
    let mut runtime = Runtime::new().unwrap();
    match runtime.block_on(kubernetes::list(&user_uuid)) {
        Ok(names) => {
            json!({"status": "ok", "names": names})
        }
        Err(err) => {
            json!({"status": "ko", "reason": err})
        }
    }
}

/// Deploy `image_id` Docker container for `user_uuid`.
///
/// Returns a `JsonValue` with following shape:
/// - {"status" "ok"
///    "uuid"     "xxxx"}
///  if the container statup was successful
/// - {"status" "ko"
///    "reason" "xxxx"} if not
#[post("/<user_uuid>/<image_id>")]
pub fn deploy(state: State<'_, Context>, user_uuid: String, image_id: String) -> JsonValue {
    let host = state.0.clone();
    let mut runtime = Runtime::new().unwrap();
    match runtime.block_on(kubernetes::deploy(&host, &user_uuid, &image_id)) {
        Ok(instance_uuid) => {
            info!("Launched instance {} (template: {})", user_uuid, image_id);
            DEPLOY_COUNTER.with_label_values(&[&image_id, &user_uuid]).inc();
            let uuid2 = instance_uuid.clone();
            state
                .1
                .lock()
                .unwrap()
                .schedule_with_delay(chrono::Duration::hours(3), move || {
                    info!("#Deleting! {}", instance_uuid);
                    if let Err(s) = block_on(kubernetes::undeploy(&host, &instance_uuid)) {
                        warn!("Failed to undeploy {}: {}", instance_uuid, s);
                        UNDEPLOY_FAILURES_COUNTER
                            .with_label_values(&[&image_id, &instance_uuid])
                            .inc();
                    } else {
                        UNDEPLOY_COUNTER
                            .with_label_values(&[&image_id, &instance_uuid])
                            .inc();
                    }
                })
                .ignore();
            json!({"status": "ok", "uuid": uuid2})
        }
        Err(err) => {
            warn!("Error {}", err);
            DEPLOY_FAILURES_COUNTER
                .with_label_values(&[&image_id])
                .inc();
            json!({"status": "ko", "reason": err})
        }
    }
}
