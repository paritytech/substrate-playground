# Quick start

## Configuration

`PLAYGROUND_ASSETS` can be set to override the assets directory location.
`K8S_NAMESPACE` must be set to the correct kubernetes namespace
`PLAYGROUND_HOST` 
`PLAYGROUND_IMAGES` must be set to a key value pair string of template / docker images digests (e.g. "default=jeluard/theia-substrate@sha256:..., custom=jeluard/theia-substrate@sha256:...")

## Development server

```bash
PLAYGROUND_ASSETS=../frontend/dist K8S_NAMESPACE=playground-staging PLAYGROUND_HOST=localhost PLAYGROUND_IMAGES="" cargo run
```

## TODO

Automate release using [cargo-release](https://github.com/sunng87/cargo-release)