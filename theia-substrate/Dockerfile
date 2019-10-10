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

ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

RUN apt-get update && \
    apt-get install -y curl git cmake pkg-config libssl-dev git gcc build-essential git clang libclang-dev pkg-config && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

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
    && cargo install --force --git https://github.com/paritytech/substrate subkey \
    && cargo install --force --git https://github.com/paritytech/ink cargo-contract \
    && cargo install sccache

RUN git clone https://github.com/substrate-developer-hub/substrate-node-template node && \
    git clone https://github.com/substrate-developer-hub/substrate-front-end-template front-end

#ENV RUSTC_WRAPPER sccache
ENV SCCACHE_DIR .sscache/
ENV SCCACHE_CACHE_SIZE 2G
ENV SCCACHE_IDLE_TIMEOUT=0
# TODO configure to use Parity global cache, once available

ENV RUST_LOG=sccache=debug
#RUN sccache --start-server

WORKDIR /home/workspace/front-end
RUN yarn

WORKDIR /home/workspace/node

RUN cargo check && cargo build
RUN cargo check --release && cargo build --release

WORKDIR /home/theia

ENV HOME /home/theia
WORKDIR /home/theia
EXPOSE 8080 8000 9933 9944 30333
ENV SHELL /bin/bash
ENV USE_LOCAL_GIT true
ENV HOST 0.0.0.0
ENV PROVIDER_SOCKET ws://localhost:9944

ENTRYPOINT [ "node", "/home/theia/src-gen/backend/main.js", "/home/workspace/", "--hostname=0.0.0.0", "--port=8080" ]

ARG BUILD_DATE
ARG GIT_REV
ARG GIT_UPSTREAM

LABEL org.label-schema.schema-version="1.0"
LABEL org.label-schema.build-date=$BUILD_DATE
LABEL org.label-schema.vcs-ref=$GIT_REV
LABEL vcs-upstream=$GIT_UPSTREAM