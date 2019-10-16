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
gcloud compute addresses delete playground --global
```