---
id: cicd
title: CI/CD
---

`substrate-playground` follows a Continuous Integration/Continuous Delivery approach

## Deployments

### Playground

The main branch is [develop](https://github.com/paritytech/substrate-playground/tree/develop). Changes can be merged only via PR.
[develop](https://github.com/paritytech/substrate-playground/tree/develop) is continuously deployed.

Once manually approved on the staging environment, changes are promoted to master.

### Base template images

### Template images

## Github configuration

### Secrets

A number of `secrets` must be defined:

`GH_CLIENT_ID` and `GH_CLIENT_SECRET` pointing to valid OAuth credentials for `https://playground.substrate.io`. Used for CI.
