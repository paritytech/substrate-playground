# Kubernetes

## Local

Install 

minikube start

minikube service frontend --url
minikube stop
minikube delete
minikube dashboard

kubectl get po -A

kubectl run --image=nginx nginx-app --port=80 --env="DOMAIN=cluster"
kubectl expose deployment nginx-app --port=80 -target-port=3000 --name=nginx-http --type=LoadBalancer
kubectl delete service  nginx-http
kubectl delete deployment hello-minikube
kubectl get services

kubectl describe svc  hello-minikube

kubectl config view
kubectl config get-contexts
kubectl config current-context
kubectl config use-context ...
kubectl get cs
kubectl cluster-info
kubectl get nodes -o wide
kubectl get namespaces
kubectl get events --all-namespaces
kubectl config set-context --current --namespace=rancher
kubectl get all


kubectl create deploy nginx --image=nginx

kubectl get service hello-minikube --output='jsonpath="{.spec.ports[0].nodePort}"'
kubectl get service hello-minikube --output='json'

https://kubernetes.io/docs/reference/kubectl/cheatsheet/

NODEPORT=$(kubectl get -o jsonpath="{.spec.ports[0].nodePort}" services nodeport)
NODES=$(kubectl get nodes -o jsonpath='{ $.items[*].status.addresses[?(@.type=="ExternalIP")].address }')

kubectl patch svc nodeport -p '{"spec":{"externalTrafficPolicy":"Local"}}'

kubectl apply -f https://docs.projectcalico.org/v2.6/getting-started/kubernetes/installation/hosted/kubeadm/1.6/calico.yaml

kubectl label pod $POD_NAME app=v1

export POD_NAME=$(kubectl get pods -o go-template --template '{{range .items}}{{.metadata.name}}{{"\n"}}{{end}}')

// Update image to newer version
kubectl set image deployments/kubernetes-bootcamp kubernetes-bootcamp=jocatalin/kubernetes-bootcamp:v2
kubectl rollout status deployments/kubernetes-bootcamp
kubectl rollout undo deployments/kubernetes-bootcamp

kubectl get pods playground-7646f59fbd-c45hh --template='{{(index (index .spec.containers 0).ports 0).containerPort}}{{"\n"}}'
kubectl port-forward  playground-7646f59fbd-c45hh 80:80
kubectl expose deployment playground --port=80 --target-port=80 --name=playground-http --type=NodePort
kubectl apply -f deployment.yaml
minikube service playground-http --url
kubectl delete -f deployment.yaml
## GCD

https://devopstar.com/2019/03/31/containerizing-deploying-services-to-kubernetes-on-gcp/
https://cloud.google.com/sdk/docs/quickstarts

gcloud auth application-default login

gcloud container clusters get-credentials substrate-playground --zone us-central1-a --project substrateplayground-252112

kubectl cluster-info

gcloud auth configure-docker

docker tag parity/substrate-playground-backend:latest asia.gcr.io/substrateplayground-252112/parity/substrate-playground-backend:latest
docker push asia.gcr.io/substrateplayground-252112/parity/substrate-playground-backend:latest

### Secure nginx

https://kubernetes.io/docs/concepts/services-networking/connect-applications-service/#securing-the-service


# Resources

https://argoproj.github.io/argo/
https://skaffold.dev/