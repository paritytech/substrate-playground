
import { Client, EnvironmentType, playgroundBaseURL, environmentTypeFromString } from '@substrate/playground-client';
import 'cross-fetch/dist/node-polyfill.js'; // TODO remove once moving to Node18 (https://github.com/nodejs/node/pull/41749)

const accessToken = process.env.ACCESS_TOKEN;

function newClient(): Client {
    const env = environmentTypeFromString(process.env.ENV);
    return new Client(playgroundBaseURL(env), 30000, {credentials: "include"});
}

// Connect via Client, create others Role, feed repository

/// TODO

const client = newClient();
await client.login(accessToken);
try {
    /*
    client.createRole("editor",
    {permissions: {
       ResourceType.Pool, [{tag: "Create" }, {tag: "Read" }]}});
    client.createUser("id", {roles: ["editor"], preferences: {}});
    */

    const repositoryId = "id";
    client.createRepository(repositoryId, {url: ""});
    client.createRepositoryVersion(repositoryId, "");

    const sessionId = "sessionId";
    client.createSession(sessionId, {repositorySource: {repositoryId: repositoryId, repositoryVersionId: "master"}});

} finally {
    await client.logout();
}
