
import { Client, playgroundBaseURL, environmentTypeFromString, mainSessionId, EnvironmentType } from '@substrate/playground-client';
import 'cross-fetch/dist/node-polyfill.js'; // TODO remove once moving to Node18 (https://github.com/nodejs/node/pull/41749)

const accessToken = process.env.ACCESS_TOKEN;
if (!accessToken) {
    console.error("Missing mandatory env variable ACCESS_TOKEN");
    process.exit(1);
}

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
    const timeout = 10 * 60 * 1000;
    const interval = 5000;
    const startTime = Date.now();
    return new Promise<void>((resolve, reject) => {
        const id = setInterval(async () => {
            const result = await client.getRepositoryVersion(repositoryId, repositoryVersionId);
            const type = result?.state.type;
            if (type == "Ready") {
                clearInterval(id);
                resolve();
                return;
            } else if (type == "Failed") {
                clearInterval(id);
                reject(result.state.message);
                return;
            } else if (type == "Init") {
                console.log("Init");
            } else if (type == "Cloning") {
                console.log(`Cloning: progress=${result.state.progress}`);
            } else if (type == "Building") {
                console.log(`Building: progress=${result.state.progress}`);
            } else if ((Date.now() - startTime) > timeout) {
                clearInterval(id);
                reject(`RepositoryVersion not created after ${timeout} ms`);
            } else {
                console.log(`Unknown state: ${result.state}`);
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
        if (! await client.getRepository(repositoryId)) {
            console.log("Creating Repository");
            await client.createRepository(repositoryId, {url: "https://github.com/jeluard/substrate-node-template"});
        }
    } catch (e) {
        console.error("Failed to create repository", e);
    }

    try {
        const repositoryVersionIds = (await client.listRepositoryVersions(repositoryId)).map(repositoryVersion => repositoryVersion.id);
        if (repositoryVersionIds.length > 0) {
            console.log(`Existing repository versions: ${repositoryVersionIds}`);
        }
        await client.createRepositoryVersion(repositoryId, repositoryVersionId);
        console.log("Created RepositoryVersion");
    } catch (e) {
    }

    await waitForRepositoryVersionCreation(client, repositoryId, repositoryVersionId);
    console.log("RepositoryVersion ready");

    await client.createSession(mainSessionId((await client.get()).user), {repositorySource: {repositoryId: repositoryId}});
    console.log("Created Session");
} catch(e) {
    console.error(e);
    process.exit(1);
} finally {
    await client.logout();
}
