# The image used as openvscode editor.
#
# Built as a multi-stage image (https://docs.docker.com/develop/develop-images/multistage-build/)

FROM ubuntu

# Ensure that needed env variables have been set by inherited image
#RUN [ ! -z "${USER}" ] || { echo "USER env variable must be set in inherited image"; exit 1; } && \
#    [ ! -z "${HOME}" ] || { echo "HOME env variable must be set in inherited image"; exit 1; } && \
#    [ ! -z "${WORKSPACE}" ] || { echo "WORKSPACE env variable must be set in inherited image"; exit 1; }

ARG OPENVSCODE_PLAYGROUND_HOME=$OPENVSCODE_HOME/openvscode-playground
ARG OPENVSCODE_SERVER_ROOT="/opt/editor"

WORKDIR /home/

USER root

ENV OPENVSCODE_VERSION=1.68.1

RUN apt-get update && apt-get install -y wget

# Downloading the latest VSC Server release
RUN wget https://github.com/gitpod-io/openvscode-server/releases/download/openvscode-server-v$OPENVSCODE_VERSION/openvscode-server-v$OPENVSCODE_VERSION-linux-x64.tar.gz \
    && tar -xzf openvscode-server-v$OPENVSCODE_VERSION-linux-x64.tar.gz \
    && mv openvscode-server-v$OPENVSCODE_VERSION-linux-x64 ${OPENVSCODE_SERVER_ROOT} \
    && cp ${OPENVSCODE_SERVER_ROOT}/bin/remote-cli/openvscode-server ${OPENVSCODE_SERVER_ROOT}/bin/remote-cli/code \
    && rm -rf openvscode-server-v$OPENVSCODE_VERSION-linux-x64.tar.gz

# https://code.visualstudio.com/docs/getstarted/settings#_settings-file-locations
RUN mkdir -p ${OPENVSCODE_SERVER_ROOT}/extensions/
COPY resources/editors/openvscode/.vscode ${HOME}/.config/Code/User/settings.json
COPY ../../vscode-extension ${OPENVSCODE_SERVER_ROOT}/extensions/parity.substrate-playground
COPY resources/editors/openvscode/start.sh ${OPENVSCODE_SERVER_ROOT}/start.sh

RUN chmod g+rw /home && \
    chown -R $USER:$USER ${OPENVSCODE_SERVER_ROOT}
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

WORKDIR $WORKSPACE

ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    EDITOR=code \
    VISUAL=code \
    GIT_EDITOR="code --wait" \
    OPENVSCODE_SERVER_ROOT=${OPENVSCODE_SERVER_ROOT} \
    PATH="${OPENVSCODE_SERVER_ROOT}/bin/remote-cli:${PATH}"
