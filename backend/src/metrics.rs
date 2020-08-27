use prometheus::Registry;
use rocket_prometheus::prometheus::{opts, HistogramVec, IntCounterVec};
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
    const USER_UUID_LABEL: &'static str = "user_uuid";
    const INSTANCE_UUID_LABEL: &'static str = "instance_uuid";
    const TEMPLATE_LABEL: &'static str = "template";

    pub fn new() -> Result<Self, Box<dyn Error>> {
        Ok(Metrics {
            deploy_counter: IntCounterVec::new(
                opts!("deploy_counter", "Count of deployments"),
                &[Self::USER_UUID_LABEL, Self::TEMPLATE_LABEL],
            )?,
            deploy_failures_counter: IntCounterVec::new(
                opts!("deploy_failures_counter", "Count of deployment failures"),
                &[Self::TEMPLATE_LABEL],
            )?,
            undeploy_counter: IntCounterVec::new(
                opts!("undeploy_counter", "Count of undeployment"),
                &[Self::INSTANCE_UUID_LABEL],
            )?,
            undeploy_failures_counter: IntCounterVec::new(
                opts!(
                    "undeploy_failures_counter",
                    "Count of undeployment failures"
                ),
                &[Self::INSTANCE_UUID_LABEL],
            )?,
            deploy_duration: HistogramVec::new(
                opts!("deploy_duration", "Deployment duration in seconds").into(),
                &[Self::INSTANCE_UUID_LABEL],
            )?,
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
    pub fn inc_deploy_counter(self, template: &str, user_uuid: &str) {
        self.deploy_counter
            .with_label_values(&[template, user_uuid])
            .inc();
    }

    pub fn inc_deploy_failures_counter(self, template: &str) {
        self.deploy_failures_counter
            .with_label_values(&[template])
            .inc();
    }

    pub fn inc_undeploy_counter(self, instance_uuid: &str) {
        self.undeploy_counter
            .with_label_values(&[&instance_uuid])
            .inc();
    }

    pub fn inc_undeploy_failures_counter(self, instance_uuid: &str) {
        self.undeploy_failures_counter
            .with_label_values(&[&instance_uuid])
            .inc();
    }

    pub fn observe_deploy_duration(self, instance_uuid: &str, duration: f64) {
        self.deploy_duration
            .with_label_values(&[&instance_uuid])
            .observe(duration);
    }
}
