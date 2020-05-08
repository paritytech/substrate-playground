.DEFAULT_GOAL=help

ifeq ($(ENVIRONMENT),)
  ENVIRONMENT=dev
endif

ENVIRONMENTS := production staging dev

ifeq ($(filter $(ENVIRONMENT),$(ENVIRONMENTS)),)
    $(error ENVIRONMENT should be one of ($(ENVIRONMENTS)) but was $(ENVIRONMENT))
endif

ifeq ($(ENVIRONMENT), production)
  IDENTIFIER=playground
else ifeq ($(ENVIRONMENT), dev)
  IDENTIFIER=default
else
  IDENTIFIER=playground-${ENVIRONMENT}
endif

GKE_REGION=us-central1
DOCKER_USERNAME=jeluard
PLAYGROUND_SERVER_DOCKER_IMAGE_NAME=${DOCKER_USERNAME}/substrate-playground-server
PLAYGROUND_UI_DOCKER_IMAGE_NAME=${DOCKER_USERNAME}/substrate-playground-ui
THEIA_DOCKER_IMAGE_NAME=${DOCKER_USERNAME}/theia-substrate
GOOGLE_PROJECT_ID=substrateplayground-252112

COLOR_BOLD:= $(shell tput bold)
COLOR_RED:= $(shell tput bold; tput setaf 1)
COLOR_GREEN:= $(shell tput bold; tput setaf 2)
COLOR_RESET:= $(shell tput sgr0)

# Show this help.
help:
	@awk '/^#/{c=substr($$0,3);next}c&&/^[[:alpha:]][[:print:]]+:/{print substr($$1,1,index($$1,":")),c}1{c=0}' $(MAKEFILE_LIST) | column -s: -t

clean-frontend:
	cd frontend; yarn clean

clean-backend:
	cd backend; cargo clean

# Clean all generated files
clean: clean-frontend clean-backend
	@:

## Local development

dev-frontend:
	cd frontend; yarn && yarn watch

dev-backend:
	cd backend; ln -sf ../frontend/dist static; RUST_BACKTRACE=1 cargo run

## Docker images

### Images tags follow https://github.com/opencontainers/image-spec/blob/master/annotations.md

# Build theia docker image
build-theia-docker-image:
	$(eval THEIA_DOCKER_IMAGE_VERSION=$(shell git rev-parse --short HEAD))
	@cd templates; docker build -f Dockerfile --label org.opencontainers.image.version=${THEIA_DOCKER_IMAGE_VERSION} -t ${THEIA_DOCKER_IMAGE_NAME}:sha-${THEIA_DOCKER_IMAGE_VERSION} --rm . && docker image prune -f --filter label=stage=builder
	docker tag ${THEIA_DOCKER_IMAGE_NAME}:sha-${THEIA_DOCKER_IMAGE_VERSION} gcr.io/${GOOGLE_PROJECT_ID}/${THEIA_DOCKER_IMAGE_NAME}

# Push a newly built theia image on docker.io and gcr.io
push-theia-docker-image: build-theia-docker-image
	docker push ${THEIA_DOCKER_IMAGE_NAME}:sha-${THEIA_DOCKER_IMAGE_VERSION}
	docker push gcr.io/${GOOGLE_PROJECT_ID}/${THEIA_DOCKER_IMAGE_NAME}

# Build backend docker image
build-backend-docker-image:
	$(eval PLAYGROUND_DOCKER_IMAGE_VERSION=$(shell git rev-parse --short HEAD))
	docker build -f backend/Dockerfile --label org.opencontainers.image.version=${PLAYGROUND_DOCKER_IMAGE_VERSION} -t ${PLAYGROUND_SERVER_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION} . && docker image prune -f --filter label=stage=builder
	docker tag ${PLAYGROUND_SERVER_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION} gcr.io/${GOOGLE_PROJECT_ID}/${PLAYGROUND_SERVER_DOCKER_IMAGE_NAME}
	docker build -f frontend/Dockerfile --label org.opencontainers.image.version=${PLAYGROUND_DOCKER_IMAGE_VERSION} -t ${PLAYGROUND_UI_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION} . && docker image prune -f --filter label=stage=builder
	docker tag ${PLAYGROUND_UI_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION} gcr.io/${GOOGLE_PROJECT_ID}/${PLAYGROUND_UI_DOCKER_IMAGE_NAME}

