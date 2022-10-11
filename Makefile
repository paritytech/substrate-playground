.DEFAULT_GOAL=help

# Check if required tools are installed

ifeq (, $(shell which docker))
    $(error "docker not installed, see https://docs.docker.com/get-docker/")
endif

ifeq (, $(shell which kubectl))
    $(error "kubectl not installed, see https://kubernetes.io/docs/tasks/tools/install-kubectl/")
endif

# ENV defaults to dev
ENV?=dev

# Extract all environments from resources/k8s/overlays/
ENVS := $(shell cd resources/k8s/overlays/ && ls -d *)

ifeq ($(filter $(ENV),$(ENVS)),)
    $(error ENV should be one of ($(ENVS)) but was $(ENV))
endif

# Docker images names
DOCKER_ORG=paritytech
PLAYGROUND_BACKEND_API_DOCKER_IMAGE_NAME=${DOCKER_ORG}/substrate-playground-backend-api
PLAYGROUND_BACKEND_UI_DOCKER_IMAGE_NAME=${DOCKER_ORG}/substrate-playground-backend-ui
TEMPLATE_BASE=${DOCKER_ORG}/substrate-playground-template-base
PLAYGROUND_ID=playground-${ENV}
GKE_PROJECT=aerobic-factor-306517
GKE_ZONE=us-central1-a
GKE_CLUSTER=substrate-${PLAYGROUND_ID}
SUBSTRATE_DOMAIN=substrate.io

# Derive CONTEXT from ENV
ifeq ($(ENV), dev)
  CONTEXT=k3d-pg-cluster
else
  CONTEXT=gke_${GKE_PROJECT}_${GKE_ZONE}_${GKE_CLUSTER}
endif

# Derive DOMAIN from ENV
ifeq ($(ENV), production)
  DOMAIN=playground
else
  DOMAIN=${PLAYGROUND_ID}
endif

COLOR_BOLD:= $(shell tput bold)
COLOR_RED:= $(shell tput bold; tput setaf 1)
COLOR_GREEN:= $(shell tput bold; tput setaf 2)
COLOR_RESET:= $(shell tput sgr0)

