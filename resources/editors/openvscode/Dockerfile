# The image used as openvscode editor.
#
# Built as a multi-stage image (https://docs.docker.com/develop/develop-images/multistage-build/)

FROM ubuntu

ARG OPENVSCODE_SERVER_ROOT="/opt/editor"

USER root

ENV OPENVSCODE_VERSION=1.68.1
ENV OPENVSCODE_SERVER=openvscode-server-v${OPENVSCODE_VERSION}-linux-x64
ENV OPENVSCODE_SERVER_FILE=${OPENVSCODE_SERVER}.tar.gz

# Downloading the latest VSC Server release
RUN apt-get update && apt-get install -y wget \
    && wget https://github.com/gitpod-io/openvscode-server/releases/download/openvscode-server-v${OPENVSCODE_VERSION}/${OPENVSCODE_SERVER_FILE} \
    && tar -xzf ${OPENVSCODE_SERVER_FILE} \
    && mkdir -p ${OPENVSCODE_SERVER_ROOT}/data/User \
    && mkdir -p ${OPENVSCODE_SERVER_ROOT}/extensions \
    && mv ${OPENVSCODE_SERVER}/* ${OPENVSCODE_SERVER_ROOT} \
    && ls ${OPENVSCODE_SERVER_ROOT} \
    && cp ${OPENVSCODE_SERVER_ROOT}/bin/remote-cli/openvscode-server ${OPENVSCODE_SERVER_ROOT}/bin/remote-cli/code \
    && rm -rf ${OPENVSCODE_SERVER_FILE}

# https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations
COPY resources/editors/openvscode/conf/* ${OPENVSCODE_SERVER_ROOT}/data/User
COPY ../../vscode-extension ${OPENVSCODE_SERVER_ROOT}/extensions/parity.substrate-playground
COPY resources/editors/openvscode/start.sh ${OPENVSCODE_SERVER_ROOT}/start.sh

RUN chmod +x ${OPENVSCODE_SERVER_ROOT}/start.sh

USER $USER

# Install default extensions
RUN ${OPENVSCODE_SERVER_ROOT}/bin/openvscode-server \
    --install-extension matklad.rust-analyzer \
    --install-extension vadimcn.vscode-lldb \
    --install-extension vsls-contrib.codetour \
    --install-extension GitHub.vscode-pull-request-github \
    --install-extension ms-vscode.live-server \
    --install-extension redhat.vscode-yaml \
    --install-extension ms-python.python \
    --install-extension ms-toolsai.jupyter

# https://code.visualstudio.com/docs/editor/settings-sync
# https://github.com/microsoft/vscode/issues/141293
# https://github.com/microsoft/vscode/issues/116740

ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    EDITOR=code \
    VISUAL=code \
    GIT_EDITOR="code --wait" \
    OPENVSCODE_SERVER_ROOT=${OPENVSCODE_SERVER_ROOT} \
    PATH="${OPENVSCODE_SERVER_ROOT}/bin/remote-cli:${PATH}"
