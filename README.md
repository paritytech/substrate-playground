![](https://github.com/paritytech/substrate-playground/workflows/Continuous%20Testing%20Playground/badge.svg) 

# Substrate playground

A hosted website that enables the user to navigate [Substrate](https://github.com/paritytech/substrate) runtimes, modify them and run remotely accessible chain. In a couple minutes!

<p align="center">
  <img width="600" src="docs/assets/demo.gif" alt="Playground demo">
</p>

Playground allows end-user to spin up a substrate based development environment in seconds. A full machine with terminal is then available from a web browser, ready to launch a chain and remotely access it.
Playground templates can be [created and maintained](https://paritytech.github.io/substrate-playground/CUSTOM_TEMPLATE.html) by 3rd parties. Playground instances can be [integrated and manipulated](https://paritytech.github.io/substrate-playground/INTEGRATION.html) via a JavaScript API.

## Trying it out

### Web

Access playground at [playground.substrate.dev](https://playground.substrate.dev).

### CLI

Playground templates can be started on a local machine (`docker` must be available).

```shell
npm install -g @substrate/playground-cli
substrate-playground
# or
npx @substrate/playground-cli
```

Then [browse](http://localhost) a locally accessible web IDE.

<p align="center">
  <img width="600" src="https://cdn.rawgit.com/paritytech/substrate-playground/develop/cli/assets/web.svg" alt="CLI demo">
</p>

Find more details [here](cli/README.md)

## Support

Documentation can be found at [paritytech.github.io/substrate-playground/](https://paritytech.github.io/substrate-playground/) (and its source [here](./docs/))

### Integrate

Playground can be [integrated](https://paritytech.github.io/substrate-playground/INTEGRATION.html) in external pages. This opens the door for more advanced usage e.g. interactive tutorials.

### Contribute a template

Extra `template` (custom docker images) can be [created](https://paritytech.github.io/substrate-playground/CUSTOM_TEMPLATE.html) and made available on playground.

## Roadmap

Track progress [here](https://github.com/paritytech/substrate-playground/projects/1)

## Deployment

Playground is a set of containerized apps deployed on a kubernetes cluster. Fear not, it's quite simple to [deploy](docs/DEPLOYMENT.md) it!

## License

https://help.github.com/en/github/creating-cloning-and-archiving-repositories/licensing-a-repository
