

<p align="center">
  <img width="600" src="https://cdn.rawgit.com/paritytech/substrate-playground/tree/develop/cli/assets/no-web.svg">
</p>

<p align="center">
  <img width="600" src="https://cdn.rawgit.com/paritytech/substrate-playground/tree/develop/cli/assets/web.svg">
</p>

# Usage

```shell
yarn global add @substrate/playground-cli
substrate-playground

# or

npx @substrate/playground-cli
```

## Options

By default a headless docker image is started and can be manipulated via the current terminal.
A web based IDE will be launched if the `--web` option is provided.

The template selection can be bypassed using the `--template` option.

Finally the environment used to fetch the template list can be set using `--env`. It defaults to `staging`.

```shell
substrate-playground --web --template=node-template
```

# Publish

```shell
npm add-user
npm publish --access public
```