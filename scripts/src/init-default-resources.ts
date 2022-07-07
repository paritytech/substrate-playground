
import { Client, playgroundBaseURL, environmentTypeFromString, mainSessionId, EnvironmentType } from '@substrate/playground-client';
import 'cross-fetch/dist/node-polyfill.js'; // TODO remove once moving to Node18 (https://github.com/nodejs/node/pull/41749)

const accessToken = process.env.ACCESS_TOKEN;

const env = environmentTypeFromString(process.env.ENV);

function newClient(env: EnvironmentType): Client {
    return new Client(playgroundBaseURL(env), 30000, {credentials: "include"});
}

// Disable certificate checking for 'dev' env
if (env == EnvironmentType.dev) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

// Connect via Client, create others Role, feed repository

const client = newClient(env);
try {
    await client.login(accessToken);

    const repositoryId = 'substrate-node-template';
    try {
        await client.createRepository(repositoryId, {url: "https://github.com/jeluard/substrate-node-template"});
        console.log("Created Repository");
    } catch (e) {
        console.error(e);
    }
    try {
        await client.createRepositoryVersion(repositoryId, "e1abd651d1412a5171db6595fa37f613b57a73f3");
        console.log("Created RepositoryVersion");
    } catch (e) {
        console.error(e);
    }

    await client.createSession(mainSessionId((await client.get()).user), {repositorySource: {repositoryId: repositoryId}});
    console.log("Created Session");
} catch(e) {
    console.error(e);
} finally {
    await client.logout();
}
