[![Docker Image](https://img.shields.io/docker/pulls/parity/theia-substrate.svg?maxAge=2592000)](https://hub.docker.com/r/parity/theia-substrate/)

A Docker image 


docker build -t jeluard/theia:latest .
docker run -d -p 3000:3000 -v "$(pwd):/home/project:cached" jeluard/theia-substrate:latest

https://github.com/paritytech/substrate/archive/v1.0.0.zip

docker tag jeluard/theia jeluard/theia-substrate
docker push jeluard/theia-substrate:latest

## Dev

```
yarn
yarn workspace @parity/theia-playground start
```

## TODO

Extend https://github.com/paritytech/substrate/blob/master/Dockerfile ?

## Nodes deployer

https://github.com/w3f/polkadot-deployer
https://github.com/w3f/polkadot-charts
https://helm.sh/