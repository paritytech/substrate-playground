---
id: build
title: Build
---

# Dev env

So you wanna build and run Playground?

k3d cluster create pg-cluster --k3s-arg '--tls-san=127.0.0.1@server:*' --k3s-arg '--no-deploy=traefik@server:*' --k3s-node-label "cloud.google.com/gke-nodepool=default-workspace@server:0" --port 80:80@loadbalancer --port 443:443@loadbalancer

make k8s-setup-env
make k8s-update-users-config && make k8s-update-templates-config && kubectl create secret tls playground-tls --save-config --key tls.key --cert tls.crt --dry-run=client -o yaml | kubectl apply -f -
make k8s-deploy-playground

k3d cluster delete pg-cluster

https://rjackson.dev/posts/setting-up-dns-for-developers-on-osx/
