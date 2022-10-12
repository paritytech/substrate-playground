FROM docker.io/rust:1.56.0-bullseye

ENV DEBIAN_FRONTEND=noninteractive
RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add - \
    && echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
RUN apt update && apt upgrade -y \
    && apt install -y \
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
    lsb-release \
    yarn \
    nodejs

# Install `k3d`
RUN curl https://raw.githubusercontent.com/rancher/k3d/main/install.sh \
    | bash

RUN rustup component add clippy rls rust-src rustfmt
