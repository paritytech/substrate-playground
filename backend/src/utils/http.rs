use body::aggregate;
use hyper::{
    body::{self, Buf},
    client::HttpConnector,
    http::request::Builder,
    Body, Client,
};
use hyper_rustls::{HttpsConnector, HttpsConnectorBuilder};
use serde::de::DeserializeOwned;
use serde_json::from_reader;

use crate::error::{Error, Result};

/// Create a new `Client`
pub fn create_client() -> Client<HttpsConnector<HttpConnector>> {
    let https_connector = HttpsConnectorBuilder::new()
        .with_native_roots()
        .https_or_http()
        .enable_http1()
        .build();
    Client::builder().build(https_connector)
}

// Send a fresh `Request` created from a `Builder`, sends it and return the object `T` parsed from JSON.
pub async fn send<T>(builder: Builder, body: Body) -> Result<T>
where
    T: DeserializeOwned,
{
    let client = create_client();
    let req = builder
        .body(body)
        .map_err(|_err| Error::Failure("Failed to read the HTTP request".to_string()))?;
    let res = client
        .request(req)
        .await
        .map_err(|_err| Error::Failure("Failed to execute request".to_string()))?;
    let status = res.status();
    let whole_body = aggregate(res)
        .await
        .map_err(|_err| Error::Failure("Failed to aggregate body".to_string()))?;
    if status.is_success() {
        from_reader(whole_body.reader())
            .map_err(|_err| Error::Failure("Failed to read body".to_string()))
    } else if let Ok(error) = from_reader::<_, String>(whole_body.reader()) {
        Err(Error::Failure(format!(
            "Error while executing request: {}, {}",
            status, error
        )))
    } else {
        Err(Error::Failure(format!(
            "Error while executing request: {}",
            status
        )))
    }
}
