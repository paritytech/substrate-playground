//! GitHub utility functions

use hyper::{
    header::{qitem, Accept, Authorization, Basic, UserAgent},
    net::HttpsConnector,
    status::StatusCode,
    Client,
};
use std::io::Read;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct GitHubTokenValidity {
    #[serde(default)]
    pub user: GitHubUser,
}

/// User information to be retrieved from the GitHub API.
#[derive(Clone, Default, Debug, serde::Serialize, serde::Deserialize)]
pub struct GitHubUser {
    #[serde(default)]
    pub login: String,
    #[serde(default)]
    pub  avatar_url: String,
}

/// Returns a GitHubUser representing provided token.
///
/// # Arguments
///
/// * `token` - a github token 
/// * `client_id` - a github OAuth client ID
/// * `client_secret` - a github OAuth client secret (matching client ID)
///
pub fn token_validity(token: &str, client_id: &str, client_secret: &str) -> Result<GitHubUser, String> {
    let https = HttpsConnector::new(hyper_sync_rustls::TlsClient::new());
    let client = Client::with_connector(https);

    let mime = "application/vnd.github.v3+json"
        .parse()
        .expect("parse GitHub MIME type");

    // https://docs.github.com/en/rest/reference/apps#check-a-token
    let response: hyper::client::response::Response = client
        .post(format!("https://api.github.com/applications/{}/token", client_id).as_str())
        .header(Authorization(Basic {
            username: client_id.to_owned(),
            password: Some(client_secret.to_owned()),
        }))
        .header(Accept(vec![qitem(mime)]))
        .header(UserAgent("Substrate Playground".into()))
        .body(format!("{{\"access_token\":\"{}\"}}", token).as_str())
        .send()
        .map_err(|op| {
            format!(
                "Failed to access Playground GitHub application: {}",
                op.to_string()
            )
        })?;

    if response.status == StatusCode::Ok {
        let token_validity: GitHubTokenValidity =
            serde_json::from_reader(response.take(2 * 1024 * 1024)).map_err(|error| {
                format!("Failed to read GitHubTokenValidity: {}", error.to_string())
            })?;
        Ok(token_validity.user)
    } else {
        Err("Invalid token".to_string())
    }
}
