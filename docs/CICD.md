`substrate-playground` follows a Continuous Integration/Continuous Delivery approach

# Playground

The main branch is [develop](https://github.com/paritytech/substrate-playground/tree/develop). Changes can be merged only via PR.
[develop](https://github.com/paritytech/substrate-playground/tree/develop) (reflected by [staging](http://playground-staging.substrate.dev/)) and [master](https://github.com/paritytech/substrate-playground/tree/master) (reflected by [production](http://playground.substrate.dev/)) are continuously deployed on their respective environment.

Once manually approved on the staging environment, changes are promoted to master.
(TODO via releases? tags?)

# Docker images

Update to configmap?
3rd party projects?
Permission to push to config/k8s/images

# Local support

Github actions workflows can be tested locally using [act](https://github.com/nektos/act)

# Github configuration

## Secrets

A number of `secrets` must be defined:

`GKE_PROJECT`
`GCLOUD_KEY` is the base64 of the gcloud service account JSON file
             Get the JSON file from https://console.cloud.google.com/iam-admin/serviceaccounts?authuser=1&hl=fr&project=substrateplayground-252112&folder=&organizationId=&supportedpurview=project
             ... -> Actions -> Create Key
             then base64 substrateplayground-XXX.json | tr -d \\n
`DOCKER_USERNAME` and `DOCKER_PASSWORD` pointing to a valid dockerhub account having acccess to paritytech organization
`MATRIX_ACCESS_TOKEN` and `MATRIX_ROOM_ID` pointing to a specific Matrix room
`PAT_TOKEN` a [token](https://help.github.com/en/actions/reference/events-that-trigger-workflows#triggering-new-workflows-using-a-personal-access-token) with `repo` access