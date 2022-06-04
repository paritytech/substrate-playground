///! The prometeus metrics exposed by the various backends.
use crate::error::{Error, Result};
use prometheus::{opts, IntCounter, Registry};

/// The struct of metrics internally manipulated. Manipulate them via associated functions.
#[derive(Debug, Clone)]
pub struct Metrics {
    deploy_counter: IntCounter,
    deploy_failures_counter: IntCounter,
    undeploy_counter: IntCounter,
    undeploy_failures_counter: IntCounter,
}

fn new_int_counter(name: &str, description: &str) -> Result<IntCounter> {
    IntCounter::with_opts(opts!(name, description)).map_err(|err| Error::Failure(err.to_string()))
}

fn register(registry: &Registry, counter: IntCounter) -> Result<()> {
    registry
        .register(Box::new(counter))
        .map_err(|err| Error::Failure(err.to_string()))
}

impl Metrics {
    pub fn new() -> Result<Self> {
        Ok(Metrics {
            deploy_counter: new_int_counter("deploy_counter", "Count of deployments")?,
            deploy_failures_counter: new_int_counter(
                "deploy_failures_counter",
                "Count of deployment failures",
            )?,
            undeploy_counter: new_int_counter("undeploy_counter", "Count of undeployment")?,
            undeploy_failures_counter: new_int_counter(
                "undeploy_failures_counter",
                "Count of undeployment failures",
            )?,
        })
    }

    /// Register all metrics in provided `Registry`
    pub fn register(self, registry: Registry) -> Result<()> {
        register(&registry, self.deploy_counter)?;
        register(&registry, self.deploy_failures_counter)?;
        register(&registry, self.undeploy_counter)?;
        register(&registry, self.undeploy_failures_counter)?;
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
