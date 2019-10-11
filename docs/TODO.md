# Playground

## MVP

https
Change namespace
Move to Ingress
* https://kubernetes.io/docs/concepts/services-networking/ingress/
* https://kubernetes.github.io/ingress-nginx/user-guide/default-backend/
* https://blog.containo.us/traefik-2-0-docker-101-fc2893944b9d

## Tuto

Faster theia image startup (move away from LB, ingress? or traeffik?)
wss (teremination for access via https://polkadot.js.org/apps/?rpc=ws://127.0.0.1:9944#/explorer)
Access public IP from container

## Fast

Configure a nicer Rust env
* https://github.com/rust-analyzer/rust-analyzer/tree/master/docs/user
(Only if can't be made fast) Introduce pool of idle pods, to reduce time to get started

Use workspaces
* https://code.visualstudio.com/docs/editor/multi-root-workspaces

Integration tests
https://blog.yoshuawuyts.com/async-finalizers/
https://www.joshmcguigan.com/blog/custom-exit-status-codes-rust/
https://seanmonstar.com/post/188220739932/reqwest-alphaawait

## 3rd parties

Interact with marketplace
* https://github.com/everstake/vscode-plugin-substrate/blob/master/docs/TUTORIAL.md

## Features

Test VSCode plugin, specifically Web3 fundation ones
* https://github.com/stiiifff/substrate-deps
* https://marketplace.visualstudio.com/items?itemName=pnp.polacode
* https://github.com/tonsky/FiraCode/wiki/Linux-instructions#installing-with-a-package-manager
* https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer
* https://marketplace.visualstudio.com/items?itemName=techer.open-in-browser
* https://github.com/ashleygwilliams/cargo-generate
* https://code.visualstudio.com/blogs/2019/07/25/remote-ssh
* https://github.com/microsoft/vscode-dev-containers
* https://marketplace.visualstudio.com/items?itemName=MS-vsliveshare.vsliveshare
* https://hoverbear.org/blog/setting-up-a-rust-devenv/
* https://vscodecandothat.com/
* https://code.visualstudio.com/api/get-started/your-first-extension
* https://code.visualstudio.com/api/references/contribution-points
* https://github.com/theia-ide/theia-extension-example
* https://github.com/JPinkney/theia-yaml-extension
* https://github.com/spring-projects/sts4/tree/master/theia-extensions
* https://github.com/eclipse-theia/theia/wiki/Testing-VS-Code-extensions
* https://github.com/eclipse-theia/theia/blob/master/doc/Developing.md
* https://github.com/theia-ide/vscode-builtin-extensions
* https://spectrum.chat/theia/general/vs-code-extensions-in-a-custom-docker-image~73145eea-4c80-4314-b657-30d96b2f2bb0

Allow to simply start a chain, possibly locally (WASM)
Provide macros syntaxic sugar
Support ink syntax 
Ink plugin

Plugin to interact with networks

## Teach

Tutorial as in https://kubernetes.io/docs/tutorials/kubernetes-basics/expose/expose-interactive/

## Probes

* https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
* https://medium.com/@AADota/kubernetes-liveness-and-readiness-probes-difference-1b659c369e17
* https://cloud.google.com/blog/products/gcp/kubernetes-best-practices-setting-up-health-checks-with-readiness-and-liveness-probes
* https://blog.octo.com/liveness-et-readiness-probes-mettez-de-lintelligence-dans-vos-clusters/
* https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#examples

## Issues

### Preview and localhost

https://spectrum.chat/theia/general/preview-and-localhost-resolution-behavior~cc291ac2-6b07-4807-8693-e429fc7f7596

Either patch to support localhost, or have native external IP support (à la gitpod.io)

# Devops

https://opentelemetry.io/
https://kuma.io/
https://gitlab.parity.io/parity/infrastructure/traefik
https://traefik.io/
https://github.com/topfreegames/maestro
https://github.com/Babylonpartners/shipcat
https://blog.containo.us/traefik-2-0-6531ec5196c2
https://mae.sh/
https://coredns.io/

# Github actions

https://github.com/actions-rs/clippy-check
https://github.com/actions/starter-workflows/tree/master/ci
https://github.com/actions/toolkit/blob/master/.github/workflows/workflow.yml
https://help.github.com/en/articles/configuring-a-workflow
https://help.github.com/en/articles/workflow-syntax-for-github-actions
https://help.github.com/en/articles/events-that-trigger-workflows#webhook-events
https://help.github.com/en/articles/virtual-environments-for-github-actions
https://help.github.com/en/articles/contexts-and-expression-syntax-for-github-actions
https://css-tricks.com/introducing-github-actions/
https://github.com/ZcashFoundation/zebra/blob/master/.github/workflows/main.yml
https://svartalf.info/posts/2019-09-16-github-actions-for-rust/
https://blog.quid.works/setting-up-your-first-gcp-github-action/ 
https://github.com/actions/gcloud
https://leaks.digitalproductschool.io/continuously-deliver-your-react-app-with-github-actions-and-google-cloud-4a71fd52a035
https://blog.kontena.io/deploying-to-kubernetes-from-github-actions/
https://gist.github.com/NiklasMerz/1e55dd050a2b755c1c7db1754c32a134
https://github.com/Azure/k8s-actions
https://gianarb.it/blog/kubernetes-github-action
https://blog.jessfraz.com/post/the-life-of-a-github-action/
https://github.com/tokio-rs/tracing/blob/04088a0014cbf1b80187fca8c9ce43a97bcd456e/.github/workflows/CI.yml
https://blog.digitalocean.com/how-to-deploy-to-digitalocean-kubernetes-with-github-actions/
https://raw.githubusercontent.com/sagebind/blog/master/.github/main.workflow
https://github.com/actions-rs/cargo

# Auto stuff

https://dependabot.com/
https://codeclimate.com/github/paritytech/substrate-light-ui
https://codecov.io/gh/paritytech/ink/branch/master/graph/badge.svg
https://coveralls.io/repos/github/paritytech/ink/badge.svg?branch=master
https://tokei.rs/b1/github/paritytech/ink?category=code

# Perf

https://github.com/ChrisMacNaughton/cargo-cacher
https://stackoverflow.com/questions/54952867/cache-cargo-dependencies-in-a-docker-volume

# Plugins

https://marketplace.visualstudio.com/items?itemName=tintinweb.solidity-visual-auditor

# Tracing

https://tokio.rs/blog/2019-08-tracing/
https://crates.io/crates/tracing
https://github.com/tokio-rs/tracing

# Infra

https://github.com/timberio/vector
https://opentelemetry.io/
https://linkerd.io/ (https://github.com/linkerd/linkerd2)
https://kuma.io/
https://www.envoyproxy.io/
https://istio.io/
https://konghq.com/
https://konghq.com/blog/kong-istio-setting-service-mesh-kubernetes-kiali-observability/

# Icones

* https://github.com/badges/shields/blob/master/README.md
* https://shields.io/
* https://naereen.github.io/badges/
* https://simpleicons.org/
* https://gitpod.io/button/open-in-gitpod.svg