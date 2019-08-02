ARG NODE_VERSION=10
FROM node:$NODE_VERSION
ARG version=latest
WORKDIR /home/substrate
ADD $version.package.json ./package.json
ARG GITHUB_TOKEN
RUN yarn --pure-lockfile && \
    NODE_OPTIONS="--max_old_space_size=4096" yarn theia build && \
    yarn --production && \
    yarn autoclean --init && \
    echo *.ts >> .yarnclean && \
    echo *.ts.map >> .yarnclean && \
    echo *.spec.* >> .yarnclean && \
    yarn autoclean --force && \
    yarn cache clean

ENV USER root

RUN apt-get update
RUN apt-get install -y sudo cmake pkg-config libssl-dev git gcc build-essential clang libclang-dev

# See : https://github.com/theia-ide/theia-apps/issues/34
RUN adduser --gecos '' substrate && \
    echo substrate:substrate | chpasswd && \
    usermod -aG sudo substrate && \
    chmod g+rw /home && \
    mkdir -p /home/project && \
    mkdir -p /usr/local/cargo && \
    chown -R substrate:substrate /usr/local/cargo && \
    chown -R substrate:substrate /home/substrate && \
    chown -R substrate:substrate /home/project

USER substrate

# configure Theia
ENV SHELL=/bin/bash \
    THEIA_DEFAULT_PLUGINS=local-dir:/home/substrate/plugins \
    PATH=/home/substrate/.cargo/bin:$PATH

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    && . .cargo/env \
    && rustup install nightly \
    && rustup update \
    && rustup default nightly \
    && rustup target add wasm32-unknown-unknown --toolchain nightly \
    && rustup component add rls rust-src rust-analysis

RUN cargo install --force --git https://github.com/alexcrichton/wasm-gc
RUN cargo install --force --git https://github.com/paritytech/substrate subkey

WORKDIR /home/project

EXPOSE 3000
ENTRYPOINT [ "node", "/home/substrate/src-gen/backend/main.js", "/home/project", "--hostname=0.0.0.0" ]