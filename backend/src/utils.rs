//! A set of utilities.
//!

use std::io::{self, ErrorKind};
use std::process::Output;

pub fn output_result(result: io::Result<Output>) -> Result<String, String> {
    match result {
        Ok(output) => {
            if output.status.success() {
                Ok(String::from_utf8(output.stdout).expect("Failed to read stdout").trim().to_string())
            } else {
                Err(format!("{}", output.status))
            }
        },
        Err(err) => match err.kind() {
            ErrorKind::NotFound => Err("Not found".to_string()),
            _ => Err(format!("{}", err))
        }
    }
}