///! The prometeus metrics exposed by the various backends.
use prometheus::{opts, Error, IntCounter, Registry};

/// The struct of metrics internally manipulated. Manipulate them via associated functions.
#[derive(Debug, Clone)]
pub struct Metrics {
    deploy_counter: IntCounter,
    deploy_failures_counter: IntCounter,
    undeploy_counter: IntCounter,
    undeploy_failures_counter: IntCounter,
}

impl Metrics {
    pub fn new() -> Result<Self, Error> {
        Ok(Metrics {
            deploy_counter: IntCounter::with_opts(opts!("deploy_counter", "Count of deployments"))?,
            deploy_failures_counter: IntCounter::with_opts(opts!(
                "deploy_failures_counter",
                "Count of deployment failures"
            ))?,
            undeploy_counter: IntCounter::with_opts(opts!(
                "undeploy_counter",
                "Count of undeployment"
            ))?,
            undeploy_failures_counter: IntCounter::with_opts(opts!(
                "undeploy_failures_counter",
                "Count of undeployment failures"
            ))?,
        })
    }

    /// Register all metrics in provided `Registry`
    pub fn register(self, registry: Registry) -> Result<(), Error> {
        registry.register(Box::new(self.deploy_counter))?;
        registry.register(Box::new(self.deploy_failures_counter))?;
        registry.register(Box::new(self.undeploy_counter))?;
        registry.register(Box::new(self.undeploy_failures_counter))?;
        Ok(())
    }
}

/// Helper functions
impl Metrics {
    pub fn inc_deploy_counter(&self) {
        self.deploy_counter.inc();
    }

    pub fn inc_deploy_failures_counter(&self) {
        self.deploy_failures_counter.inc();
    }

    pub fn inc_undeploy_counter(&self) {
        self.undeploy_counter.inc();
    }

    pub fn inc_undeploy_failures_counter(&self) {
        self.undeploy_failures_counter.inc();
    }
}
