
import { Client, playgroundBaseAPIURL, environmentTypeFromString, EnvironmentType, RepositoryVersion, Preferences } from '@substrate/playground-client';
import 'cross-fetch/dist/node-polyfill.js'; // TODO remove once moving to Node18 (https://github.com/nodejs/node/pull/41749)

const accessToken = process.env.ACCESS_TOKEN;
if (!accessToken) {
    console.error("Missing mandatory env variable ACCESS_TOKEN");
    process.exit(1);
}

const env = environmentTypeFromString(process.env.ENV);

// Disable certificate checking for 'dev' env, as certificates are self signed
if (env == EnvironmentType.dev) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

if (process.argv.length < 4) {
    console.error("Invalid arguments; Example usage: yarn run:init-playground node-template jeluard/substrate-node-template");
    process.exit(1);
}

function newClient(env: EnvironmentType): Client {
    return new Client(playgroundBaseAPIURL(env), 30000, {credentials: "include"});
}

async function waitForRepositoryVersionCreation(client: Client, repositoryId: string, repositoryVersionId: string): Promise<RepositoryVersion> {
    const interval = 5000;
    return new Promise<RepositoryVersion>((resolve, reject) => {
        const id = setInterval(async () => {
            try {
                const result = await client.getRepositoryVersion(repositoryId, repositoryVersionId);
                const type = result?.state.type;
                if (type == "Ready") {
                    clearInterval(id);
                    resolve(result);
                } else if (type == "Failed") {
                    clearInterval(id);
                    reject({type: "Failure", message: result.state.message});
                } else if (type == "Init") {
                    console.log("Init");
                } else if (type == "Cloning") {
                    console.log(`Cloning: progress=${result.state.progress}`);
                } else if (type == "Building") {
                    console.log(`Building: progress=${result.state.progress}`);
                } else {
                    console.log(`Unknown state: ${result.state}`);
                }
            } catch (e) {
                clearInterval(id);
                reject({type: "Failure", message: `Error during version access: ${JSON.stringify(e)}`});
            }
        }, interval);
    });
}

// Connect via Client, feed repository

async function latestRepositoryVersion(repo: string): Promise<string> {
    const response = await (await fetch(`https://api.github.com/repos/${repo}/commits`)).json();
    return response[0].sha;
}

const repositoryId = process.argv[2];
const repository = process.argv[3];
const repositoryUrl = `https://github.com/${repository}`;

const client = newClient(env);
try {
    await client.login(accessToken);

    const details = await client.get();
    console.log(`Logged as ${details.user.id} (${details.user.role})`);

    const editorId = "openvscode";

    await client.createEditor(editorId, {image: "paritytech/substrate-playground-editor-openvscode:sha-37d01730", env: {}});

    await client.createPreference(Preferences.DefaultEditor, {value: editorId});
    await client.createPreference(Preferences.SessionDefaultDuration, {value: "45"});
    await client.createPreference(Preferences.SessionMaxDuration, {value: "1440"});
    await client.createPreference(Preferences.SessionPoolAffinity, {value: "default"});

    if (! await client.getRepository(repositoryId)) {
        console.log(`Creating Repository ${repositoryId}`);
        try {
            await client.createRepository(repositoryId, {url: repositoryUrl});
        } catch (e) {
            console.error("Failed to create repository");
            throw e;
        }
    } else {
        console.log("Repository ready");
    }

    const repositoryVersionIds = (await client.listRepositoryVersions(repositoryId)).map(repositoryVersion => repositoryVersion.id);
    const repositoryVersionId = await latestRepositoryVersion(repository);
    if (!repositoryVersionIds.includes(repositoryVersionId)) {
        console.log(`Creating RepositoryVersion ${repositoryVersionId}`);
        try {
            await client.createRepositoryVersion(repositoryId, repositoryVersionId);
        } catch (e) {
            console.error("Failed to create RepositoryVersion");
            throw e;
        }
    }

    await waitForRepositoryVersionCreation(client, repositoryId, repositoryVersionId).catch(e => {
        console.error('Error while waiting for RepositoryVersion creation', e);
        process.exit(1);
    });
    console.log("RepositoryVersion ready");
} catch(e) {
    console.error(`Error: ${e.message}`, e.data);
    process.exit(1);
} finally {
    console.log("Logged out");
    await client.logout();
}
