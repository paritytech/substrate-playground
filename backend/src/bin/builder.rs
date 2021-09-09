use std::{env, error::Error, fs::OpenOptions, path::Path};

extern crate playground;

use playground::repository::{clone, read_and_parse_configuration};

// A simple implementation of `% touch path` (ignores existing files)
fn touch(path: &Path) -> std::io::Result<()> {
    match OpenOptions::new().create(true).write(true).open(path) {
        Ok(_) => Ok(()),
        Err(e) => Err(e),
    }
}


fn main() -> Result<(), Box<dyn Error>> {
    // Initialize log configuration. Reads `RUST_LOG` if any, otherwise fallsback to `default`
    if env::var("RUST_LOG").is_err() {
        env::set_var("RUST_LOG", "info");
    }

    touch(&Path::new("pg-test.txt")).unwrap_or_else(|why| {
        println!("! {:?}", why.kind());
    });

    clone()?;

    read_and_parse_configuration()?;

// Update state

    // trigger build


    // Prints basic details
    log::info!("Running");
    println!("error");
    Ok(())
}
