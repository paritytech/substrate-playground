extern crate playground;

use playground::{
    error::{Error, Result},
    kubernetes::repository::{update_repository, update_repository_version_state},
    types::{RepositoryUpdateConfiguration, RepositoryVersionState},
    utils::devcontainer::{exec, parse_devcontainer, read_devcontainer},
};
use std::env;

async fn build(repository_id: &str, id: &str, path: &str) -> Result<()> {
    update_repository_version_state(
        repository_id,
        id,
        &RepositoryVersionState::Cloning { progress: 100 },
    )
    .await?;

    let devcontainer_json = read_devcontainer(path)?;
    let conf = parse_devcontainer(&devcontainer_json)?;

    // Trigger eventual build based on Configuration
    if let Some(on_create_command) = conf.on_create_command {
        log::debug!("Executing {}", on_create_command);

        update_repository_version_state(
            repository_id,
            id,
            &RepositoryVersionState::Building {
                progress: 0,
                devcontainer_json: devcontainer_json.clone(),
            },
        )
        .await?;

        // Fail if at least a build command failed
        match exec(path, on_create_command.clone()) {
            Ok(result) if !result.status.success() => {
                return Err(Error::Failure(format!(
                    "Failure during build {:?}: ",
                    result
                )))
            }
            Err(err) => {
                return Err(Error::Failure(format!(
                    "Failed to execute {}: {}",
                    on_create_command, err
                )))
            }
            Ok(result) => {
                log::debug!("Execution result: {:?}: ", result);
            }
        }
    }

    update_repository_version_state(
        repository_id,
        id,
        &RepositoryVersionState::Ready {
            devcontainer_json: devcontainer_json.clone(),
        },
    )
    .await?;

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

    let args: Vec<String> = env::args().collect();
    if let (Some(repository_id), Some(id), Some(path)) = (args.get(1), args.get(2), args.get(3)) {
        if let Err(err) = build(repository_id, id, path).await {
            log::error!("Error during build for {}/{}: {}", repository_id, id, err);

            // Build failed, update the version accordingly
            if let Err(err) = update_repository_version_state(
                repository_id,
                id,
                &RepositoryVersionState::Failed {
                    message: err.to_string(),
                },
            )
            .await
            {
                log::error!("Failed to set current version for {}/{}: {}", repository_id, id, err);
            }
        } else {
            log::info!("Succesfully built {}/{}", repository_id, id);
        }
    } else {
        log::error!("Incorrect args, must be <bin> ID REPOSITORY_ID PATH");
    }
}
