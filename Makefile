.DEFAULT_GOAL=help

ifeq ($(ENVIRONMENT),)
  ENVIRONMENT=staging
endif

ENVIRONMENTS := production staging

ifeq ($(filter $(ENVIRONMENT),$(ENVIRONMENTS)),)
    $(error ENVIRONMENT should be one of ($(ENVIRONMENTS)) but was $(ENVIRONMENT))
endif

ifeq ($(ENVIRONMENT), production)
  IDENTIFIER=playground
else
  IDENTIFIER=playground-${ENVIRONMENT}
endif

GKE_REGION=us-central1
K8S_DEPLOYMENT_FILE_TEMPLATE=conf/k8s/deployment.yaml.tmpl
PLAYGROUND_PORT=8080
PLAYGROUND_HOST=${IDENTIFIER}.substrate.dev
THEIA_WEB_PORT=80
THEIA_FRONTEND_PORT=8080
THEIA_HTTP_PORT=9934
THEIA_WS_PORT=9944
PLAYGROUND_PORT="80"
DOCKER_USERNAME=jeluard
PLAYGROUND_DOCKER_IMAGE_NAME=${DOCKER_USERNAME}/substrate-playground
THEIA_DOCKER_IMAGE_NAME=${DOCKER_USERNAME}/theia-substrate
GOOGLE_PROJECT_ID=substrateplayground-252112

# Show this help.
help:
	@awk '/^#/{c=substr($$0,3);next}c&&/^[[:alpha:]][[:print:]]+:/{print substr($$1,1,index($$1,":")),c}1{c=0}' $(MAKEFILE_LIST) | column -s: -t

# Setup project
setup-frontend:
	cd frontend; yarn

clean-frontend:
	cd frontend; yarn clean

clean-backend:
	cd backend; cargo clean

# Clean all generated files
clean: clean-frontend clean-backend
	@:

## Local development

dev-frontend: setup-frontend
	cd frontend; yarn watch

dev-backend:
	cd backend; RUST_BACKTRACE=1 PLAYGROUND_ASSETS="../frontend/dist" cargo run

## Docker images

# Build theia-substrate docker image
build-theia-docker-image:
	$(eval THEIA_DOCKER_IMAGE_VERSION=$(shell git rev-parse --short HEAD))
	@cd theia-substrate; docker build -f Dockerfile --label git-commit=${THEIA_DOCKER_IMAGE_VERSION} -t ${THEIA_DOCKER_IMAGE_VERSION} . && docker image prune -f --filter label=stage=builder
	docker tag ${THEIA_DOCKER_IMAGE_VERSION} gcr.io/${GOOGLE_PROJECT_ID}/${THEIA_DOCKER_IMAGE_NAME}

# Push a newly built theia image on gcr.io
push-theia-docker-image: build-theia-docker-image
	gcloud docker -- push gcr.io/${GOOGLE_PROJECT_ID}/${THEIA_DOCKER_IMAGE_NAME}

# Build playground docker image
build-playground-docker-image:
	$(eval PLAYGROUND_DOCKER_IMAGE_VERSION=$(shell git rev-parse --short HEAD))
	docker build -f conf/Dockerfile --label git-commit=${PLAYGROUND_DOCKER_IMAGE_VERSION} -t ${PLAYGROUND_DOCKER_IMAGE_VERSION} . && docker image prune -f --filter label=stage=builder
	docker tag ${PLAYGROUND_DOCKER_IMAGE_VERSION} gcr.io/${GOOGLE_PROJECT_ID}/${PLAYGROUND_DOCKER_IMAGE_NAME}

# Push a newly built playground image on gcr.io
push-playground-docker-image: build-playground-docker-image
	gcloud docker -- push gcr.io/${GOOGLE_PROJECT_ID}/${PLAYGROUND_DOCKER_IMAGE_NAME}

## Kubernetes deployment

k8s-assert:
	@read -p $$'You are about to interact with the \e[31m'"${ENVIRONMENT}"$$'\e[0m environment. Ok to proceed? [yN]' answer; \
	if [ "$${answer}" != "Y" ] ;then exit 1; fi

