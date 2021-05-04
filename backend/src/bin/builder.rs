
use std::{env, error::Error};

extern crate playground;

use playground::api;

fn main() -> Result<(), Box<dyn Error>> {
    // Initialize log configuration. Reads `RUST_LOG` if any, otherwise fallsback to `default`
    if env::var("RUST_LOG").is_err() {
        env::set_var("RUST_LOG", "info");
    }

    // Prints basic details
    log::info!("Running");

    Ok(())
}
