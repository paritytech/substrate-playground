External users can provide and maintain templates used by the playground.

To create a template the following steps are mandatory:

* create a basic Dockerfile (in `.devcontainer/Dockerfile`) extending `paritytech/substrate-playground-template-base`
* create `.devcontainer/devcontainer.json` (find an example [here](https://github.com/substrate-developer-hub/substrate-node-template/blob/master/.devcontainer/devcontainer.json))
* create a Github worflow that build this image then dispatches an event to `substrate-playground` (find an example [here](https://github.com/substrate-developer-hub/substrate-node-template/blob/master/.github/workflows/build-push-template.yml))

Additionally there are a number of standard VSCode configuration files that will be leveraged by the playground:

* .vscode/settings.json (see https://code.visualstudio.com/docs/getstarted/settings)
* .vscode/launch.json
* .vscode/tasks.json
* .vscode/snippets.code-snippets

An example of adding support to an external repository can be found [here](https://github.com/substrate-developer-hub/substrate-node-template/).

After the associated Github workflow in `substrate-playground` is triggered, playground will use the newly built image. 
