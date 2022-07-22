# The server Dockerfile.
#
# A multi-stage docker image (https://docs.docker.com/develop/develop-images/multistage-build/)
# Based on https://github.com/bjornmolin/rust-minimal-docker

FROM rust:1.31

ARG GITHUB_SHA

WORKDIR /opt

COPY . .

RUN cargo build --release

ENV PATH=$PATH:/opt/target/release\
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt\
    SSL_CERT_DIR=/etc/ssl/certs\
    GITHUB_SHA=$GITHUB_SHA\
    RUST_BACKTRACE=full\
    RUST_LOG="warn,kubernetes=info"
