extern crate playground;

use clap::Parser;
use k8s_openapi::api::{
    batch::v1::{Job, JobSpec},
    core::v1::{
        Container, PersistentVolumeClaimVolumeSource, PodSpec, PodTemplateSpec, Volume, VolumeMount,
    },
};
use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;
use kube::api::{Api, PostParams};
use playground::{
    error::{Error, Result},
    kubernetes::{
        backend_pod, client, docker_image_name,
        repository::{get_repository, update_repository_version_state, volume_template_name},
    },
    types::RepositoryVersionState,
    utils::git::clone,
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

async fn clone_and_build(repository_id: &str, id: &str, path: &str) -> Result<()> {
    update_repository_version_state(
        repository_id,
        id,
        &RepositoryVersionState::Cloning { progress: 0 },
    )
    .await?;

    let repository = get_repository(repository_id).await?.unwrap();
    clone(path, repository.url)?;

    update_repository_version_state(
        repository_id,
        id,
        &RepositoryVersionState::Cloning { progress: 100 },
    )
    .await?;

    build(repository_id, id).await?;

    Ok(())
}

async fn build(repository_id: &str, id: &str) -> Result<()> {
    let client = client()?;
    let volume_template_name = volume_template_name(repository_id, id);
    let job = Job {
        metadata: ObjectMeta {
            generate_name: Some(format!("builder-{}", repository_id)),
            ..Default::default()
        },
        spec: Some(JobSpec {
            ttl_seconds_after_finished: Some(10000),
            backoff_limit: Some(1),
            template: PodTemplateSpec {
                spec: Some(PodSpec {
                    service_account_name: Some("backend-service-account".to_string()),
                    volumes: Some(vec![Volume {
                        name: volume_template_name.clone(),
                        persistent_volume_claim: Some(PersistentVolumeClaimVolumeSource {
                            claim_name: volume_template_name.clone(), // TODO pass as arg?
                            ..Default::default()
                        }),
                        ..Default::default()
                    }]),
                    restart_policy: Some("OnFailure".to_string()),
                    containers: vec![Container {
                        name: "cloner".to_string(),
                        image: Some(docker_image_name(&backend_pod().await?)?),
                        command: Some(vec!["builder".to_string()]),
                        args: Some(vec![
                            "-r".to_string(),
                            repository_id.to_string(),
                            "-i".to_string(),
                            id.to_string(),
                        ]),
                        volume_mounts: Some(vec![VolumeMount {
                            name: volume_template_name,
                            mount_path: "/".to_string(),
                            ..Default::default()
                        }]),
                        ..Default::default()
                    }],
                    ..Default::default()
                }),
                ..Default::default()
            },
            ..Default::default()
        }),
        ..Default::default()
    };
    let job_api: Api<Job> = Api::default_namespaced(client.clone());
    job_api
        .create(&PostParams::default(), &job)
        .await
        .map_err(Error::K8sCommunicationFailure)?;

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
    if let Err(_err) = clone_and_build(&repository_id, &id, &args.path).await {}
}
