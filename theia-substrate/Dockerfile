## Install theia

FROM node:10
RUN apt-get update && \
    apt-get install -y make gcc g++ python sudo vim curl git cmake pkg-config libssl-dev git gcc build-essential git clang libclang-dev pkg-config xsel && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
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

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

RUN curl -sL https://deb.nodesource.com/setup_12.x | bash - && \
    curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -

RUN apt-get update && \
    apt-get install -y nodejs yarn && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /home/workspace

# https://theia-ide.org/docs/preferences
ADD settings.json recentworkspace.json .theia/
ADD .theia-workspace .

#USER theia

# https://rust-lang.github.io/rustup-components-history/index.html
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain none \
    && . $CARGO_HOME/env \
    && rustup install nightly-2019-10-04 \
    && rustup update \
    && rustup default nightly-2019-10-04 \
    && rustup component add rls rust-analysis rust-src clippy rustfmt llvm-tools-preview \
    && rustup target add wasm32-unknown-unknown --toolchain nightly-2019-10-04

RUN cargo install --force --git https://github.com/alexcrichton/wasm-gc \
    && cargo install --force --git https://github.com/paritytech/substrate subkey
    #&& cargo install --force --git https://github.com/paritytech/ink cargo-contract

RUN git clone https://github.com/substrate-developer-hub/substrate-node-template && \
    git clone https://github.com/jeluard/substrate-front-end-template

WORKDIR /home/workspace/substrate-front-end-template
RUN yarn

WORKDIR /home/workspace/substrate-node-template

RUN cargo check && cargo build
RUN cargo check --release && cargo build --release

WORKDIR /home/theia

ENV HOME /home/theia
WORKDIR /home/theia
EXPOSE 80 8000 9944 30333
ENV SHELL /bin/bash
ENV USE_LOCAL_GIT true
ENV HOST 0.0.0.0
ENV PUBLIC_URL .
ENV REACT_APP_PROVIDER_SOCKET=

ENTRYPOINT [ "node", "/home/theia/src-gen/backend/main.js", "/home/workspace/", "--hostname=0.0.0.0", "--port=80" ]

ARG BUILD_DATE
ARG GIT_REV
ARG GIT_UPSTREAM

LABEL org.label-schema.schema-version="1.0"
LABEL org.label-schema.build-date=$BUILD_DATE
LABEL org.label-schema.vcs-ref=$GIT_REV
LABEL vcs-upstream=$GIT_UPSTREAM