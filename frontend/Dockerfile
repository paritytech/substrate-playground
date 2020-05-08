# The main playground Dockerfile. Runs the `backend`, serving on port 80 the `frontend` (under /) and the associated API (undre /api)
#
# A multi-stage docker image (https://docs.docker.com/develop/develop-images/multistage-build/)
# Based on https://github.com/bjornmolin/rust-minimal-docker

##########################
#         Frontend       #
##########################

FROM node:alpine AS builder-frontend

WORKDIR /opt

COPY frontend .

ENV PARCEL_WORKERS=1

RUN apk add --no-cache --virtual .gyp \
        python \
        make \
        g++ \
    && yarn global add parcel-bundler && yarn clean && yarn install && yarn build \
    && apk del .gyp

LABEL stage=builder

##########################
#         Runtime        #
##########################

FROM scratch

// TODO NGINX

ENV RUST_BACKTRACE=full\
    RUST_LOG="warn"

COPY --from=builder-backend /opt/bin/$BINARY_NAME /
COPY --from=builder-frontend /opt/dist/ /static

CMD ["/playground"]