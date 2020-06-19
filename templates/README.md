[![Docker Image](https://img.shields.io/docker/pulls/parity/theia-substrate.svg?maxAge=2592000)](https://hub.docker.com/r/parity/theia-substrate/)

A substrate ready Docker image based on theia.

## Dev

```
nvm use 10
yarn
yarn dev
```

## Build

```
nvm use 10
yarn
yarn build
```

## Docker image

Run the image via:

```
docker run -p 80:3000 -p 8000:8000 -p 9944:9944 paritytech/substrate-playground-template-base@sha256:XXX
```