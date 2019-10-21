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