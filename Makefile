.DEFAULT_GOAL=help

# ENVIRONMENT defaults to dev
ifeq ($(ENVIRONMENT),)
  ENVIRONMENT=dev
endif

ENVIRONMENTS := production staging dev

ifeq ($(filter $(ENVIRONMENT),$(ENVIRONMENTS)),)
    $(error ENVIRONMENT should be one of ($(ENVIRONMENTS)) but was $(ENVIRONMENT))
endif

GKE_REGION=us-central1
DOCKER_USERNAME=paritytech
PLAYGROUND_BACKEND_API_DOCKER_IMAGE_NAME=${DOCKER_USERNAME}/substrate-playground-backend-api
PLAYGROUND_BACKEND_UI_DOCKER_IMAGE_NAME=${DOCKER_USERNAME}/substrate-playground-backend-ui
TEMPLATE_BASE=${DOCKER_USERNAME}/substrate-playground-template-base
TEMPLATE_THEIA_BASE=${DOCKER_USERNAME}/substrate-playground-template-theia-base

# Derive NAMESPACE and CONTEXT from ENVIRONMENT
ifeq ($(NAMESPACE), production)
  NAMESPACE=playground
  CONTEXT=gke_substrateplayground-252112_${GKE_REGION}-a_substrate-playground
else ifeq ($(ENVIRONMENT), staging)
  NAMESPACE=playground-staging
  CONTEXT=gke_substrateplayground-252112_${GKE_REGION}-a_susbtrate-playground-staging
else
  NAMESPACE=default
  CONTEXT=docker-desktop
endif

COLOR_BOLD:= $(shell tput bold)
COLOR_RED:= $(shell tput bold; tput setaf 1)
COLOR_GREEN:= $(shell tput bold; tput setaf 2)
COLOR_RESET:= $(shell tput sgr0)

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

k8s-gke-static-ip: k8s-setup
	gcloud compute addresses describe ${NAMESPACE} --region=${GKE_REGION} --format="value(address)"

k8s-dev: k8s-setup
	@cd conf/k8s; skaffold dev

k8s-deploy-playground: k8s-setup ## Deploy playground on kubernetes
	kustomize build conf/k8s/overlays/${ENVIRONMENT}/ | kubectl apply --record -f -

k8s-undeploy-playground: k8s-setup ## Undeploy playground from kubernetes
	# Do not delete `${ENVIRONMENT}` namespace as it would remove all ConfigMaps/Secrets too
	kustomize build conf/k8s/overlays/${ENVIRONMENT}/ | kubectl delete -f -

k8s-undeploy-theia: k8s-setup ## Undeploy all theia pods and services from kubernetes
	kubectl delete pods,services -l app.kubernetes.io/component=theia --namespace=${NAMESPACE}

k8s-update-templates-config: k8s-setup ## Creates or replaces the `templates` config map from `conf/k8s/overlays/ENVIRONMENT/templates`
	kubectl create configmap templates --namespace=${NAMESPACE} --from-file=conf/k8s/overlays/${ENVIRONMENT}/templates/ --dry-run=client -o yaml | kubectl apply -f -