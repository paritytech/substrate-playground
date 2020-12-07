.DEFAULT_GOAL=help

# Check if required tools are installed
ifeq (, $(shell which jq))
    $(error "jq not installed, see https://stedolan.github.io/jq/")
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

# ENVIRONMENT defaults to dev
ifeq ($(ENVIRONMENT),)
  ENVIRONMENT=dev
endif

# Extract all environments from conf/k8s/overlays/
ENVIRONMENTS := $(shell cd conf/k8s/overlays/ && ls -d *)

ifeq ($(filter $(ENVIRONMENT),$(ENVIRONMENTS)),)
    $(error ENVIRONMENT should be one of ($(ENVIRONMENTS)) but was $(ENVIRONMENT))
endif

# Docker images names
PLAYGROUND_BACKEND_API_DOCKER_IMAGE_NAME=${DOCKER_ORG}/substrate-playground-backend-api
PLAYGROUND_BACKEND_UI_DOCKER_IMAGE_NAME=${DOCKER_ORG}/substrate-playground-backend-ui
TEMPLATE_BASE=${DOCKER_ORG}/substrate-playground-template-base
TEMPLATE_THEIA_BASE=${DOCKER_ORG}/substrate-playground-template-theia-base
GKE_CLUSTER=substrate-playground-${ENVIRONMENT}

# Derive CONTEXT from ENVIRONMENT
ifeq ($(ENVIRONMENT), dev)
  CONTEXT=docker-desktop
else
  CONTEXT=gke_${GKE_PROJECT}_${GKE_ZONE}_${GKE_CLUSTER}
endif

COLOR_BOLD:= $(shell tput bold)
COLOR_RED:= $(shell tput bold; tput setaf 1)
COLOR_GREEN:= $(shell tput bold; tput setaf 2)
COLOR_RESET:= $(shell tput sgr0)

# Include .env for extra customisable ENV variable 
include .env
# Include an optional .env for per environment ENV variable
-include .env.${ENVIRONMENT}

# TODO check all required env are defined? BASE_TEMPLATE_VERSION, NAMESPACE, GKE_PROJECT, GKE_ZONE, DOCKER_ORG

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

build-template-base: ## Build theia docker images
	$(eval THEIA_DOCKER_IMAGE_VERSION=$(shell git rev-parse --short HEAD))
	@cd templates; docker build --force-rm -f Dockerfile.base --label org.opencontainers.image.version=${THEIA_DOCKER_IMAGE_VERSION} -t ${TEMPLATE_BASE}:sha-${THEIA_DOCKER_IMAGE_VERSION} .
	docker image prune -f --filter label=stage=builder

push-template-base: build-template-base ## Push a newly built theia image on docker.io
	docker push ${TEMPLATE_BASE}:sha-${THEIA_DOCKER_IMAGE_VERSION}

build-template-theia-base:
	$(eval THEIA_DOCKER_IMAGE_VERSION=$(shell git rev-parse --short HEAD))
	@cd templates; docker build --force-rm -f Dockerfile.theia-base --label org.opencontainers.image.version=${THEIA_DOCKER_IMAGE_VERSION} -t ${TEMPLATE_THEIA_BASE}:sha-${THEIA_DOCKER_IMAGE_VERSION} .
	docker image prune -f --filter label=stage=builder

push-template-theia-base: build-template-theia-base ## Push a newly built theia image on docker.io
	docker push ${TEMPLATE_THEIA_BASE}:sha-${THEIA_DOCKER_IMAGE_VERSION}

build-test-templates: build-template-base build-template-theia-base
	$(eval THEIA_DOCKER_IMAGE_VERSION=$(shell git rev-parse --short HEAD))
	$(eval TAG=paritytech/substrate-playground-template-test:latest)
	$(eval TAG_THEIA=paritytech/substrate-playground-template-test-theia:latest)
	@cd templates; docker build --force-rm --build-arg BASE_TEMPLATE_VERSION=sha-${THEIA_DOCKER_IMAGE_VERSION} -t ${TAG} -f Dockerfile.template test
	@cd templates; docker build --force-rm --build-arg BASE_TEMPLATE_VERSION=sha-${THEIA_DOCKER_IMAGE_VERSION} --build-arg TEMPLATE_IMAGE=${TAG} -t ${TAG_THEIA} -f Dockerfile.theia-template .

push-test-templates: build-test-templates 
	docker push paritytech/substrate-playground-template-test:latest
	docker push paritytech/substrate-playground-template-test-theia:latest

run-test-template: push-test-templates ## Run a fresh Test theia template
	docker run -p 3000:3000 paritytech/substrate-playground-template-test-theia:latest
	python -m webbrowser -t http://localhost:3000

