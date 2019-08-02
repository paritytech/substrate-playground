A Docker image 


docker build -t jeluard/theia:latest .
docker run -d -p 3000:3000 -v "$(pwd):/home/project:cached" jeluard/theia:latest

docker tag jeluard/theia jeluard/theia-substrate
docker push jeluard/theia-substrate:latest

## TODO

Extend https://github.com/paritytech/substrate/blob/master/Dockerfile ?

## Nodes deployer

https://github.com/w3f/polkadot-deployer
https://github.com/w3f/polkadot-charts
https://helm.sh/