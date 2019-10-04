# Substrate playground

A hosted website that enables the user to navigate the [Substrate](https://github.com/paritytech/substrate) [Node-Template](https://github.com/paritytech/substrate/tree/master/node-template); edit & add modules/files; compile & share code/errors.

## Usage


## Architecture

A TypeScript base [frontend](/frontend) displays a list of templete to choose from. Upon selection a request is sent to a rust based [backend](/backend) that will spins out the relevant Docker image containing the cloned template repository and exposed as a website via [theia](https://www.theia-ide.org/) web based VSCode IDE. The pool of Docker containers is hosted on a kubernetes cluster. 

The backend can be configured through `Playground.toml`.

## Development

Make sure [minikube](https://minikube.sigs.k8s.io/) is started for local development:

```
minikube start
```

Then in a first shell, start:

```
make dev-backend
```

And in a second terminal:

```
make dev-frontend
```

You can now browse `http:localhost:8000`.

## Release

Push the theia image:

```
make push-theia-docker-image
```

Locate the digest (`sha256:...`) in the command output and update `backend/Playground.toml` with it.

Push the playground image:

```
make push-playground-docker-image
```

Locate the digest (`sha256:...`) in the command output and update `deployment.yaml` with it.

Finally [deploy](docs/deployment.md) on kubernetes.
