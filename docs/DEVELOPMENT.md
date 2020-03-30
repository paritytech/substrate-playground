# Deployment

Local dev environment relies on [Docker Desktop](https://www.docker.com/products/docker-desktop) kubernetes support. Make sure it is [enabled](https://docs.docker.com/docker-for-mac/#kubernetes) before continuing.
It is also possible to use [minikube](https://minikube.sigs.k8s.io/) or others alternatives.

```shell
# Use the local kubernetes cluster
kubectl config use-context docker-for-desktop
kubectl config set-context --current --namespace=default
```

Then in a first shell, start:

```
make dev-backend
```

And in a second terminal:

```
make dev-frontend
```

You can now browse `http://localhost:8000`.

# Dashboard

[Install](https://kubernetes.io/docs/tasks/access-application-cluster/web-ui-dashboard/) the web [dashboard](https://github.com/kubernetes/dashboard/) to have a simple way to manage the k8s cluster:

```shell
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.0.0-beta8/aio/deploy/recommended.yaml
```

Setup [user access](https://github.com/kubernetes/dashboard/blob/master/docs/user/access-control/creating-sample-user.md):

```
# Add a dummy user access
# Warning: user is granted all access
kubectl apply -f conf/k8s/dashboard-user.yaml
# Get access to the token
kubectl -n kubernetes-dashboard describe secret $(kubectl -n kubernetes-dashboard get secret | grep admin-user | awk '{print $1}')
```

Let the dashboard be accessible:

```shell
kubectl proxy
```

Then navigate the [browser](http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/#/login) and supply the relevant token.
