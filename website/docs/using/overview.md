---
id: overview
title: Overview
slug: /
---

Substrate Playground is a browser-based IDE for Substrate development 🤸 The goal of Substrate
Playground is to reduce the time it takes to get started with Substrate in two ways 🚀

1. Zero set-up - Playground preconfigures a development environment with all the necessary
   dependencies and toolchains.
1. Prebuilt projects - Playground projects include build artifacts, including executables, which
   means that they can be deployed immediately and provide faster compile times from the first
   build.

<p align="center">
  <img width="600" src="/substrate-playground/img/using/00-demo.gif" alt="animated demo" />
</p>

## Logging In

The Playground uses GitHub authentication, so all you need to get started is a free
[GitHub account](https://github.com/join). The first time you login to Substrate Playground you will
be asked to approve the integration with your GitHub account.

## Selecting a Template

Substrate Playground packages projects as templates. If you're not sure which template to select,
start with the template for the
[Substrate Developer Hub Node Template](https://github.com/substrate-developer-hub/substrate-node-template).
Enjoy the playful loading messages while you wait for your project to launch 😉

## Navigating the Playground

When the Node Template project starts, it will launch the pre-built executable so that you can start
interacting with it right away. Keep reading if you'd like to learn more about how to navigate
Substrate Playground.

Substrate Playground is built on the [Theia IDE framework](https://theia-ide.org/), which provides a
familiar VS Code-like environment. On top, there is an application menu with sections like File,
Edit, and View, and on the far left-hand side is a menu that allows you to navigate between tools
like the File Explorer, Search menu, and Debugger. Refer to the `README.md` file that ships with the
Node Template to learn more about the files you see in the File Explorer and the structure of the
Node Template in general.

<p align="center">
  <img width="600" src="/substrate-playground/img/using/01-explorer.png" alt="project explorer" />
</p>

Substrate Playground includes the
[VSCode Substrate extension](https://marketplace.visualstudio.com/items?itemName=paritytech.vscode-substrate).
Review
[its documentation](https://github.com/paritytech/vscode-substrate/blob/master/docs/features.md) to
explore the rich set of capabilities it has to offer!

## Start Playing

Before you start playing, take note of the special Playground section in the top application menu.

<p align="center">
  <img width="600" src="/substrate-playground/img/using/02-apps.png" alt="launch UI" />
</p>

If you click into this menu, you will find a shortcut to the well-known Polkadot-JS Apps UI that is
pre-configured to connect to your Playground node.

## Questions?

We hope that Substrate Playground makes it easier for you to get started with the wonderful world of
blockchain development with Substrate! We have lots of ways for you to get help if you have any
questions or think you've encountered a problem.

- If you think you've found a problem with Playground, please create an
  [Issue on its GitHub repository](https://github.com/paritytech/substrate-playground/issues).
- If you have a question about Substrate development, ask in our
  [active technical chat](https://app.element.io/#/room/!HzySYSaIhtyWrwiwEV:matrix.org)!
- Make a
  [Stack Overflow post tagged `substrate`](https://stackoverflow.com/questions/tagged/substrate).
- Use the [`subport` support repository](https://github.com/paritytech/subport/issues) to open a
  GitHub Issue to ask specific questions related to Substrate development.
- If you think you've found a problem with the Node Template, please create an
  [Issue on it GitHub repository](https://github.com/substrate-developer-hub/substrate-node-template/issues).
