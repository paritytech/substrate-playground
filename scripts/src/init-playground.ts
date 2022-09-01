
import { Client, playgroundBaseAPIURL, environmentTypeFromString, EnvironmentType, RepositoryVersion } from '@substrate/playground-client';
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

function newClient(env: EnvironmentType): Client {
    return new Client(playgroundBaseAPIURL(env), 30000, {credentials: "include"});
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

    const repositoryVersionId = await latestRepositoryVersion(repository);

    await client.createPreference('SessionDefaultDuration', {value: "45"});
    await client.createPreference('SessionMaxDuration', {value: "1440"});
    await client.createPreference('SessionPoolAffinity', {value: "default"});

    if (! await client.getRepository(repositoryId)) {
        console.log("Creating Repository");
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
    if (!repositoryVersionIds.includes(repositoryVersionId)) {
        console.log("Creating RepositoryVersion");
        try {
            await client.createRepositoryVersion(repositoryId, repositoryVersionId);
        } catch (e) {
            console.error("Failed to create RepositoryVersion");
            throw e;
        }
    }
} catch(e) {
    console.error(`Error: ${e.message}`, e.data);
    process.exit(1);
} finally {
    await client.logout();
}
