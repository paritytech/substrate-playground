---
id: architecture
title: Architecture
---

import Mermaid from '@theme/Mermaid';

Users can use a TypeScript base front end to communicate with a backend. This HTTP server is hosted on kubernetes and deploys custom [theia](https://www.theia-ide.org/) (a web based VSCode IDE) containers via kubernetes API.

A session is the deployment of a template for a user at a time.
A user can have a single session at a time.
Template details can be updated (ports, ..) as well as session details (maxDuration)

Session details can also be updated during the lifetime of a session

## Frontend

<Mermaid chart={`
stateDiagram-v2
    [*] --> Terms
    Terms --> Terms: ignored
    Terms --> Unlogged: accepted
    Unlogged --> Panel: login
    Panel --> Unlogged: logout
    Panel --> Panel: select panel
`}/>