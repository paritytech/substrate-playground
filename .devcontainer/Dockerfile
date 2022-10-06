FROM docker.io/rust:1.56.0-bullseye

ENV DEBIAN_FRONTEND=noninteractive
RUN apt update && apt upgrade -y
RUN apt install -y \
    clang \
    cmake \
    lldb \
    lsb-release \
    sudo \
    time \
    python3-pip \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

# Install `k3d`
RUN curl https://raw.githubusercontent.com/rancher/k3d/main/install.sh \
    | bash

RUN rustup component add clippy rls rust-src rustfmt
