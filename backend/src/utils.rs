//! A set of utilities.
//!

use std::fs::File;
use std::io::{self, ErrorKind};
use std::io::prelude::*;
use std::process::Output;
use std::path::Path;

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

pub fn read(path: &Path) -> io::Result<String> {
    let mut f = File::open(path)?;
    let mut s = String::new();
    match f.read_to_string(&mut s) {
        Ok(_) => Ok(s),
        Err(e) => Err(e),
    }
}