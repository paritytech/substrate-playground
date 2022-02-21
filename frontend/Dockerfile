# Dockerfile for `frontend`. Compiles the frontend then serve it via nginx on port 80.

##########################
#         Frontend       #
##########################

# See all images here: https://hub.docker.com/_/node
FROM node:14.18.3-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock tsconfig.json .
COPY src /app/src
COPY public /app/public

# The custom base URL used to access the API, if any
ARG BASE
ENV BASE=$BASE

# The git sha of the current source tree
ARG GITHUB_SHA
ENV GITHUB_SHA=$GITHUB_SHA

RUN yarn install && yarn build

LABEL stage=builder

##########################
#          Nginx         #
##########################

FROM nginx:1.21.5-alpine

COPY ./conf/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist/ /usr/share/nginx/html
