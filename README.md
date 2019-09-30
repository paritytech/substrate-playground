# Substrate playground

A hosted website that enables the user to navigate the [Substrate](https://github.com/paritytech/substrate) [Node-Template](https://github.com/paritytech/substrate/tree/master/node-template); edit & add modules/files; compile & share code/errors.

## Usage


## Architecture

A TypeScript base [frontend](/frontend) displays a list of templete to choose from. Upon selection a request is sent to a rust based [backend](/backend) that will spins out the relevant Docker image containing the cloned template repository and exposed as a website via [theia](https://www.theia-ide.org/) web based VSCode IDE. The pool of Docker containers is host on a kubernetes cluster. 

The backend can be configured through `Playground.toml`.

## Development

Make sure [minikube](https://minikube.sigs.k8s.io/) when using kubernetes as platform:

```
minikube start
```



## Release

Publish the theia image:

```
make publish-theia-docker-image
```

Locate the digest (`sha256:...`) in the command output and update `backend/Playground.toml` with it.

Publish the playground image:

```
make publish-playground-docker-image
```

Locate the digest (`sha256:...`) in the command output and update `deployment.yaml` with it.

Finally deploy on kubernetes:

```
make k8s-deploy-playground
```