help:
	@echo "Build and publish playground components"
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n \033[36m\033[0m\n"} /^[0-9a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Docker images

build-editor:
	@if test "$(EDITOR_NAME)" = "" ; then \
		echo "Environment variable EDITOR_NAME not set"; \
		exit 1; \
	fi
	$(eval DOCKER_IMAGE_VERSION=$(shell git rev-parse --short HEAD))
	$(eval PLAYGROUND_EDITOR_IMAGE_NAME=${DOCKER_ORG}/substrate-playground-editor-$(EDITOR_NAME))
	$(eval PLAYGROUND_EDITOR_IMAGE_TAG=${PLAYGROUND_EDITOR_IMAGE_NAME}:sha-${DOCKER_IMAGE_VERSION})
	@docker buildx build --load --force-rm -f resources/editors/${EDITOR_NAME}/Dockerfile --label org.opencontainers.image.version=${DOCKER_IMAGE_VERSION} -t ${PLAYGROUND_EDITOR_IMAGE_TAG} .
	docker image prune -f --filter label=stage=builder

push-editor: build-editor ## Push a newly built editor image on docker.io
	docker push ${PLAYGROUND_EDITOR_IMAGE_TAG}

launch-editor: ## Launch an editor image
	@if test "$(EDITOR_NAME)" = "" ; then \
		echo "Environment variable EDITOR_NAME not set"; \
		exit 1; \
	fi
	@-cd vscode-extension; yarn clean && yarn && yarn build
	@cd resources/editors; docker compose --env-file .env up --build --force-recreate

build-template-base:
	$(eval DOCKER_IMAGE_VERSION=$(shell git rev-parse --short HEAD))
	@docker buildx build --load --force-rm -f resources/Dockerfile.base --label org.opencontainers.image.version=${DOCKER_IMAGE_VERSION} -t ${TEMPLATE_BASE}:sha-${DOCKER_IMAGE_VERSION} .
	docker image prune -f --filter label=stage=builder

push-template-base: build-template-base ## Push a newly template base built image on docker.io
	docker push ${TEMPLATE_BASE}:sha-${DOCKER_IMAGE_VERSION}

build-backend-docker-images: ## Build backend docker images
	$(eval PLAYGROUND_DOCKER_IMAGE_VERSION=$(shell git rev-parse --short HEAD))
	cd frontend; docker buildx build --load -f Dockerfile --build-arg GITHUB_SHA="${PLAYGROUND_DOCKER_IMAGE_VERSION}" --label org.opencontainers.image.version=${PLAYGROUND_DOCKER_IMAGE_VERSION} -t ${PLAYGROUND_BACKEND_UI_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION} .
	@cd backend; docker buildx build --load -f Dockerfile --build-arg GITHUB_SHA="${PLAYGROUND_DOCKER_IMAGE_VERSION}" --label org.opencontainers.image.version=${PLAYGROUND_DOCKER_IMAGE_VERSION} -t ${PLAYGROUND_BACKEND_API_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION} .

push-backend-docker-images: build-backend-docker-images ## Push newly built backend images on docker.io
	docker push ${PLAYGROUND_BACKEND_API_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION}
	docker push ${PLAYGROUND_BACKEND_UI_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION}

##@ Kubernetes deployment

requires-env:
	@echo "You are about to interact with the ${COLOR_GREEN}${ENV}${COLOR_RESET} environment. (Modify the environment by setting the ${COLOR_BOLD}'ENV'${COLOR_RESET} variable)"

requires-k8s: requires-env
	$(eval CURRENT_CONTEXT=$(shell kubectl config current-context))
	$(eval CURRENT_NAMESPACE=$(shell kubectl config view --minify --output 'jsonpath={..namespace}'))
	@echo "(namespace: ${COLOR_GREEN}${CURRENT_NAMESPACE}${COLOR_RESET}, context: ${COLOR_GREEN}${CURRENT_CONTEXT}${COLOR_RESET})"
	@if [ "${CURRENT_CONTEXT}" != "${CONTEXT}" ] ;then \
	  read -p "Current context (${COLOR_GREEN}${CURRENT_CONTEXT}${COLOR_RESET}) doesn't match environment. Update to ${COLOR_RED}${CONTEXT}${COLOR_RESET}? [yN]" proceed; \
	  if [ "$${proceed}" == "Y" ] ;then \
	  	kubectl config use-context ${CONTEXT}; \
	  else \
		exit 1; \
	  fi; \
	fi
ifeq ($(SKIP_ACK), )
	@read -p $$'Ok to proceed? [yN]' answer; if [ "$${answer}" != "Y" ] ;then exit 1; fi
endif

k8s-setup-cluster: requires-k8s ## Create `config` and `secret` static ConfigMap
	@if test "$(GH_CLIENT_ID)" = "" ; then \
		echo "Environment variable GH_CLIENT_ID not set"; \
		exit 1; \
	fi
	@if test "$(GH_CLIENT_SECRET)" = "" ; then \
		echo "Environment variable GH_CLIENT_SECRET not set"; \
		exit 1; \
	fi
	@if test "$(USER_ROLES)" = "" ; then \
		echo "Environment variable USER_ROLES not set"; \
		exit 1; \
	fi
	@kubectl create configmap playground-config --from-literal=user.roles="$${USER_ROLES}" --from-literal=github.clientId="$${GH_CLIENT_ID}" --dry-run=client -o yaml | kubectl apply -f - && \
	kubectl create secret generic playground-secrets --from-literal=github.clientSecret="$${GH_CLIENT_SECRET}" --from-literal=rocket.secretKey=`openssl rand -base64 32` --dry-run=client -o yaml | kubectl apply -f -

k8s-deploy: requires-k8s ## Deploy playground on kubernetes
	kubectl kustomize --enable-helm resources/k8s/overlays/${ENV}/ | kubectl apply -f -

k8s-undeploy: requires-k8s ## Undeploy playground from kubernetes
	@read -p $$'All configuration (including GitHub secrets) will be lost. Ok to proceed? [yN]' answer; if [ "$${answer}" != "Y" ] ;then exit 1; fi
	kubectl kustomize --enable-helm resources/k8s/overlays/${ENV}/ | kubectl delete -f -

k8s-sync-resources: requires-k8s ## Synchronize default resources
	@if test "$(REPOSITORY_ID)" = "" ; then \
		echo "Environment variable REPOSITORY_ID not set"; \
		exit 1; \
	fi
	@if test "$(REPOSITORY)" = "" ; then \
		echo "Environment variable REPOSITORY not set"; \
		exit 1; \
	fi
	@cd scripts; yarn && yarn build && yarn run:sync-playground $${REPOSITORY_ID} $${REPOSITORY}

k8s-restart-backend: requires-k8s ## Restart playground backend
	@kubectl rollout restart deployment  backend-api-deployment

##@ DNS certificates

generate-challenge: requires-env ## Generate a letsencrypt challenge
	sudo certbot certonly --manual --preferred-challenges dns --server https://acme-v02.api.letsencrypt.org/directory --agree-tos -m admin@parity.io -d *.${DOMAIN}.${SUBSTRATE_DOMAIN} -d ${DOMAIN}.${SUBSTRATE_DOMAIN} --cert-name ${DOMAIN}.${SUBSTRATE_DOMAIN}

get-challenge: requires-env
	dig +short TXT _acme-challenge.${DOMAIN}.${SUBSTRATE_DOMAIN} @8.8.8.8

k8s-update-certificate: requires-k8s ## Update the tls certificate
	sudo kubectl create secret tls playground-tls --save-config --key /etc/letsencrypt/live/${DOMAIN}.${SUBSTRATE_DOMAIN}/privkey.pem --cert /etc/letsencrypt/live/${DOMAIN}.${SUBSTRATE_DOMAIN}/fullchain.pem --dry-run=client -o yaml | sudo kubectl apply -f -

##@ K3d cluster

K3d_CLUSTER_NAME=pg-cluster

dev-create-certificate:
	openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout tls.key -out tls.crt -subj "/CN=playground-dev.substrate.test"

k3d-create-cluster: ## Create a new cluster
	k3d cluster create ${K3d_CLUSTER_NAME} --servers 2 --port 80:80@loadbalancer --port 443:443@loadbalancer \
        --k3s-arg '--tls-san=127.0.0.1@server:*' --k3s-arg '--no-deploy=traefik@server:*' \
        --k3s-node-label "app.playground/pool=default@server:1" \
        --k3s-node-label "app.playground/pool-type=user@server:1" \
        --k3s-arg '--node-taint=app.playground/pool-type=user:NoExecute@server:1'

k3d-delete-cluster: ## Delete the existing cluster
	k3d cluster delete ${K3d_CLUSTER_NAME}

##@ Google Kubernetes Engine

gke-static-ip: requires-k8s
	gcloud compute addresses describe --region=${GKE_REGION} --format="value(address)"

gke-create-cluster: requires-env ## Create a new cluster
# See https://cloud.google.com/compute/docs/machine-types
	gcloud container clusters create ${GKE_CLUSTER} \
        --release-channel regular \
        --zone us-central1-a \
        --node-locations us-central1-a \
        --image-type=COS_CONTAINERD \
        --machine-type n2d-standard-4 \
        --disk-size=100GB \
        --disk-type=pd-standard \
        --num-nodes 1 \
        --enable-network-policy

gke-create-user-nodepool: requires-env ## Create a new nodepool
	gcloud container node-pools create user-default \
        --cluster ${GKE_CLUSTER} \
        --num-nodes 1 \
        --node-labels app.playground/pool=default,app.playground/pool-type=user\
        --node-taints app.playground/pool-type=user:NoExecute \
        --disk-size=250GB \
        --disk-type=pd-standard \
        --image-type=COS_CONTAINERD \
        --machine-type n2d-standard-8 \
        --num-nodes 1 \
        --zone us-central1-a \
        --node-locations us-central1-a
