extern crate playground;

use clap::Parser;
use playground::repository::{clone, exec, read_and_parse_devcontainer};
use std::{env, error::Error};

enum RepositoryBuildProgress {
    Cloning,
    Building,
    Done,
}

fn report_progress(progress: RepositoryBuildProgress) {
    match progress {
        RepositoryBuildProgress::Cloning => log::info!("Cloning"),
        RepositoryBuildProgress::Building => log::info!("Building"),
        RepositoryBuildProgress::Done => log::info!("Done"),
    }
}

#[derive(Parser, Debug)]
#[clap(about, version, author)]
struct Args {
    /// Name of the person to greet
    #[clap(short, long)]
    url: String,

    /// Number of times to greet
    #[clap(short, long, default_value_t = String::from(".clone"))]
    path: String,
}

fn main() -> Result<(), Box<dyn Error>> {
    // Initialize log configuration. Reads `RUST_LOG` if any, otherwise fallsback to `default`
    if env::var("RUST_LOG").is_err() {
        env::set_var("RUST_LOG", "warn,builder=info");
    }
    env_logger::init();

    let args = Args::parse();

    // https://github.com/substrate-developer-hub/substrate-node-template

    // Clone repository
    report_progress(RepositoryBuildProgress::Cloning);

    // https://stackoverflow.com/questions/41081240/idiomatic-callbacks-in-rust

    clone(args.path.clone(), args.url)?;

    let conf = read_and_parse_devcontainer(args.path.clone())?;

    // Trigger eventual build based on Configuration
    if let Some(on_create_command) = conf.on_create_command {
        report_progress(RepositoryBuildProgress::Building);

        // Fail if at least a build command failed
        let results = exec(args.path, on_create_command);
        if results
            .iter()
            .any(|result| result.is_err() || !result.as_ref().unwrap().status.success())
        {
            // See https://www.joshmcguigan.com/blog/custom-exit-status-codes-rust/
            log::error!("Failed");
            std::process::exit(0);
        }
    }

    report_progress(RepositoryBuildProgress::Done);

    Ok(())
}
