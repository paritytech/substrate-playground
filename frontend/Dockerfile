# The main playground Dockerfile. Runs the `backend`, serving on port 80 the `frontend` (under /) and the associated API (undre /api)
#
# A multi-stage docker image (https://docs.docker.com/develop/develop-images/multistage-build/)
# Based on https://github.com/bjornmolin/rust-minimal-docker

##########################
#         Frontend       #
##########################

FROM node:alpine AS builder

WORKDIR /opt

COPY . .

ARG GITHUB_SHA
ENV GITHUB_SHA=$GITHUB_SHA

ENV PARCEL_WORKERS=1

RUN apk add --no-cache --virtual .gyp \
    && yarn clean && yarn install && yarn build \
    && apk del .gyp

LABEL stage=builder

##########################
#          Nginx         #
##########################

FROM nginx

COPY ./conf/nginx.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html

COPY --from=builder /opt/dist/ .