# Substrate playground

A hosted website that enables the user to navigate the [Substrate](https://github.com/paritytech/substrate) [Node-Template](https://github.com/paritytech/substrate/tree/master/node-template); edit & add modules/files; compile & share code/errors.

The production environment is available at [playground.substrate.dev](https://playground.substrate.dev) while the staging environment is available at [playground-staging.substrate.dev](https://playground-staging.substrate.dev).

## Architecture

Users can use a TypeScript base [front end](/frontend) to communicate with a [back end](/backend). This HTTP server is hosted on kubernetes and deploys custom [theia](https://www.theia-ide.org/) (a web based VSCode IDE) containers via kubernetes API.

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
