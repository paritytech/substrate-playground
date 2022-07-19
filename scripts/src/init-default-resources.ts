
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

async function waitForRepositoryVersionCreation(client: Client, repositoryId: string, repositoryVersionId: string) {
    const timeout = 60 * 1000;
    const interval = 1000;
    const startTime = Date.now();
    return new Promise<void>((resolve, reject) => {
        const id = setInterval(async () => {
            const { state } = await client.getRepositoryVersion(repositoryId, repositoryVersionId);
            if (state.type == "Ready") {
                clearInterval(id);
                resolve();
                return;
            } else if (state.type == "Failed") {
                clearInterval(id);
                reject(state.message);
                return;
            } else if ((Date.now() - startTime) > timeout) {
                clearInterval(id);
                reject(`Session not deployed after ${timeout} ms`);
            } else {
                console.log("In progress");
            }
        }, interval);
    });
}

const client = newClient(env);
try {
    await client.login(accessToken);

    const repositoryId = 'node-template';
    const repositoryVersionId = "0d2047031d8642ec5b4447e1eca9f47d00123bbe";
    try {
        await client.createRepository(repositoryId, {url: "https://github.com/jeluard/substrate-node-template"});
        console.log("Created Repository");
    } catch (e) {
        console.error(e);
    }

    try {
        await client.createRepositoryVersion(repositoryId, repositoryVersionId);
        console.log("Created RepositoryVersion");
    } catch (e) {
        console.error(e);
    }

    await waitForRepositoryVersionCreation(client, repositoryId, repositoryVersionId);

    await client.createSession(mainSessionId((await client.get()).user), {repositorySource: {repositoryId: repositoryId}});
    console.log("Created Session");
} catch(e) {
    console.error(e);
} finally {
    await client.logout();
}
