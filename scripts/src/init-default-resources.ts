
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
                console.log(state.type);
            }
        }, interval);
    });
}

async function latestRepositoryVersion(repo: string): Promise<string> {
    const response = await (await fetch(`https://api.github.com/repos/${repo}/commits`)).json();
    return response[0].sha;
}

const client = newClient(env);
try {
    await client.login(accessToken);

    const repository = "jeluard/substrate-node-template";
    const repositoryId = 'node-template';
    const repositoryVersionId = await latestRepositoryVersion(repository);
    try {
        const repositoryIds = (await client.listRepositories()).map(repository => repository.id);
        console.log(`Existing repositories: ${repositoryIds}`);
        await client.createRepository(repositoryId, {url: `https://github.com/${repository}`});
        console.log("Created Repository");
    } catch (e) {
        console.error(e);
        process.exit(1);
    }

    try {
        const repositoryVersionIds = (await client.listRepositoryVersions(repositoryId)).map(repositoryVersion => repositoryVersion.id);
        console.log(`Existing repository versions: ${repositoryVersionIds}`);
        await client.createRepositoryVersion(repositoryId, repositoryVersionId);
        console.log("Created RepositoryVersion");
    } catch (e) {
        console.error(e);
        process.exit(1);
    }

    await waitForRepositoryVersionCreation(client, repositoryId, repositoryVersionId);

    await client.createSession(mainSessionId((await client.get()).user), {repositorySource: {repositoryId: repositoryId}});
    console.log("Created Session");
} catch(e) {
    console.error(e);
    process.exit(1);
} finally {
    await client.logout();
}
