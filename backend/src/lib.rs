#![feature(async_closure, proc_macro_hygiene, decl_macro)]

pub mod api;
pub mod error;
pub mod github;
pub mod kubernetes;
pub mod kubernetes_utils;
pub mod manager;
pub mod metrics;
pub mod prometheus;
pub mod types;

use crate::manager::Manager;

pub struct Context {
    pub manager: Manager,
}
