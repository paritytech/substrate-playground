#![feature(async_closure, decl_macro, proc_macro_hygiene, result_flattening)]

pub mod api;
pub mod error;
pub mod kubernetes;
pub mod manager;
pub mod metrics;
pub mod prometheus;
pub mod types;
pub mod utils;

use types::{Configuration, Secrets};

use crate::manager::Manager;

pub struct Context {
    pub manager: Manager,
    pub configuration: Configuration,
    pub secrets: Secrets,
}
