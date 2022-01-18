---
id: build
title: Build
---

# Dev env

So you wanna build and run Playground?

k3d cluster create pg-cluster --k3s-arg '--no-deploy=traefik@server:0' --k3s-node-label "cloud.google.com/gke-nodepool=default-workspace@server:0" --port 80:80@loadbalancer

make k8s-setup-env
make k8s-update-users-config
make k8s-update-templates-config
make k8s-dev

k3d cluster delete pg-cluster
