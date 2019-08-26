.DEFAULT_GOAL := build

build:
	docker build -f Dockerfile -t jeluard/theia-substrate:latest .

run: build
	docker run -d -p 3000:3000 jeluard/theia-substrate:latest