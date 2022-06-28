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
use kube::api::Api;
use std::collections::BTreeMap;

fn nodes_to_pool(id: String, nodes: Vec<Node>) -> Result<Pool> {
    let node = nodes
        .first()
        .ok_or(Error::MissingData("empty vec of nodes"))?;
    let metadata = node.metadata.clone();
    let labels = metadata.labels.unwrap_or_default();
    let local = "local".to_string();
    let unknown = "unknown".to_string();
    let instance_type = labels.get(INSTANCE_TYPE_LABEL).unwrap_or(&local);

    Ok(Pool {
        id,
        instance_type: Some(instance_type.clone()),
        nodes: nodes
            .iter()
            .map(|node| crate::types::Node {
                hostname: node
                    .metadata
                    .clone()
                    .labels
                    .unwrap_or_default()
                    .get(HOSTNAME_LABEL)
                    .unwrap_or(&unknown)
                    .clone(),
            })
            .collect(),
    })
}

pub async fn get_pool(id: &str) -> Result<Option<Pool>> {
    let client = client()?;
    let node_api: Api<Node> = Api::all(client);
    let nodes =
        list_by_selector(&node_api, format!("{}={}", NODE_POOL_LABEL, id).to_string()).await?;

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
        format!("{}={}", NODE_POOL_TYPE_LABEL, &"user").to_string(),
    )
    .await?;

    let missing = "<missing>".to_string();
    let nodes_by_pool: BTreeMap<String, Vec<Node>> =
        nodes.iter().fold(BTreeMap::new(), |mut acc, node| {
            let labels = node.metadata.labels.clone().unwrap_or_default();
            let key = labels.get(NODE_POOL_LABEL).unwrap_or(&missing);
            let nodes = acc.entry(key.clone()).or_insert_with(Vec::new);
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
