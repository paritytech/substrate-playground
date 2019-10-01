## Install theia

FROM node:10
RUN apt-get install make gcc g++ python
WORKDIR /home/theia
ADD package.json .
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

#FROM ubuntu:19.04

RUN apt-get update && \
    apt-get install -y curl git cmake pkg-config libssl-dev git gcc build-essential git clang libclang-dev pkg-config && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN curl -sL https://deb.nodesource.com/setup_12.x | bash - && \
    curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -

RUN apt-get update && \
    apt-get install -y nodejs yarn && \
    rm -rf /var/lib/apt/lists/*

RUN adduser --gecos '' theia
RUN chmod g+rw /home && \
    mkdir -p /home/project && \
    chown -R theia:theia /home/theia && \
    chown -R theia:theia /home/project;

USER theia

ENV PATH=/home/theia/.cargo/bin:$PATH 

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain none \
    && . $HOME/.cargo/env \
    && rustup install nightly \
    && rustup update \
    && rustup default nightly \
    && rustup target add wasm32-unknown-unknown --toolchain nightly

RUN cargo install --force --git https://github.com/alexcrichton/wasm-gc \
    && cargo install --force --git https://github.com/paritytech/substrate subkey \
    && cargo install sccache

WORKDIR /home/project

RUN git clone --recurse-submodules https://github.com/substrate-developer-hub/substrate-package

#ENV RUSTC_WRAPPER sccache
ENV SCCACHE_DIR .sscache/
ENV SCCACHE_CACHE_SIZE 2G
ENV SCCACHE_IDLE_TIMEOUT=0
# TODO configure to use Parity global cache, once available

ENV RUST_LOG=sccache=debug
#RUN sccache --start-server

WORKDIR /home/project/substrate-package/substrate-node-template

RUN cargo check && cargo build
RUN cargo check --release && cargo build --release

WORKDIR /home/theia
#RUN openssl req -nodes -new -x509 -keyout server.key -out server.cert -subj "/C=DE/ST=/L=Berlin/O=Parity/OU=Substrate/CN=support@parity.io"

ENV HOME /home/theia
WORKDIR /home/theia
EXPOSE 8080
ENV SHELL /bin/bash
ENV USE_LOCAL_GIT true

#ENTRYPOINT [ "node", "/home/theia/src-gen/backend/main.js", "/home/project/substrate-package/substrate-node-template", "--hostname=0.0.0.0", "--port=8080", "--ssl", "--cert=server.cert", "--certkey=server.key" ]
ENTRYPOINT [ "node", "/home/theia/src-gen/backend/main.js", "/home/project/substrate-package/substrate-node-template", "--hostname=0.0.0.0", "--port=8080" ]

ARG BUILD_DATE
ARG GIT_REV
ARG GIT_UPSTREAM

LABEL org.label-schema.schema-version="1.0"
LABEL org.label-schema.build-date=$BUILD_DATE
LABEL org.label-schema.vcs-ref=$GIT_REV
LABEL vcs-upstream=$GIT_UPSTREAM