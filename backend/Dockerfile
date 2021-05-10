# The server Dockerfile.
#
# A multi-stage docker image (https://docs.docker.com/develop/develop-images/multistage-build/)
# Based on https://github.com/bjornmolin/rust-minimal-docker

FROM clux/muslrust:1.50.0-nightly-2020-11-27 AS builder

WORKDIR /opt

# Build the project with target x86_64-unknown-linux-musl

# Build dummy main with the project's Cargo lock and toml
# This is a docker trick in order to avoid downloading and building
# dependencies when lock and toml not is modified.

COPY Cargo.* ./

RUN mkdir -p src/bin \
    && echo "fn main() {print!(\"Dummy main\");} // dummy file" > src/bin/backend.rs \
    && set -x && cargo build --locked --target x86_64-unknown-linux-musl --release

# Now add the rest of the project and build the real main

COPY src src

RUN set -x && cargo build --frozen --release --out-dir=/opt/bin -Z unstable-options --target x86_64-unknown-linux-musl

LABEL stage=builder

##########################
#         Runtime        #
##########################

FROM scratch

ARG GITHUB_SHA

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

ENV PATH=/\
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt\
    SSL_CERT_DIR=/etc/ssl/certs\
    GITHUB_SHA=$GITHUB_SHA\
    RUST_BACKTRACE=full\
    RUST_LOG="warn,playground=info"

COPY --from=builder /opt/bin/* /