build-backend-docker-images: ## Build backend docker images
	$(eval PLAYGROUND_DOCKER_IMAGE_VERSION=$(shell git rev-parse --short HEAD))
	@cd backend; docker build --force-rm -f Dockerfile --build-arg GITHUB_SHA="${PLAYGROUND_DOCKER_IMAGE_VERSION}" --label org.opencontainers.image.version=${PLAYGROUND_DOCKER_IMAGE_VERSION} -t ${PLAYGROUND_BACKEND_API_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION} .
	@cd frontend; docker build --force-rm -f Dockerfile --build-arg GITHUB_SHA="${PLAYGROUND_DOCKER_IMAGE_VERSION}" --label org.opencontainers.image.version=${PLAYGROUND_DOCKER_IMAGE_VERSION} -t ${PLAYGROUND_BACKEND_UI_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION} .
	docker image prune -f --filter label=stage=builder

push-backend-docker-images: build-backend-docker-images ## Push newly built backend images on docker.io
	docker push ${PLAYGROUND_BACKEND_API_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION}
	docker push ${PLAYGROUND_BACKEND_UI_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION}

##@ Kubernetes deployment

k8s-setup:
	$(eval CURRENT_CONTEXT=$(shell kubectl config current-context))
	$(eval CURRENT_NAMESPACE=$(shell kubectl config view --minify --output 'jsonpath={..namespace}'))
	@echo "You are about to interact with the ${COLOR_GREEN}${ENVIRONMENT}${COLOR_RESET} environment. (Modify the environment by setting the ${COLOR_BOLD}'ENVIRONMENT'${COLOR_RESET} variable)"
	@echo "(namespace: ${COLOR_GREEN}${CURRENT_NAMESPACE}${COLOR_RESET}, context: ${COLOR_GREEN}${CURRENT_CONTEXT}${COLOR_RESET})"
	@if [ "${CURRENT_CONTEXT}" != "${CONTEXT}" ] ;then \
	  read -p "Current context (${COLOR_GREEN}${CURRENT_CONTEXT}${COLOR_RESET}) doesn't match environment. Update to ${COLOR_RED}${CONTEXT}${COLOR_RESET}? [yN]" proceed; \
	  if [ "$${proceed}" == "Y" ] ;then \
	  	kubectl config use-context ${CONTEXT}; \
	  else \
		exit 1; \
	  fi; \
	fi
	@if [ "${CURRENT_NAMESPACE}" != "${NAMESPACE}" ] ;then \
	  read -p "Current namespace (${COLOR_GREEN}${CURRENT_NAMESPACE}${COLOR_RESET}) doesn't match environment. Update to ${COLOR_RED}${NAMESPACE}${COLOR_RESET}? [yN]" proceed; \
	  if [ "$${proceed}" == "Y" ] ;then \
	  	kubectl config set-context --current --namespace=${NAMESPACE}; \
	  else \
		exit 1; \
	  fi; \
	fi
ifeq ($(SKIP_ACK), )
	@read -p $$'Ok to proceed? [yN]' answer; if [ "$${answer}" != "Y" ] ;then exit 1; fi
endif

k8s-status: k8s-setup
	@kubectl get configmap playground-config &> /dev/null && [ $$? -eq 0 ] || (echo "Missing config 'playground-config'"; exit 1)
	@#TODO check proper content: @kubectl get configmap playground-config -o json | jq -r '.data'
	@kubectl get configmap playground-templates &> /dev/null && [ $$? -eq 0 ] || (echo "Missing config 'playground-templates'"; exit 1)
	@kubectl get configmap playground-users &> /dev/null && [ $$? -eq 0 ] || (echo "Missing config 'playground-users'"; exit 1)
	@kubectl get secrets playground-secrets &> /dev/null && [ $$? -eq 0 ] || (echo "Missing secrets 'playground-secrets'"; exit 1)
	@#TODO check deployment is correctly running

k8s-gke-static-ip: k8s-setup
	gcloud compute addresses describe ${NAMESPACE} --region=${GKE_REGION} --format="value(address)"

k8s-dev: k8s-setup
	@cd conf/k8s; skaffold dev

k8s-deploy-playground: k8s-setup ## Deploy playground on kubernetes
	kustomize build conf/k8s/overlays/${ENVIRONMENT}/ | kubectl apply --record -f -

k8s-undeploy-playground: k8s-setup ## Undeploy playground from kubernetes
	kustomize build conf/k8s/overlays/${ENVIRONMENT}/ | kubectl delete -f -

k8s-undeploy-theia: k8s-setup ## Undeploy all theia pods and services from kubernetes
	kubectl delete pods,services -l app.kubernetes.io/component=theia --namespace=${NAMESPACE}

k8s-update-templates-config: k8s-setup ## Creates or replaces the `templates` config map from `conf/k8s/overlays/ENVIRONMENT/templates`
	kubectl create configmap playground-templates --namespace=${NAMESPACE} --from-file=conf/k8s/overlays/${ENVIRONMENT}/templates/ --dry-run=client -o yaml | kubectl apply -f -

k8s-update-users-config: k8s-setup ## Creates or replaces the `users` config map from `conf/k8s/overlays/ENVIRONMENT/users.yaml`
	kubectl create configmap playground-users --namespace=${NAMESPACE} --from-file=conf/k8s/overlays/${ENVIRONMENT}/users.yaml --dry-run=client -o yaml | kubectl apply -f -