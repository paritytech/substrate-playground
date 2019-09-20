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

build-frontend: setup-frontend
	cd frontend; yarn build

build-backend:
	cd backend; cargo build --release

# 
build-theia-docker-image:
	cd theia-substrate; docker build -f Dockerfile -t jeluard/theia-substrate:latest . && docker image prune -f --filter label=stage=builder

run-theia-docker-image: build-theia-docker-image
	docker run -d -p 3000:3000 jeluard/theia-substrate:latest

PLAYGROUND_PORT="80"

build-playground-docker-image:
	docker build --build-arg PORT=${PLAYGROUND_PORT} -f Dockerfile -t jeluard/substrate-playground:latest . && docker image prune -f --filter label=stage=builder

publish-playground-docker-image: build-playground-docker-image
	docker push jeluard/substrate-playground:latest

run-playground-docker-image: build-playground-docker-image
	docker run -d -p 80:${PLAYGROUND_PORT} jeluard/substrate-playground:latest
