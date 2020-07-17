Local dev environment relies on [Docker Desktop](https://www.docker.com/products/docker-desktop) kubernetes support. Make sure it is [enabled](https://docs.docker.com/docker-for-mac/#kubernetes) before continuing.
It is also possible to use [minikube](https://minikube.sigs.k8s.io/) or others alternatives.

```shell
# Use the local kubernetes cluster
kubectl config use-context docker-for-desktop
kubectl config set-context --current --namespace=default

# or

make k8s-setup-development
```

A DNS resolving `playground-dev.substrate.test` to localhost must also be configured.

On OSX, it can be achieved the following way:

```shell
brew install dnsmasq

cp /usr/local/etc/dnsmasq.conf /usr/local/etc/dnsmasq.conf.orig
echo "conf-dir=/usr/local/etc/dnsmasq.d/,*.conf" | tee /usr/local/etc/dnsmasq.conf

cat > /usr/local/etc/dnsmasq.d/playground.conf
# then enter: address=/playground-dev.substrate.test/127.0.0.1

sudo mkdir -p /etc/resolver 

cat > /etc/resolver/substrate.test
# then enter: nameserver 127.0.0.1

sudo brew services restart dnsmasq

# Verify it works as expected

dig playground-dev.substrate.test @localhost +short
ping playground-dev.substrate.test
```

Then deploy the cluster:

```shell
make k8s-deploy-playground
```

And initialize relevant ConfigMaps:

```shell
make k8s-update-templates-config
```

You can now browse `http://playground-dev.substrate.test`.

Note that with this setup docker images must be re-compiled and `kustomization.yaml` before each new re-deploy to reflect code changes.

An alternative is to use [skaffold](https://skaffold.dev/). This tool will re-compile Docker images and re-deploy the whole cluster after each code change.

```shell
# Instead of `make k8s-deploy-playground`
make k8s-dev
```

## Dashboard

Some simple dashboards can be deployed to offer finer grain cluster details.

### CLI

Install [k9s](https://github.com/derailed/k9s)

### Web

[Install](https://kubernetes.io/docs/tasks/access-application-cluster/web-ui-dashboard/) the web [dashboard](https://github.com/kubernetes/dashboard/) to have a simple way to manage the k8s cluster:

```shell
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.0.0-beta8/aio/deploy/recommended.yaml
```

Setup [user access](https://github.com/kubernetes/dashboard/blob/master/docs/user/access-control/creating-sample-user.md):

```shell
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

Then navigate to this [link](http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/#/login) and supply the relevant token.
