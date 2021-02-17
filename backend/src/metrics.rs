use prometheus::Registry;
use prometheus::{exponential_buckets, histogram_opts, opts, HistogramVec, IntCounterVec};
use std::error::Error;

#[derive(Debug, Clone)]
pub struct Metrics {
    deploy_counter: IntCounterVec,
    deploy_failures_counter: IntCounterVec,
    undeploy_counter: IntCounterVec,
    undeploy_failures_counter: IntCounterVec,
    deploy_duration: HistogramVec,
}

impl Metrics {
    const TEMPLATE_LABEL: &'static str = "template";

    pub fn new() -> Result<Self, Box<dyn Error>> {
        let opts = histogram_opts!(
            "deploy_duration",
            "Deployment duration in seconds",
            exponential_buckets(1.0, 2.0, 8).unwrap()
        );
        Ok(Metrics {
            deploy_counter: IntCounterVec::new(
                opts!("deploy_counter", "Count of deployments"),
                &[Self::TEMPLATE_LABEL],
            )?,
            deploy_failures_counter: IntCounterVec::new(
                opts!("deploy_failures_counter", "Count of deployment failures"),
                &[Self::TEMPLATE_LABEL],
            )?,
            undeploy_counter: IntCounterVec::new(
                opts!("undeploy_counter", "Count of undeployment"),
                &[],
            )?,
            undeploy_failures_counter: IntCounterVec::new(
                opts!(
                    "undeploy_failures_counter",
                    "Count of undeployment failures"
                ),
                &[],
            )?,
            deploy_duration: HistogramVec::new(opts, &[])?,
        })
    }

    pub fn create_registry(self) -> Result<Registry, Box<dyn Error>> {
        let registry = Registry::new_custom(Some("playground".to_string()), None)?;
        registry.register(Box::new(self.deploy_counter))?;
        registry.register(Box::new(self.deploy_failures_counter))?;
        registry.register(Box::new(self.undeploy_counter))?;
        registry.register(Box::new(self.undeploy_failures_counter))?;
        registry.register(Box::new(self.deploy_duration))?;

        Ok(registry)
    }
}

// Helper functions
impl Metrics {
    pub fn inc_deploy_counter(self, template: &str) {
        self.deploy_counter.with_label_values(&[template]).inc();
    }

    pub fn inc_deploy_failures_counter(self, template: &str) {
        self.deploy_failures_counter
            .with_label_values(&[template])
            .inc();
    }

    pub fn inc_undeploy_counter(self) {
        self.undeploy_counter.with_label_values(&[]).inc();
    }

    pub fn inc_undeploy_failures_counter(self) {
        self.undeploy_failures_counter.with_label_values(&[]).inc();
    }

    pub fn observe_deploy_duration(self, duration: f64) {
        self.deploy_duration
            .with_label_values(&[])
            .observe(duration);
    }
}
