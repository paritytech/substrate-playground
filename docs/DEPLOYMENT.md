# Kubernetes

Kubernetes is used as a deployment platform for the playground. It can be deployed on GCE or locally via minikube.

## Local 

First start a local minikube cluster:

```
minikube start
```

Then deploy playground:

```
make k8s-deploy-playground
```

Finally access the URL entrypoint managed by minikube:

```
minikube service playground-http --url
```

## GCD

Playground is currently deployed on playground.substrate.dev. The cluster is hosted on GKE and composed of 3 `n2-standard-4` pods.
For more details about machines:

* https://cloud.google.com/compute/docs/machine-types
* https://cloud.google.com/compute/vm-instance-pricing

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

To get a wildcard certificate from let's encrypt:

https://certbot.eff.org/docs/using.html#manual

sudo certbot certonly --manual --preferred-challenges dns --server https://acme-v02.api.letsencrypt.org/directory --manual-public-ip-logging-ok --agree-tos -m admin@parity.io -d *.playground-staging.substrate.dev -d playground-staging.substrate.dev

dig -t txt +short _acme-challenge.playground-staging.substrate.dev


IMPORTANT NOTES:
 - Congratulations! Your certificate and chain have been saved at:                            /etc/letsencrypt/live/playground-staging.substrate.dev/fullchain.pem
   Your key file has been saved at:
   /etc/letsencrypt/live/playground-staging.substrate.dev/privkey.pem
   Your cert will expire on 2020-01-22. To obtain a new or tweaked
   version of this certificate in the future, simply run certbot
   again. To non-interactively renew *all* of your certificates, run
   "certbot renew"

kubectl delete secret  playground-tls-full --namespace=playground-staging

sudo kubectl create secret tls playground-tls-full --key  /etc/letsencrypt/live/playground-staging.substrate.dev/privkey.pem --cert /etc/letsencrypt/live/playground-staging.substrate.dev/cert.pem  --namespace=playground-staging

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
gcloud compute addresses list --region us-central1
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


kubectl get ing playground-ingress --namespace=playground-staging

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