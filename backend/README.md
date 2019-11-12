# Quick start

## Configuration

`Playground.toml` contains the configuration.
`PLAYGROUND_ASSETS` can be set to override the assets directory location.

## Development server

```bash
PLAYGROUND_ASSETS=../frontend/dist K8S_NAMESPACE=staging PLAYGROUND_HOST=localhost cargo run
```

## TODO

Automate release using [cargo-release](https://github.com/sunng87/cargo-release)