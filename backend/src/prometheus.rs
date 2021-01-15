//! Adapted from https://github.com/sd2k/rocket_prometheus/blob/master/src/lib.rs

use prometheus::{Encoder, Registry, TextEncoder};
use rocket::{
    handler::Outcome,
    http::{ContentType, Method},
    response::Content,
    Data, Handler, Request, Route,
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

impl Handler for PrometheusMetrics {
    fn handle<'r>(&self, req: &'r Request, _: Data) -> Outcome<'r> {
        // Gather the metrics.
        let mut buffer = vec![];
        let encoder = TextEncoder::new();
        encoder
            .encode(&self.registry.gather(), &mut buffer)
            .unwrap();
        let body = String::from_utf8(buffer).unwrap();
        Outcome::from(
            req,
            Content(
                ContentType::with_params(
                    "text",
                    "plain",
                    &[("version", "0.0.4"), ("charset", "utf-8")],
                ),
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
