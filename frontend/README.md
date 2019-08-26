# Quick start

## Development server

```bash
make dev
```

This command will:

- start a development server at http://localhost:1234 with [hot module replacement](https://en.parceljs.org/hmr.html)
- build automatically development javascript files with source maps

Basically each time you save a file, you will see automatically the result at http://localhost:1234 without refreshing the page.

## Build production bundle

```bash
make build
```

[Parcel's default optimizations](https://en.parceljs.org/production.html#optimisations) will be applied to generated files.

Files are saved at `dist` folder.
Inside `dist` folder there is also a file with information about bundle content sizes: `dist/report.html`.

## Docker

```bash
make
```

This command will:

- create and install a Docker image containing the compiled frontend
- start a nginx based web server at http://localhost:80