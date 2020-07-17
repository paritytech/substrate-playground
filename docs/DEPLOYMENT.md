# Update playground image

* build and push new image (`make push-playground-docker-image`)
* select right context (`ENVIRONMENT=staging make k8s-setup-gke`)
* deploy on GKE (`ENVIRONMENT=staging make k8s-deploy-playground`)


# Kubernetes

Kubernetes is used as a deployment platform for the playground. It can be deployed on GCE or locally via minikube.
(Make sure that k8s 1.14 is used)

## Setup

For OSX

```
brew cask install google-cloud-sdk
gcloud init
gcloud container clusters get-credentials  susbtrate-playground-staging --zone us-central1-a
ENVIRONMENT=staging make k8s-setup-gke
```

Deploy on GKE:

```
kubectl config use-context gke_substrateplayground-252112_us-central1-a_substrate-playground
kubectl config set-context --current --namespace=playground-staging
PLAYGROUND_DOCKER_IMAGE_VERSION="gcr.io/substrateplayground-252112/jeluard/substrate-playground@_VERSION_" make k8s-deploy-playground
```

## Clusters

When switching / recreating clusters it might be necessary to refresh credentials:

```
gcloud container clusters get-credentials  susbtrate-playground-staging --zone us-central1-a
```

Playground is currently deployed on playground.substrate.dev. The cluster is hosted on GKE and composed of some `n2-standard-4` pods.
For more details about machines:

* https://cloud.google.com/compute/docs/machine-types
* https://cloud.google.com/compute/vm-instance-pricing

Install https://cloud.google.com/sdk/docs/

First make sure kubectl points to the right google cloud engine:

```
gcloud auth application-default login

gcloud container clusters get-credentials substrate-playground --zone us-central1-a --project substrateplayground-252112
```

You can then check it's correctly configured using:

```
kubectl cluster-info
```

After deployment, the external facing IP can be found using:

```
kubectl get services playground-http
```

Ensure that `playground-http` is correctly deployed by browsing its [events](https://console.cloud.google.com/kubernetes/service/us-central1-a/substrate-playground/default/playground-http?project=substrateplayground-252112&organizationId=939403632241&tab=events&duration=PT1H&pod_summary_list_tablesize=20&playground-http_events_tablesize=50)

## TLS certificate

To get a wildcard certificate from let's encrypt (this applies to staging, replace `playground-staging` with `playground` for production env):

https://certbot.eff.org/docs/using.html#manual

First make sure that certbot is installed: `brew install certbot`

Then request new challenges. Two DNS entries will have to be updated.

### Staging

```
sudo certbot certonly --manual --preferred-challenges dns --server https://acme-v02.api.letsencrypt.org/directory --manual-public-ip-logging-ok --agree-tos -m admin@parity.io -d *.playground-staging.substrate.dev -d playground-staging.substrate.dev

# Make sure to check it's been propagated 
dig +short TXT _acme-challenge.playground-staging.substrate.dev @ 8.8.8.8
```

Then update the tls secret:

```
gcloud container clusters get-credentials substrate-playground-staging --region us-central1-a
ENVIRONMENT=staging make k8s-setup-gke
sudo kubectl create secret tls playground-tls --save-config --key /etc/letsencrypt/live/playground-staging.substrate.dev/privkey.pem --cert /etc/letsencrypt/live/playground-staging.substrate.dev/cert.pem  --namespace=playground-staging --dry-run -o yaml | sudo kubectl apply -f -
```

The new secret will be auomatically picked up.

### Production

```
sudo certbot certonly --manual --preferred-challenges dns --server https://acme-v02.api.letsencrypt.org/directory --manual-public-ip-logging-ok --agree-tos -m admin@parity.io -d *.playground.substrate.dev -d playground.substrate.dev

# Make sure to check it's been propagated 
dig +short TXT _acme-challenge.playground.substrate.dev @ 8.8.8.8
```

Then update the tls secret:

```
gcloud container clusters get-credentials substrate-playground --region us-central1-a
ENVIRONMENT=production make k8s-setup-gke
sudo kubectl create secret tls playground-tls --save-config --key /etc/letsencrypt/live/playground.substrate.dev/privkey.pem --cert /etc/letsencrypt/live/playground.substrate.dev/cert.pem  --namespace=playground --dry-run -o yaml | sudo kubectl apply -f -
```

The new secret will be auomatically picked up.

Certificates can be checked using openssl:

```shell
openssl s_client -connect  playground.substrate.dev:443 -servername playground.substrate.dev -showcerts
# Or for client with no SNI support
openssl s_client -connect  playground.substrate.dev:443 -showcerts
```

## Update fixed IP

Make sure to use regional addresses, matching your cluster region. Global addresses won't work.

```
gcloud compute addresses create playground --global
gcloud compute addresses describe playground --global
```

```
gcloud compute addresses create playground --region us-central1
gcloud compute addresses create playground-theia --region us-central1
gcloud compute addresses create playground-staging --region us-central1
gcloud compute addresses create playground-theia-staging --region us-central1
gcloud compute addresses list --filter="region:( us-central1 )"
gcloud compute addresses describe playground --region=us-central1 --format="value(address)"
```

playground-staging        34.69.4.59      EXTERNAL                    us-central1          RESERVED

```
gcloud compute addresses delete playground --global
```
