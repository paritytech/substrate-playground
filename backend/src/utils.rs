//! A set of utilities.
//!

use std::{fs::File, io::{self, prelude::*}, path::Path};

pub fn read(path: &Path) -> io::Result<String> {
    let mut f = File::open(path)?;
    let mut s = String::new();
    match f.read_to_string(&mut s) {
        Ok(_) => Ok(s),
        Err(e) => Err(e),
    }
}