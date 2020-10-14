# Dockerfile for `frontend`. Compiles the frontend then serve it via nginx on port 80.
#
# A multi-stage docker image (https://docs.docker.com/develop/develop-images/multistage-build/)
# Based on https://github.com/bjornmolin/rust-minimal-docker

##########################
#         Frontend       #
##########################

FROM node:14.13.1 AS builder

WORKDIR /opt

COPY package.json yarn.lock tsconfig.json .eslintrc.cjs /opt/

ARG GITHUB_SHA
ENV GITHUB_SHA=$GITHUB_SHA

ENV CI=true \
    PARCEL_WORKERS=1

RUN yarn install --frozen-lockfile

COPY src /opt/src
COPY public /opt/public

RUN yarn build

LABEL stage=builder

##########################
#          Nginx         #
##########################

FROM nginx:1.19.0-alpine

COPY ./conf/nginx.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html

COPY --from=builder /opt/dist/ .