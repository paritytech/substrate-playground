
import { Client, playgroundBaseURL, environmentTypeFromString, mainSessionId, EnvironmentType, RepositoryVersion } from '@substrate/playground-client';
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

async function waitForRepositoryVersionCreation(client: Client, repositoryId: string, repositoryVersionId: string): Promise<RepositoryVersion> {
    const interval = 5000;
    return new Promise<RepositoryVersion>((resolve, reject) => {
        const id = setInterval(async () => {
            const result = await client.getRepositoryVersion(repositoryId, repositoryVersionId);
            const type = result?.state.type;
            if (type == "Ready") {
                clearInterval(id);
                resolve(result);
            } else if (type == "Failed") {
                clearInterval(id);
                reject({type: "Failure", data: result.state.message});
            } else if (type == "Init") {
                console.log("Init");
            } else if (type == "Cloning") {
                console.log(`Cloning: progress=${result.state.progress}`);
            } else if (type == "Building") {
                console.log(`Building: progress=${result.state.progress}`);
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

    const details = await client.get();
    console.log(`Logged as ${details.user.id}`);

    const repository = "jeluard/substrate-node-template";
    const repositoryId = 'node-template';
    const repositoryVersionId = await latestRepositoryVersion(repository);

    await client.createPreference('SessionDefaultDuration', {value: "45"});
    await client.createPreference('SessionMaxDuration', {value: "1440"});
    await client.createPreference('SessionPoolAffinity', {value: "default"});
    await client.createPreference('UserDefaultRoles', {value: "TestUppercase=super-admin"});

    if (! await client.getRepository(repositoryId)) {
        console.log("Creating Repository");
        try {
            await client.createRepository(repositoryId, {url: "https://github.com/jeluard/substrate-node-template"});
        } catch (e) {
            console.error("Failed to create repository");
            throw e;
        }
    } else {
        console.log("Repository ready");
    }

    const repositoryVersionIds = (await client.listRepositoryVersions(repositoryId)).map(repositoryVersion => repositoryVersion.id);
    if (!repositoryVersionIds.includes(repositoryVersionId)) {
        console.log("Creating RepositoryVersion");
        try {
            await client.createRepositoryVersion(repositoryId, repositoryVersionId);
        } catch (e) {
            console.error("Failed to create RepositoryVersion");
            throw e;
        }
    }

    await waitForRepositoryVersionCreation(client, repositoryId, repositoryVersionId).catch(e => {
        console.error(`Error while waiting for RepositoryVersion creation: ${e}`);
        process.exit(1);
    });
    console.log("RepositoryVersion ready");

    console.log("Creating Session");
    await client.createSession(mainSessionId((await client.get()).user), {repositorySource: {repositoryId: repositoryId}});
} catch(e) {
    console.error(`Error: ${e.type}`, e.data);
    process.exit(1);
} finally {
    await client.logout();
}
