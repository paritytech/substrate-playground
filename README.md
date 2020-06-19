![](https://github.com/paritytech/substrate-playground/workflows/Continuous%20Integration%20Playground/badge.svg) ![](https://github.com/paritytech/substrate-playground/workflows/Continuous%20Integration%20Templates/badge.svg)

# Substrate playground

A hosted website that enables the user to navigate the [Substrate](https://github.com/paritytech/substrate) ecosystem.

The production environment is available at [playground.substrate.dev](https://playground.substrate.dev) while the staging environment is available at [playground-staging.substrate.dev](https://playground-staging.substrate.dev).

## Architecture

Users can use a TypeScript base [front end](/frontend) to communicate with a [back end](/backend). This HTTP server is hosted on kubernetes and deploys custom [theia](https://www.theia-ide.org/) (a web based VSCode IDE) containers via kubernetes API.

## Development

Local development is both frontend, backend and theia images are facilitated. More details can be found in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Release

Push the theia image:

```
make push-theia-docker-image
```

Locate the digest (`sha256:...`) in the command output.

Push the playground image:

```
make push-playground-docker-image
```

Locate the digest (`sha256:...`) in the command output and update `deployment.yaml` with it.

Finally [deploy](docs/deployment.md) on kubernetes.

## Local usage

The docker image can be run using:

```
docker run -p 80:80 paritytech/substrate-playground-template-base:latest
```

Then browse http://localhost:80
