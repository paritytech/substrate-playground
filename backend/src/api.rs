//! HTTP endpoints exposed in /api context

use crate::Context;
use log::{info, warn};
use rocket::{get, post, State};
use rocket_contrib::{json, json::JsonValue};
use serde::{Deserialize, Serialize};

// TODO add image templates endpoint

fn result_to_jsonrpc<T: Serialize>(res: Result<T, String>) -> JsonValue {
    match res {
        Ok(val) => json!({ "result": val }),
        Err(err) => json!({ "error": err }),
    }
}

#[get("/<user_uuid>")]
pub fn list(state: State<'_, Context>, user_uuid: String) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.list(&user_uuid))
}

#[get("/<user_uuid>/<instance_uuid>")]
pub fn get(state: State<'_, Context>, user_uuid: String, instance_uuid: String) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.get(&user_uuid, &instance_uuid))
}

/// Deploy `template` Docker container for `user_uuid`.
#[post("/<user_uuid>?<template>")]
pub fn deploy(state: State<'_, Context>, user_uuid: String, template: String) -> JsonValue {
    let manager = state.manager.clone();
    result_to_jsonrpc(manager.deploy(&user_uuid, &template))

    /*
    let host = state.host.clone();
    let mut runtime = Runtime::new().unwrap();
    match runtime.block_on(kubernetes::deploy(&host, &user_uuid, &template)) {
        Ok(instance_uuid) => {
            info!("Launched instance {} (template: {})", user_uuid, template);

            let uuid2 = instance_uuid.clone();
            /*let timer = state.timer.lock().unwrap();
            timer
                .schedule_with_delay(delay, move || {
                    info!("#Deleting! {}", instance_uuid);
                    if let Err(s) = block_on(kubernetes::undeploy(&host, &instance_uuid)) {
                        warn!("Failed to undeploy {}: {}", instance_uuid, s);
                        metrics::inc_undeploy_failures_counter(&template, &user_uuid);
                    } else {
                        metrics::inc_undeploy_counter(&template, &user_uuid);
                    }
                })
                .ignore();*/
            json!({ "result": uuid2 })
        }
        Err(err) => {
            warn!("Error {}", err);

            json!({ "error": err })
        }
    }*/
}
