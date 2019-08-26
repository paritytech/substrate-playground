# Substrate playground

A hosted website that enables the user to navigate the [Substrate](https://github.com/paritytech/substrate) [Node-Template](https://github.com/paritytech/substrate/tree/master/node-template); edit & add modules/files; compile & share code/errors.

## Usage


## Architecture

A TypeScript base [frontend](/frontend) displays a list of templete to choose from. Upon selection a request is sent to a rust based [backend](/backend) that will spins out the relevant Docker image containing the cloned template repository and exposed as a website via [theia](https://www.theia-ide.org/) web based VSCode IDE. The pool of Docker containers is host on a kubernetes cluster. 