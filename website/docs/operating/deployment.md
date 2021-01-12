---
id: deployment
title: Deployment
---

Kubernetes is used as a deployment platform for the playground. Make sure that k8s > 1.14 is used.
GKE is used as primary deploy platform. It might not work as is on others.

## Prerequisites

### Tools

#### Gcloud

Install [gcloud](https://cloud.google.com/sdk/docs/)

```shell
#On OSX
brew cask install google-cloud-sdk
gcloud init
```
#### jq

See https://stedolan.github.io/jq/
#### Docker

See https://docs.docker.com/get-docker/

#### kubectl

See https://kubernetes.io/docs/tasks/tools/install-kubectl/
#### kustomize

See https://github.com/kubernetes-sigs/kustomize

### Custom overlay

If a new deployment environment is created, duplicate `conf/k8s/overlays/staging` into a dedicated folder and adapt accordingly.
### Github OAuth app

Make sure a Github OAuth App is [created](https://docs.github.com/en/developers/apps/creating-an-oauth-app) with following parameters:

* `Homepage URL`: $BASE (e.g. https://playground.substrate.dev)
* `Authorization callback URL`: `$BASE/api/auth/github`.

During the `Configuration` step both `Client ID` and `Client secret` will be required.
### Fixed IP

Make sure to use regional addresses, matching your cluster region. Global addresses won't work.

```
gcloud compute addresses create playground --region us-central1
gcloud compute addresses list --filter="region:( us-central1 )"
gcloud compute addresses describe playground --region=us-central1 --format="value(address)"
```

Then update `loadBalancerIP` with the newly created IP in `conf/k8s/overlays/$ENV/kustomization.yaml`

### Cluster creation

```shell
make create-cluster
```

### DNS

Create a new [CloudDNS zone](https://console.cloud.google.com/net-services/dns/zones/new/create?authuser=1&project=substrateplayground-252112).

* Zone name: playground-*
* DNS name: playground-*.substrate.dev
* DNSSec: off

Fill a DevOps [request](https://github.com/paritytech/devops/issues/732) to redirect the new substrate.dev subdomain to CloudDNS.
Can be checked with `dig +short playground-XX.substrate.dev NS`

Add two `A` record set (one with ``, one with `*` as DNS name) pointing to the newly created fixed IP (see previous step).

Another record set will be added during the TLS certificate generation.
### TLS certificate

To get a wildcard certificate from let's encrypt:

https://certbot.eff.org/docs/using.html#manual

First make sure that certbot is installed: `brew install certbot`

Then request new challenges. Two DNS entries will have to be updated.

#### Update

```
make generate-challenge

# Update CloudDNS by adding a new TXT record as detailed by certbot

# Make sure to check it's been propagated
make get-challenge
```

Then update the tls secret:

```
make k8s-update-certificate
```

The new secret will be automatically picked up.

#### Check

Certificates can be checked using openssl:

```shell
openssl s_client -connect playground.substrate.dev:443 -servername playground.substrate.dev -showcerts
# Or for client with no SNI support
openssl s_client -connect  playground.substrate.dev:443 -showcerts
```
# Nginx twist ? TODO check


kubectl create clusterrolebinding cluster-admin-binding \
  --clusterrole cluster-admin \
  --user $(gcloud config get-value account)

From https://kubernetes.github.io/ingress-nginx/deploy/#gce-gke

### Deployment

Finally, deploy the playground infrastructure:

```
ENV=XXX make k8s-deploy-playground
```
