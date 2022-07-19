extern crate playground;

use clap::Parser;
use playground::{
    error::{Error, Result},
    kubernetes::repository::{update_repository, update_repository_version_state},
    types::{RepositoryUpdateConfiguration, RepositoryVersionState},
    utils::{
        devcontainer::{exec, parse_devcontainer, read_devcontainer},
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

async fn build(repository_id: &str, id: &str, path: &str) -> Result<()> {
    let devcontainer_json = read_devcontainer(path)?;

    update_repository_version_state(
        repository_id,
        id,
        &RepositoryVersionState::Building {
            progress: 0,
            devcontainer_json: devcontainer_json.clone(),
        },
    )
    .await?;

    let conf = parse_devcontainer(&devcontainer_json)?;

    // Trigger eventual build based on Configuration
    if let Some(on_create_command) = conf.on_create_command {
        // Fail if at least a build command failed
        match exec(path, on_create_command.clone()) {
            Ok(result) if !result.status.success() => {
                return Err(Error::Failure("Failure during build".to_string()))
            }
            Err(err) => {
                return Err(Error::Failure(format!(
                    "Failed to execute {}: {}",
                    on_create_command, err
                )))
            }
            _ => (),
        }
    }

    // Update current version so that it matches this newly created version
    update_repository(
        repository_id,
        RepositoryUpdateConfiguration {
            current_version: Some(id.to_string()),
        },
    )
    .await?;

    Ok(())
}

#[rocket::main]
async fn main() {
    // Initialize log configuration. Reads `RUST_LOG` if any, otherwise fallsback to `default`
    if env::var("RUST_LOG").is_err() {
        env::set_var("RUST_LOG", "warn,builder=info");
    }
    env_logger::init();

    let args = Args::parse();
    let repository_id = args.repository_id;
    let id = args.id;
    if let Err(err) = build(&repository_id, &id, &args.path).await {
        // Build failed, update the version accordingly
        if let Err(err) = update_repository_version_state(
            &repository_id,
            &id,
            &RepositoryVersionState::Failed {
                message: err.to_string(),
            },
        )
        .await
        {
            log::error!("Failed to set current version: {}", err);
        }
    }
}
