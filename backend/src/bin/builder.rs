extern crate playground;

use clap::Parser;
use playground::{
    error::Result,
    kubernetes::repository::{get_repository, update_repository, update_repository_version_state},
    types::{RepositoryUpdateConfiguration, RepositoryVersionState},
    utils::{
        devcontainer::{exec, parse_devcontainer, read_devcontainer},
        git::clone,
    },
};
use std::env;

#[derive(Parser, Debug)]
#[clap(about, version, author)]
struct Args {
    #[clap(short, long)]
    repository_id: String,

    #[clap(short, long)]
    id: String,

    /// Number of times to greet
    #[clap(short, long, default_value_t = String::from(".clone"))]
    path: String,
}

#[rocket::main]
async fn main() -> Result<()> {
    // Initialize log configuration. Reads `RUST_LOG` if any, otherwise fallsback to `default`
    if env::var("RUST_LOG").is_err() {
        env::set_var("RUST_LOG", "warn,builder=info");
    }
    env_logger::init();

    let args = Args::parse();
    let repository_id = args.repository_id;
    let id = args.id;

    // https://github.com/substrate-developer-hub/substrate-node-template

    // https://stackoverflow.com/questions/41081240/idiomatic-callbacks-in-rust

    update_repository_version_state(
        &repository_id,
        &id,
        &RepositoryVersionState::Cloning { progress: 0 },
    )
    .await?;

    let repository = get_repository(&repository_id).await?.unwrap();
    clone(args.path.clone(), repository.url)?;

    let devcontainer_json = read_devcontainer(args.path.clone())?;

    update_repository_version_state(
        &repository_id,
        &id,
        &RepositoryVersionState::Building {
            progress: 0,
            devcontainer_json: devcontainer_json.clone(),
        },
    )
    .await?;

    let conf = parse_devcontainer(&devcontainer_json)?;

    // TODO Attach conf to volume

    // Trigger eventual build based on Configuration
    if let Some(on_create_command) = conf.on_create_command {
        // TODO starts new job doing build if needed

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

    // Update current version so that it matches this newly created version
    update_repository(
        &repository_id,
        RepositoryUpdateConfiguration {
            current_version: Some(id.to_string()),
        },
    )
    .await?;

    Ok(())
}
