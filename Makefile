.DEFAULT_GOAL := help

# Show this help.
help:
	@awk '/^#/{c=substr($$0,3);next}c&&/^[[:alpha:]][[:alnum:]_-]+:/{print substr($$1,1,index($$1,":")),c}1{c=0}' $(MAKEFILE_LIST) | column -s: -t

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

dev-frontend: setup-frontend
	cd frontend; yarn dev

dev-backend:
	cd backend; PLAYGROUND_ASSETS="../frontend/dist" cargo run

build-frontend: setup-frontend
	cd frontend; yarn build

build-backend:
	cd backend; cargo build --release

THEIA_IMAGE_NAME="jeluard/theia-substrate"
THEIA_IMAGE_VERSION="v1"
THEIA_IMAGE="${THEIA_IMAGE_NAME}:${THEIA_IMAGE_VERSION}"

#
build-theia-docker-image:
	@cd theia-substrate; docker build -f Dockerfile -t ${THEIA_IMAGE} . && docker image prune -f --filter label=stage=builder

publish-theia-docker-image: build-theia-docker-image
	docker push ${THEIA_IMAGE}

run-theia-docker-image: build-theia-docker-image
	docker run -d -p 8080:8080 ${THEIA_IMAGE}

PLAYGROUND_PORT="80"
PLAYGROUND_IMAGE_NAME="jeluard/substrate-playground"
PLAYGROUND_IMAGE_VERSION="latest"
PLAYGROUND_IMAGE="${PLAYGROUND_IMAGE_NAME}:${PLAYGROUND_IMAGE_VERSION}"

build-playground-docker-image:
	docker build --build-arg PORT=${PLAYGROUND_PORT} -f Dockerfile -t ${PLAYGROUND_IMAGE} . && docker image prune -f --filter label=stage=builder

publish-playground-docker-image: build-playground-docker-image
	docker push ${PLAYGROUND_IMAGE}

run-playground-docker-image: build-playground-docker-image
	docker run -d -p 80:${PLAYGROUND_PORT} ${PLAYGROUND_IMAGE}

k8s-deploy-playground:
	kubectl apply -f  deployment.yaml

k8s-undeploy-playground:
	kubectl delete -f  deployment.yaml

k8s-undeploy-theia:
	kubectl delete pods,services -l app=theia-substrate

integrate:
	cargo doc --document-private-items
