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
### Cluster creation

```shell
gcloud container clusters create substrate-playground \
    --release-channel regular \
    --zone us-central1-a \
    --node-locations us-central1-a \
    --machine-type n2d-standard-32 \
    --preemptible \
    --enable-autoscaling \
    --num-nodes 2 \
    --min-nodes 2 \
    --max-nodes 10
```

Find more details about machines:

* https://cloud.google.com/compute/docs/machine-types
* https://cloud.google.com/compute/vm-instance-pricing

Then go ahead and create the `playground` namespace:

```shell
kubectl create ns playground
```

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

### DNS

Create a new [CloudDNS zone](https://console.cloud.google.com/net-services/dns/zones/new/create?authuser=1&project=substrateplayground-252112).

Fill a DevOps [request](https://github.com/paritytech/devops/issues/732) to redirect the new substrate.dev subdomain to CloudDNS.

Add two `A` record set (one with ``, one with `*` as DNS name) pointing to the newly created fixed IP.

Another record set will be added during the TLS certificate generation.
### TLS certificate

To get a wildcard certificate from let's encrypt:

https://certbot.eff.org/docs/using.html#manual

First make sure that certbot is installed: `brew install certbot`

Then request new challenges. Two DNS entries will have to be updated.

#### Staging

```
sudo certbot certonly --manual --preferred-challenges dns --server https://acme-v02.api.letsencrypt.org/directory --manual-public-ip-logging-ok --agree-tos -m admin@parity.io -d *.playground-staging.substrate.dev -d playground-staging.substrate.dev

# Update CloudDNS by adding a new TXT record as detailed by certbot

# Make sure to check it's been propagated 
dig +short TXT _acme-challenge.playground-staging.substrate.dev @8.8.8.8
```

Then update the tls secret:

```
gcloud container clusters get-credentials substrate-playground-staging --region us-central1-a
ENVIRONMENT=staging make k8s-setup
sudo kubectl create secret tls playground-tls --save-config --key /etc/letsencrypt/live/playground-staging.substrate.dev/privkey.pem --cert /etc/letsencrypt/live/playground-staging.substrate.dev/fullchain.pem --namespace=playground --dry-run=true -o yaml | sudo kubectl apply -f -
```

The new secret will be automatically picked up.

#### Production

```
sudo certbot certonly --manual --preferred-challenges dns --server https://acme-v02.api.letsencrypt.org/directory --manual-public-ip-logging-ok --agree-tos -m admin@parity.io -d *.playground.substrate.dev -d playground.substrate.dev

# Update CloudDNS by adding a new TXT record as detailed by certbot

# Make sure to check it's been propagated 
dig +short TXT _acme-challenge.playground.substrate.dev @8.8.8.8
```

Then update the tls secret:

```
gcloud container clusters get-credentials substrate-playground --region us-central1-a
ENVIRONMENT=production make k8s-setup
sudo kubectl create secret tls playground-tls --save-config --key /etc/letsencrypt/live/playground.substrate.dev/privkey.pem --cert /etc/letsencrypt/live/playground.substrate.dev/fullchain.pem --namespace=playground --dry-run=true -o yaml | sudo kubectl apply -f -
```

The new secret will be auomatically picked up.

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
### Configuration

Set required ConfigMap and Secret as defined in the newly created OAuth app:

```shell
# WARNING Make sure all needed info are set before running those commands
kubectl create configmap playground-config --namespace=playground --from-literal=admins="???,???" --from-literal=github.clientId="???"
kubectl create secret generic playground-secrets --namespace=playground --from-literal=github.clientSecret="???" --from-literal=rocket.secretKey=`openssl rand -base64 32`
ENVIRONMENT=production make k8s-update-templates-config
```

### Deployment

Finally, deploy the playground infrastructure:

```
ENVIRONMENT=production make k8s-deploy-playground
```
### Sanity checks

After deployment, the external facing IP can be found using:

```
kubectl get services ingress-nginx
```
