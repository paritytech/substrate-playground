# Kubernetes

Kubernetes is used as a deployment platform for the playground. It can be deployed on GCE or locally via minikube.

Deploy on GKE:

```
kubectl config use-context gke_substrateplayground-252112_us-central1-a_substrate-playground
kubectl config set-context --current --namespace=playground-staging
PLAYGROUND_DOCKER_IMAGE_VERSION="gcr.io/substrateplayground-252112/jeluard/substrate-playground@_VERSION_" make k8s-deploy-playground
```

## GCD

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

### TLS certificate

To get a wildcard certificate from let's encrypt (this applies to staging, replace `playground-staging` with `playground` for production env):

https://certbot.eff.org/docs/using.html#manual

```
sudo certbot certonly --manual --preferred-challenges dns --server https://acme-v02.api.letsencrypt.org/directory --manual-public-ip-logging-ok --agree-tos -m admin@parity.io -d *.playground-staging.substrate.dev -d playground-staging.substrate.dev

# Make sure to check it's been propagated 
dig -t txt +short _acme-challenge.playground-staging.substrate.dev
```

Then update the tls secret:

```
sudo kubectl create secret tls playground-tls --save-config --key /etc/letsencrypt/live/playground-staging.substrate.dev/privkey.pem --cert /etc/letsencrypt/live/playground-staging.substrate.dev/cert.pem  --namespace=playground-staging --dry-run -o yaml | sudo kubectl apply -f -
```

The new secret will be auomatically picked up.

### Update fixed IP

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
playground-theia-staging  34.68.218.45    EXTERNAL                    us-central1          RESERVED

```
gcloud compute addresses delete playground --global
```


-----------------------------------


Setup Ingress NGinx on GKE

See https://kubernetes.github.io/ingress-nginx/deploy/#gce-gke

kubectl create clusterrolebinding cluster-admin-binding \
  --clusterrole cluster-admin \
  --user $(gcloud config get-value account)

kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/master/deploy/static/mandatory.yaml

kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/master/deploy/static/provider/cloud-generic.yaml

# Make sure k8s 1,14 is used


kubectl get ing ingress --namespace=playground-staging

Should have an address

## TLS support

Setup certmanager: https://docs.cert-manager.io/en/latest/getting-started/install/kubernetes.html
Setup an ACME Issuer: https://docs.cert-manager.io/en/latest/tasks/issuers/setup-acme/index.html
kubectl describe issuer letsencrypt --namespace=playground-staging
kubectl describe certificate playground-tls --namespace=playground-staging
kubectl describe secret letsencrypt --namespace=playground-staging
kubectl describe order playground-tls-3130649356 --namespace=playground-staging

### Troubleshootings

kubectl logs pod/cert-manager-f7f8bf74d-zrzkm --namespace=cert-manager

kubectl port-forward playground-8586574b76-j7qbx 8080:80
kubectl config set-context --current --namespace=playground-staging
kubectl get pods

https://devopscube.com/setup-prometheus-monitoring-on-kubernetes/
https://github.com/bibinwilson/kubernetes-prometheus/blob/master/prometheus-deployment.yaml
https://cloud.google.com/solutions/monitoring-apps-running-on-multiple-gke-clusters-using-prometheus-and-stackdriver
https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/

https://stackoverflow.com/questions/47066021/how-to-get-a-list-of-immutable-identifier-digest-from-a-docker-image
https://success.docker.com/article/images-tagging-vs-digests
https://maori.geek.nz/how-to-digest-a-docker-image-ca9fc7630b71
https://artsy.github.io/blog/2018/09/10/Dockerhub-Stamping-Commits/
https://blog.scottlowe.org/2017/11/08/how-tag-docker-images-git-commit-information/

https://github.com/Stackdriver/stackdriver-prometheus-sidecar
https://github.com/kubernetes/kube-state-metrics
https://github.com/tomaka/redshirt/blob/master/.github/workflows/node-deploy.yml
https://github.com/paritytech/substrate/blob/master/frame/recovery/src/lib.rs
https://prometheus.io/docs/prometheus/latest/configuration/configuration/
https://cloud.google.com/monitoring/kubernetes-engine/prometheus
https://cloud.google.com/monitoring/kubernetes-engine/installing
https://kubernetes.github.io/ingress-nginx/user-guide/monitoring/
https://cloud.google.com/monitoring/kubernetes-engine/observing
https://docs.gitlab.com/ee/user/project/integrations/prometheus_library/nginx_ingress.html
https://grafana.com/grafana/dashboards/9909