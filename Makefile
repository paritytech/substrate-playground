.DEFAULT_GOAL=help

# Check if required tools are installed
ifeq (, $(shell which jq))
    $(error "jq not installed, see https://stedolan.github.io/jq/")
endif

ifeq (, $(shell which yq))
    $(error "yq not installed, see https://kislyuk.github.io/yq/")
endif

ifeq (, $(shell which docker))
    $(error "docker not installed, see https://docs.docker.com/get-docker/")
endif

ifeq (, $(shell which kubectl))
    $(error "kubectl not installed, see https://kubernetes.io/docs/tasks/tools/install-kubectl/")
endif

ifeq (, $(shell which gcloud))
    $(error "gcloud not installed, see https://cloud.google.com/sdk/docs/install")
endif

ifeq (, $(shell which kustomize))
    $(error "kustomize not installed, see https://github.com/kubernetes-sigs/kustomize")
endif

ifeq (, $(shell which helm))
    $(error "helm not installed, see https://helm.sh/docs/intro/install/")
endif

# ENV defaults to dev
ENV?=dev

# Extract all environments from conf/k8s/overlays/
ENVS := $(shell cd conf/k8s/overlays/ && ls -d *)

ifeq ($(filter $(ENV),$(ENVS)),)
    $(error ENV should be one of ($(ENVS)) but was $(ENV))
endif

# Docker images names
PLAYGROUND_BACKEND_API_DOCKER_IMAGE_NAME=${DOCKER_ORG}/substrate-playground-backend-api
PLAYGROUND_BACKEND_UI_DOCKER_IMAGE_NAME=${DOCKER_ORG}/substrate-playground-backend-ui
TEMPLATE_BASE=${DOCKER_ORG}/substrate-playground-template-base
PLAYGROUND_ID=playground-${ENV}
GKE_CLUSTER=substrate-${PLAYGROUND_ID}

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

# Include .env for extra customisable ENV variable
include .env

# TODO check all required env are defined? GKE_PROJECT, GKE_ZONE, DOCKER_ORG

