
import { Client, playgroundBaseURL, environmentTypeFromString } from '@substrate/playground-client';
import 'cross-fetch/dist/node-polyfill.js'; // TODO remove once moving to Node18 (https://github.com/nodejs/node/pull/41749)

const accessToken = process.env.ACCESS_TOKEN;

function newClient(): Client {
    const env = environmentTypeFromString(process.env.ENV);
    return new Client(playgroundBaseURL(env), 30000, {credentials: "include"});
}

// Connect via Client, create others Role, feed repository

const client = newClient();
await client.login(accessToken);
try {
    const repositoryId = 'substrate-node-template';
    client.createRepository(repositoryId, {url: "https://github.com/jeluard/substrate-node-template"});
    client.createRepositoryVersion(repositoryId, "e1abd651d1412a5171db6595fa37f613b57a73f3");

    const sessionId = "sessionId";
    client.createSession(sessionId, {repositorySource: {repositoryId: repositoryId}});

} finally {
    await client.logout();
}
