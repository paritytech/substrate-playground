---
id: build
title: Build
---

# Dev env

So you wanna build and run Playground?

```shell
make k3d-create-cluster

USER_ROLES= GH_CLIENT_ID= GH_CLIENT_SECRET= make k8s-setup-cluster
make dev-create-certificate && kubectl create secret tls playground-tls --save-config --key tls.key --cert tls.crt --dry-run=client -o yaml | kubectl apply -f -
make k8s-deploy

make k3d-delete-cluster
```
