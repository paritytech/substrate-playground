# The main playground Dockerfile. Runs the `backend`, serving on port 80 the `frontend` (under /) and the associated API (undre /api)
#
# A multi-stage docker image (https://docs.docker.com/develop/develop-images/multistage-build/)
# 

##########################
#         Theia          #
##########################

# Theia must build with node 10 (https://github.com/eclipse-theia/theia/issues/7349)
ARG NODE_VERSION=10
FROM node:${NODE_VERSION} as theia-base
RUN apt-get update && \
    apt-get install -y make gcc g++ python sudo vim git cmake pkg-config libssl-dev git gcc build-essential git clang libclang-dev pkg-config xsel && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /home/theia
ADD package.json .
ADD lerna.json .
ADD theia-playground theia-playground
ADD theia-playground-extension theia-playground-extension
RUN yarn && \
    yarn workspace @parity/theia-playground && \
    yarn workspace @parity/theia-playground  theia download:plugins && \
    NODE_OPTIONS="--max_old_space_size=4096" yarn workspace @parity/theia-playground theia build

##########################
#     Rust base          #
##########################

FROM node:${NODE_VERSION}
# See : https://github.com/theia-ide/theia-apps/issues/34

RUN apt-get update && \
    apt-get install -y make gcc g++ dumb-init python sudo vim git cmake pkg-config libssl-dev git gcc build-essential git clang libclang-dev pkg-config xsel && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN adduser --disabled-password --gecos '' theia && \
    mkdir -p /etc/sudoers.d && \
    echo '%sudo ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers && \
    echo "user ALL=(root) NOPASSWD:ALL" >> /etc/sudoers.d/user && \
    chmod 0440 /etc/sudoers.d/user;

RUN chmod g+rw /home && \
    mkdir -p /home/workspace && \
    chown -R theia:theia /home/theia && \
    chown -R theia:theia /home/workspace;

COPY --from=theia-base --chown=theia:theia /home/theia /home/theia

# Pick up the version from https://rust-lang.github.io/rustup-components-history/index.html
ARG RUST_VERSION=nightly-2020-03-11

ENV HOME=/home/theia \
    CARGO_HOME=/home/theia/.cargo \
    PATH=/home/theia/.cargo/bin:$PATH \
    SHELL=/bin/bash \
    THEIA_DEFAULT_PLUGINS=local-dir:/home/theia/theia-playground/plugins \
    USE_LOCAL_GIT=true \
    HOST=0.0.0.0 \
    PUBLIC_URL=. \
    REACT_APP_PROVIDER_SOCKET= \
    VSCODE_API_VERSION=1.42.0

USER theia

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain none \
    && . $CARGO_HOME/env \
    && rustup install $RUST_VERSION \
    && rustup update \
    && rustup default $RUST_VERSION \
    && rustup component add rls rust-analysis rust-src clippy rustfmt llvm-tools-preview \
    && rustup target add wasm32-unknown-unknown --toolchain $RUST_VERSION

RUN cargo install --force --git https://github.com/alexcrichton/wasm-gc \
    && cargo install --force --git https://github.com/paritytech/substrate subkey
    #&& cargo install --force --git https://github.com/paritytech/ink cargo-contract

##########################
#  Substrate tutorial    #
##########################

WORKDIR /home/workspace

RUN git clone https://github.com/substrate-developer-hub/substrate-node-template && \
    git clone https://github.com/substrate-developer-hub/substrate-front-end-template && \
    git clone https://github.com/substrate-developer-hub/recipes

RUN cd /home/workspace/substrate-front-end-template && yarn

RUN cd /home/workspace/substrate-node-template && cargo check && cargo build \
    && cargo check --release && cargo build --release

WORKDIR /home/theia/theia-playground/
EXPOSE 3000 8000 9944 30333

ENTRYPOINT [ "dumb-init", "node", "--always-compact", "--max-old-space-size=64", "/home/theia/theia-playground/src-gen/backend/main.js", "/home/workspace", "--hostname=0.0.0.0" ] 