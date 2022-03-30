---
id: build
title: Build
---

# Dev env

So you wanna build and run Playground?

```shell
make dev-create-certificate
make k3d-create-cluster

make k8s-setup-env
make k8s-update-users-config && make k8s-update-templates-config && kubectl create secret tls playground-tls --save-config --key tls.key --cert tls.crt --dry-run=client -o yaml | kubectl apply -f -
make k8s-deploy-playground

make k3d-delete-cluster
```

https://rjackson.dev/posts/setting-up-dns-for-developers-on-osx/