# Push newly built backend images on docker.io and gcr.io
push-backend-docker-image: build-backend-docker-image
	docker push ${PLAYGROUND_SERVER_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION}
	docker push gcr.io/${GOOGLE_PROJECT_ID}/${PLAYGROUND_SERVER_DOCKER_IMAGE_NAME}
	docker push ${PLAYGROUND_UI_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION}
	docker push gcr.io/${GOOGLE_PROJECT_ID}/${PLAYGROUND_UI_DOCKER_IMAGE_NAME}

## Kubernetes deployment

k8s-assert:
	$(eval CURRENT_NAMESPACE=$(shell kubectl config view --minify --output 'jsonpath={..namespace}'))
	$(eval CURRENT_CONTEXT=$(shell kubectl config current-context))
	@echo "You are about to interact with the ${COLOR_GREEN}${ENVIRONMENT}${COLOR_RESET} environment. (Modify the environment by setting the ${COLOR_BOLD}'ENVIRONMENT'${COLOR_RESET} variable)"
	@echo "(namespace: ${COLOR_GREEN}${CURRENT_NAMESPACE}${COLOR_RESET}, context: ${COLOR_GREEN}${CURRENT_CONTEXT}${COLOR_RESET})"
	@if [ "${CURRENT_NAMESPACE}" != "${IDENTIFIER}" ] ;then \
	  read -p "Current namespace (${COLOR_GREEN}${CURRENT_NAMESPACE}${COLOR_RESET}) doesn't match environment. Update to ${COLOR_RED}${IDENTIFIER}${COLOR_RESET}? [yN]" proceed; \
	  if [ "$${proceed}" == "Y" ] ;then \
	  	kubectl config set-context --current --namespace=${IDENTIFIER}; \
	  else \
		exit 1; \
	  fi; \
	fi
ifeq ($(SKIP_ACK), )
	@read -p $$'Ok to proceed? [yN]' answer; if [ "$${answer}" != "Y" ] ;then exit 1; fi
endif

k8s-setup-development: k8s-assert
	kubectl config use-context docker-for-desktop
	kubectl config set-context --current --namespace=${IDENTIFIER}

k8s-setup-gke: k8s-assert
	kubectl config use-context gke_substrateplayground-252112_us-central1-a_substrate-${IDENTIFIER}
	kubectl config set-context --current --namespace=${IDENTIFIER}

k8s-gke-static-ip: k8s-assert
	gcloud compute addresses describe ${IDENTIFIER} --region=${GKE_REGION} --format="value(address)"

k8s-update-playground-version:
	$(eval PLAYGROUND_DOCKER_IMAGE_VERSION=$(shell git rev-parse --short HEAD))
	kustomize edit set image gcr.io/${GOOGLE_PROJECT_ID}/${PLAYGROUND_SERVER_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION};
	kustomize edit set image gcr.io/${GOOGLE_PROJECT_ID}/${PLAYGROUND_UI_DOCKER_IMAGE_NAME}:sha-${PLAYGROUND_DOCKER_IMAGE_VERSION};

# Deploy playground on kubernetes
k8s-deploy-playground: k8s-assert
	kustomize build conf/k8s/overlays/${ENVIRONMENT}/ | kubectl apply --record -f -

# Undeploy playground from kubernetes
k8s-undeploy-playground: k8s-assert
	# Do not delete `${ENVIRONMENT}` namespace as it would remove all ConfigMaps/Secrets too
	kubectl delete -k conf/k8s/overlays/${ENVIRONMENT}

# Undeploy all theia pods and services from kubernetes
k8s-undeploy-theia: k8s-assert
	kubectl delete pods,services -l app.kubernetes.io/component=theia --namespace=${IDENTIFIER}

# Creates or replaces the `templates` config map from `conf/k8s/overlays/ENVIRONMENT/templates`
k8s-update-templates-config: k8s-assert
	kubectl create configmap templates --namespace=${IDENTIFIER} --from-file=conf/k8s/overlays/${ENVIRONMENT}/templates/ --dry-run -o yaml | kubectl apply -f -