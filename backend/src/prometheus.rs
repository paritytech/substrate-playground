//! Adapted from https://github.com/sd2k/rocket_prometheus/

use prometheus::{Encoder, Registry, TextEncoder};
use rocket::{
    http::{ContentType, Method},
    route::{Handler, Outcome, Route},
    Data, Request,
};

#[derive(Clone)]
pub struct PrometheusMetrics {
    pub registry: Registry,
}

impl PrometheusMetrics {
    /// Create a new `PrometheusMetrics` with a custom `Registry`.
    pub fn with_registry(registry: Registry) -> Self {
        PrometheusMetrics { registry }
    }
}

#[rocket::async_trait]
impl Handler for PrometheusMetrics {
    async fn handle<'r>(&self, req: &'r Request<'_>, _: Data<'r>) -> Outcome<'r> {
        // Gather the metrics.
        let mut buffer = vec![];
        let encoder = TextEncoder::new();
        encoder
            .encode(&self.registry.gather(), &mut buffer)
            .unwrap();
        let body = String::from_utf8(buffer).unwrap();
        Outcome::from(
            req,
            (
                ContentType::new("text", "plain")
                    .with_params([("version", "0.0.4"), ("charset", "utf-8")]),
                body,
            ),
        )
    }
}

impl From<PrometheusMetrics> for Vec<Route> {
    fn from(other: PrometheusMetrics) -> Self {
        vec![Route::new(Method::Get, "/", other)]
    }
}
