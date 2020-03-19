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