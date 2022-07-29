# The backend Dockerfile.

FROM rust:1.62-slim

ARG GITHUB_SHA

WORKDIR /opt

COPY . .

ENV DEBIAN_FRONTEND=noninteractive
RUN apt update && apt upgrade -y && apt install -y musl-tools git
RUN rustup target add x86_64-unknown-linux-musl && RUST_BACKTRACE=1 cargo build --release --target x86_64-unknown-linux-musl --out-dir /opt/target/release -Z unstable-options

ENV PATH=$PATH:/opt/target/release\
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt\
    SSL_CERT_DIR=/etc/ssl/certs\
    GITHUB_SHA=$GITHUB_SHA\
    RUST_BACKTRACE=full\
    RUST_LOG="warn,kubernetes=info"