help:
	@echo "Build and publish playground components"
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n \033[36m\033[0m\n"} /^[0-9a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

clean-frontend:
	cd frontend; yarn clean

clean-backend:
	cd backend; cargo clean

clean: clean-frontend clean-backend ## Clean all generated files
	@:

##@ Docker images

build-template-base:
	$(eval DOCKER_IMAGE_VERSION=$(shell git rev-parse --short HEAD))
	@cd templates; docker buildx build --load --force-rm -f Dockerfile.base --label org.opencontainers.image.version=${DOCKER_IMAGE_VERSION} -t ${TEMPLATE_BASE}:sha-${DOCKER_IMAGE_VERSION} .
	docker image prune -f --filter label=stage=builder

push-template-base: build-template-base ## Push a newly built image on docker.io
	docker push ${TEMPLATE_BASE}:sha-${DOCKER_IMAGE_VERSION}

build-openvscode-template:
	@if test "$(TEMPLATE)" = "" ; then \
		echo "Environment variable TEMPLATE not set"; \
		exit 1; \
	fi
	$(eval BASE_TEMPLATE_VERSION=$(shell grep BASE_TEMPLATE_VERSION conf/templates/.env | cut -d '=' -f2))
	$(eval REPOSITORY=$(shell cat conf/templates/${TEMPLATE} | yq -r .repository))
	$(eval REF=$(shell cat conf/templates/${TEMPLATE} | yq -r .ref))
	$(eval REPOSITORY_CLONE=.clone)
	@mkdir -p templates/${REPOSITORY_CLONE}; cd templates/${REPOSITORY_CLONE}; git init; git remote add origin https://github.com/${REPOSITORY}.git; git fetch --all \
    && git checkout ${REF} \
    $(eval REV = $(shell git rev-parse --short HEAD))

	$(eval TAG=paritytech/substrate-playground-template-${TEMPLATE}:sha-${REV})
	$(eval TAG_OPENVSCODE=paritytech/substrate-playground-template-${TEMPLATE}-openvscode:sha-${REV})
	@cd templates; docker buildx build --load --force-rm --build-arg BASE_TEMPLATE_VERSION=${BASE_TEMPLATE_VERSION} -t ${TAG} -f Dockerfile.template ${REPOSITORY_CLONE} \
	&& docker buildx build --load --force-rm --build-arg TEMPLATE_IMAGE=${TAG} -t ${TAG_OPENVSCODE} -f Dockerfile.openvscode-template .
	@rm -rf templates/${REPOSITORY_CLONE}

push-template: build-openvscode-template
	docker push ${TAG}
	docker push ${TAG_OPENVSCODE}

build-backend-docker-images: ## Build backend docker images
	$(eval PLAYGROUND_DOCKER_IMAGE_VERSION=$(shell git rev-parse --short HEAD))
	@cd frontend; docker buildx build --load --force-rm -f Dockerfile --build-arg GITHUB_SHA="${PLAYGROUND_DOCKER_IMAGE_VERSION}" --label org.opencontainers.image.version=${PLAYGROUND_DOCKER_IMAGE_VERSION} -t ${PLAYGROUND_BACKEND_UI_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION} .
	@cd backend; docker buildx build --load --force-rm -f Dockerfile --build-arg GITHUB_SHA="${PLAYGROUND_DOCKER_IMAGE_VERSION}" --label org.opencontainers.image.version=${PLAYGROUND_DOCKER_IMAGE_VERSION} -t ${PLAYGROUND_BACKEND_API_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION} .
	docker image prune -f --filter label=stage=builder

push-backend-docker-images: build-backend-docker-images ## Push newly built backend images on docker.io
	docker push ${PLAYGROUND_BACKEND_API_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION}
	docker push ${PLAYGROUND_BACKEND_UI_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION}

requires-env:
	@echo "You are about to interact with the ${COLOR_GREEN}${ENV}${COLOR_RESET} environment. (Modify the environment by setting the ${COLOR_BOLD}'ENV'${COLOR_RESET} variable)"

##@ Kubernetes deployment

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

k8s-setup-env: requires-k8s
	@read -p "GH client ID?" CLIENT_ID; \
	read -p "GH client secret?" CLIENT_SECRET; \
	kubectl create configmap playground-config --from-literal=github.clientId="$${CLIENT_ID}" --from-literal=workspace.defaultDuration="45" --from-literal=workspace.maxDuration="1440" --from-literal=workspace.defaultMaxPerNode="6" --from-literal=workspace.defaultPoolAffinity="default" --dry-run=client -o yaml | kubectl apply -f - && \
	kubectl create secret generic playground-secrets --from-literal=github.clientSecret="$${CLIENT_SECRET}" --from-literal=rocket.secretKey=`openssl rand -base64 32` --dry-run=client -o yaml | kubectl apply -f -

k8s-deploy: requires-k8s ## Deploy playground on kubernetes
	kustomize build --enable-helm conf/k8s/overlays/${ENV}/ | kubectl apply -f -

k8s-undeploy: requires-k8s ## Undeploy playground from kubernetes
	@read -p $$'All configuration (including GitHub secrets) will be lost. Ok to proceed? [yN]' answer; if [ "$${answer}" != "Y" ] ;then exit 1; fi
	kustomize build --enable-helm conf/k8s/overlays/${ENV}/ | kubectl delete -f -

##@ DNS certificates

generate-challenge: requires-env
	sudo certbot certonly --manual --preferred-challenges dns --server https://acme-v02.api.letsencrypt.org/directory --agree-tos -m admin@parity.io -d *.${DOMAIN}.substrate.dev -d ${DOMAIN}.substrate.dev --cert-name ${DOMAIN}.substrate.dev

get-challenge: requires-env
	dig +short TXT _acme-challenge.${DOMAIN}.substrate.dev @8.8.8.8

k8s-update-certificate: requires-k8s
	sudo kubectl create secret tls playground-tls --save-config --key /etc/letsencrypt/live/${DOMAIN}.substrate.dev/privkey.pem --cert /etc/letsencrypt/live/${DOMAIN}.substrate.dev/fullchain.pem --dry-run=client -o yaml | sudo kubectl apply -f -

##@ K3d

K3d_CLUSTER_NAME=pg-cluster

dev-create-certificate:
	openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout tls.key -out tls.crt -subj "/CN=playground-dev.substrate.test"

k3d-create-cluster:
	k3d cluster create ${K3d_CLUSTER_NAME} --servers 2 --port 80:80@loadbalancer --port 443:443@loadbalancer \
        --k3s-arg '--tls-san=127.0.0.1@server:*' --k3s-arg '--no-deploy=traefik@server:*' \
        --k3s-node-label "app.playground/pool=default@server:1" \
        --k3s-node-label "app.playground/pool-type=user@server:1" \
        --k3s-arg '--node-taint=app.playground/pool-type=user:NoExecute@server:1'

k3d-delete-cluster:
	k3d cluster delete ${K3d_CLUSTER_NAME}

##@ Google Kubernetes Engine

gke-static-ip: requires-k8s
	gcloud compute addresses describe --region=${GKE_REGION} --format="value(address)"

gke-create-cluster: requires-env
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

gke-create-user-nodepool: requires-env
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
