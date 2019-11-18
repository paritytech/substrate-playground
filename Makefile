.DEFAULT_GOAL=help

ENVIRONMENT=staging
ENVIRONMENT_FILE=$(join .env., $(ENVIRONMENT))

include $(ENVIRONMENT_FILE)

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

THEIA_IMAGE_NAME="jeluard/theia-substrate"
THEIA_IMAGE_VERSION="${ENVIRONMENT}-latest"
THEIA_IMAGE="${THEIA_IMAGE_NAME}:${THEIA_IMAGE_VERSION}"

# Build theia-substrate docker image
build-theia-docker-image:
	@cd theia-substrate; docker build --no-cache -f Dockerfile -t ${THEIA_IMAGE} . && docker image prune -f --filter label=stage=builder

# Build theia-substrate docker image
push-theia-docker-image: build-theia-docker-image
	docker push ${THEIA_IMAGE}

run-theia-docker-image: build-theia-docker-image
	docker run -d -p 80:80 ${THEIA_IMAGE}

PLAYGROUND_PORT="80"
PLAYGROUND_IMAGE_NAME="jeluard/substrate-playground"
PLAYGROUND_IMAGE_VERSION="${ENVIRONMENT}-latest"
PLAYGROUND_IMAGE="${PLAYGROUND_IMAGE_NAME}:${PLAYGROUND_IMAGE_VERSION}"

# Build playground docker image
build-playground-docker-image:
	docker build --build-arg PORT=${PLAYGROUND_PORT} --build-arg ENVIRONMENT=${ENVIRONMENT} --build-arg PLAYGROUND_HOST=${HOST} --build-arg K8S_NAMESPACE=${K8S_NAMESPACE} -f Dockerfile -t ${PLAYGROUND_IMAGE} . && docker image prune -f --filter label=stage=builder

push-playground-docker-image: build-playground-docker-image
	docker push ${PLAYGROUND_IMAGE}

run-playground-docker-image: build-playground-docker-image
	docker run -d -p 80:${PLAYGROUND_PORT} ${PLAYGROUND_IMAGE}

## Kubernetes deployment

k8s-assert:
	@read -p $$'You are about to interact with the \e[31m'"${ENVIRONMENT}"$$'\e[0m environment. Ok to proceed? [yN]' answer; \
	if [ "$${answer}" != "Y" ] ;then exit 1; fi

k8s-setup: k8s-assert
	@kubectl create namespace ${K8S_NAMESPACE}

# Deploy playground on kubernetes
k8s-deploy-playground: k8s-assert
	@cat ${K8S_DEPLOYMENT_FILE_TEMPLATE} | \
	sed 's/\$${K8S_NAMESPACE}'"/${K8S_NAMESPACE}/g" | \
	sed 's/\$${PLAYGROUND_PORT}'"/${PLAYGROUND_PORT}/g" | \
	sed 's/\$${IMAGE}'"/${IMAGE}/g" | \
	sed 's/\$${HOST}'"/${HOST}/g" | \
	sed 's/\$${PLAYGROUND_STATIC_IP}'"/${PLAYGROUND_STATIC_IP}/g" | \
	sed 's/\$${GLOBAL_IP_NAME}'"/${GLOBAL_IP_NAME}/g" | \
	sed 's/\$${GLOBAL_THEIA_IP_NAME}'"/${GLOBAL_THEIA_IP_NAME}/g" | \
	kubectl apply --namespace=${K8S_NAMESPACE} --record -f -

# Undeploy playground from kubernetes
k8s-undeploy-playground: k8s-assert
	@cat ${K8S_DEPLOYMENT_FILE_TEMPLATE} | \
	sed 's/\$${K8S_NAMESPACE}'"/${K8S_NAMESPACE}/g" | \
	sed 's/\$${PLAYGROUND_PORT}'"/${PLAYGROUND_PORT}/g" | \
	sed 's/\$${IMAGE}'"/${IMAGE}/g" | \
	sed 's/\$${HOST}'"/${HOST}/g" | \
	sed 's/\$${PLAYGROUND_STATIC_IP}'"/${PLAYGROUND_STATIC_IP}/g" | \
	sed 's/\$${GLOBAL_IP_NAME}'"/${GLOBAL_IP_NAME}/g" | \
	sed 's/\$${GLOBAL_THEIA_IP_NAME}'"/${GLOBAL_THEIA_IP_NAME}/g" | \
	kubectl delete --namespace=${K8S_NAMESPACE} -f -

# Undeploy all theia-substrate pods and services from kubernetes
k8s-undeploy-theia: k8s-assert
	kubectl delete pods,services -l app=theia-substrate --namespace=${K8S_NAMESPACE}

integrate:
	cargo doc --document-private-items
