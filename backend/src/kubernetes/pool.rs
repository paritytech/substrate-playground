//! Helper methods ton interact with k8s
use super::{
    client, list_by_selector, HOSTNAME_LABEL, INSTANCE_TYPE_LABEL, NODE_POOL_LABEL,
    NODE_POOL_TYPE_LABEL,
};
use crate::{
    error::{Error, Result},
    types::Pool,
};
use k8s_openapi::api::core::v1::Node;
use kube::{api::Api, ResourceExt};
use std::collections::BTreeMap;

fn nodes_to_pool(id: String, nodes: Vec<Node>) -> Result<Pool> {
    let node = nodes.first().ok_or_else(|| {
        Error::MissingConstraint("nodes".to_string(), "empty vec of nodes".to_string())
    })?;
    let labels = node.labels();
    let instance_type = labels.get(INSTANCE_TYPE_LABEL).cloned().unwrap_or_default();
    Ok(Pool {
        id,
        instance_type: Some(instance_type),
        nodes: nodes
            .iter()
            .map(|_node| crate::types::Node {
                hostname: node
                    .labels()
                    .get(HOSTNAME_LABEL)
                    .cloned()
                    .unwrap_or_default(),
            })
            .collect(),
    })
}

pub async fn get_pool(id: &str) -> Result<Option<Pool>> {
    let client = client()?;
    let node_api: Api<Node> = Api::all(client);
    let nodes = list_by_selector(&node_api, format!("{}={}", NODE_POOL_LABEL, id).as_str()).await?;

    match nodes_to_pool(id.to_string(), nodes) {
        Ok(pool) => Ok(Some(pool)),
        Err(_) => Ok(None),
    }
}

pub async fn list_pools() -> Result<Vec<Pool>> {
    let client = client()?;
    let node_api: Api<Node> = Api::all(client);

    let nodes = list_by_selector(
        &node_api,
        format!("{}={}", NODE_POOL_TYPE_LABEL, "user").as_str(),
    )
    .await?;

    let nodes_by_pool: BTreeMap<String, Vec<Node>> =
        nodes.iter().fold(BTreeMap::new(), |mut acc, node| {
            let labels = node.labels();
            let key = labels.get(NODE_POOL_LABEL).cloned().unwrap_or_default();
            let nodes = acc.entry(key).or_insert_with(Vec::new);
            nodes.push(node.clone());
            acc
        });

    Ok(nodes_by_pool
        .into_iter()
        .flat_map(|(s, v)| match nodes_to_pool(s, v) {
            Ok(pool) => Some(pool),
            Err(_) => None,
        })
        .collect())
}