k8s-setup: k8s-assert
	@kubectl create namespace ${IDENTIFIER}

# Deploy nginx on kubernetes
k8s-deploy-nginx: k8s-assert
	$(eval PLAYGROUND_STATIC_IP=$(shell gcloud compute addresses describe ${IDENTIFIER} --region=${GKE_REGION} --format="value(address)"))
	@cat conf/k8s/nginx.yaml | \
	sed 's/\$${K8S_NAMESPACE}'"/${IDENTIFIER}/g" | \
	sed 's/\$${PLAYGROUND_STATIC_IP}'"/${PLAYGROUND_STATIC_IP}/g" | \
	kubectl apply --namespace=${IDENTIFIER} --record -f -

# Undeploy nginx
k8s-undeploy-nginx: k8s-assert
	$(eval PLAYGROUND_STATIC_IP=$(shell gcloud compute addresses describe ${IDENTIFIER} --region=${GKE_REGION} --format="value(address)"))
	@cat conf/k8s/nginx.yaml | \
	sed 's/\$${K8S_NAMESPACE}'"/${IDENTIFIER}/g" | \
	sed 's/\$${PLAYGROUND_STATIC_IP}'"/${PLAYGROUND_STATIC_IP}/g" | \
	kubectl delete --namespace=${IDENTIFIER} -f -

# Deploy playground on kubernetes
k8s-deploy-playground: k8s-assert
ifeq ($(PLAYGROUND_DOCKER_IMAGE_VERSION), )
	$(error 'PLAYGROUND_DOCKER_IMAGE_VERSION' must be defined)
endif
	@echo "Deploying ${PLAYGROUND_DOCKER_IMAGE_VERSION}"
	@cat ${K8S_DEPLOYMENT_FILE_TEMPLATE} | \
	sed 's/\$${ENVIRONMENT}'"/${ENVIRONMENT}/g" | \
	sed 's/\$${K8S_NAMESPACE}'"/${IDENTIFIER}/g" | \
	sed 's/\$${PLAYGROUND_PORT}'"/${PLAYGROUND_PORT}/g" | \
	sed 's~\$${IMAGE}'"~${PLAYGROUND_DOCKER_IMAGE_VERSION}~g" | \
	sed 's/\$${PLAYGROUND_HOST}'"/${PLAYGROUND_HOST}/g" | \
	kubectl apply --namespace=${IDENTIFIER} --record -f -

# Undeploy playground from kubernetes
k8s-undeploy-playground: k8s-assert
ifeq ($(PLAYGROUND_DOCKER_IMAGE_VERSION), )
	$(error 'PLAYGROUND_DOCKER_IMAGE_VERSION' must be defined)
endif
	@echo "Undeploying ${PLAYGROUND_DOCKER_IMAGE_VERSION}"
	@cat ${K8S_DEPLOYMENT_FILE_TEMPLATE} | \
	sed 's/\$${ENVIRONMENT}'"/${ENVIRONMENT}/g" | \
	sed 's/\$${K8S_NAMESPACE}'"/${IDENTIFIER}/g" | \
	sed 's/\$${PLAYGROUND_PORT}'"/${PLAYGROUND_PORT}/g" | \
	sed 's~\$${IMAGE}'"~${PLAYGROUND_DOCKER_IMAGE_VERSION}~g" | \
	sed 's/\$${PLAYGROUND_HOST}'"/${PLAYGROUND_HOST}/g" | \
	kubectl delete --namespace=${IDENTIFIER} -f -

# Undeploy all theia-substrate pods and services from kubernetes
k8s-undeploy-theia: k8s-assert
	kubectl delete pods,services -l app=theia-substrate --namespace=${IDENTIFIER}

# Creates or replaces the `images` config map from `conf/k8s/images/*.properties`
k8s-update-images-config: k8s-assert
	kubectl create configmap theia-images --namespace=${IDENTIFIER} --from-env-file=conf/k8s/images/${ENVIRONMENT}.properties --dry-run -o yaml | kubectl apply -f -