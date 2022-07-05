
import { Client, playgroundBaseURL, environmentTypeFromString, mainSessionId } from '@substrate/playground-client';
import 'cross-fetch/dist/node-polyfill.js'; // TODO remove once moving to Node18 (https://github.com/nodejs/node/pull/41749)

const accessToken = process.env.ACCESS_TOKEN;

function newClient(): Client {
    const env = environmentTypeFromString(process.env.ENV);
    return new Client(playgroundBaseURL(env), 30000, {credentials: "include"});
}

// Connect via Client, create others Role, feed repository

const client = newClient();
try {
    await client.login(accessToken);

    const repositoryId = 'substrate-node-template';
    await client.createRepository(repositoryId, {url: "https://github.com/jeluard/substrate-node-template"});
    console.log("Created Repository");
    try {
        await client.createRepositoryVersion(repositoryId, "e1abd651d1412a5171db6595fa37f613b57a73f3");
        console.log("Created RepositoryVersion");
    } catch {
    }

    await client.createSession(mainSessionId((await client.get()).user), {repositorySource: {repositoryId: repositoryId}});
    console.log("Created Session");
} catch(e) {
    console.error(e);
} finally {
    await client.logout();
}
