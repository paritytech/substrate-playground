import test from 'ava';
import { Client, EnvironmentType, playgroundBaseAPIURL, environmentTypeFromString, mainSessionId } from '@substrate/playground-client';

import 'cross-fetch/dist/node-polyfill.js'; // TODO remove once moving to Node18 (https://github.com/nodejs/node/pull/41749)

const env = environmentTypeFromString(process.env.ENV);

// Disable certificate checking for 'dev' env, as certificates are self signed
if (env == EnvironmentType.dev) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function newClient(): Client {
    return new Client(playgroundBaseAPIURL(env), 30000, {credentials: "include"});
}

async function createSession(userId: string, client: Client): Promise<string> {
    const sessionId = await mainSessionId((await client.get()).user);
    await client.createUserSession(userId, sessionId, {repositorySource: {repositoryId: 'node-template'}});
    return sessionId;
}

test('unauthenticated - should be able to get details', async (t) => {
    try {
        const client = newClient();
        const details = await client.get();
        t.is(details.user, null);
        t.not(details.configuration, null);
    } catch {
        t.pass();
    }
});

test('unauthenticated - should not be able to create a new session', async (t) => {
    try {
        const client = newClient();
        await createSession("", client);
        t.fail('Can create a session w/o login');
    } catch {
        t.pass();
    }
});

async function waitForSessionDeletion(client: Client, userId: string, sessionId: string) {
    const timeout = 60 * 1000;
    const interval = 1000;
    const startTime = Date.now();
    return new Promise<void>((resolve, reject) => {
        const id = setInterval(async () => {
            const session = await client.getUserSession(userId, sessionId);
            if (session == null) {
                clearInterval(id);
                resolve();
                return;
            } else if ((Date.now() - startTime) > timeout) {
                clearInterval(id);
                reject(`Session not deployed after ${timeout} ms`);
            }
        }, interval);
    });
}

const accessToken = process.env.ACCESS_TOKEN;
if (accessToken) {

    test('authenticated - should be able to list users', async (t) => {
        const client = newClient();
        await client.login(accessToken);

        const details = await client.get();
        console.log(`Logged as ${details.user?.id}`);
        console.log(`Repositories: ${JSON.stringify(await client.listRepositories())}`);

        try {
            const users = await client.listUsers();
            t.not(users.length, 0);
        } finally {
            await client.logout();
        }
    });

    test('authenticated - should be able to get current session', async (t) => {
        const client = newClient();
        const user = await client.login(accessToken);
        try {
            const sessionId = await createSession(user.id, client);
            t.not(await client.getUserSession(user.id, sessionId), null);
            await client.deleteUserSession(user.id, sessionId);
            await waitForSessionDeletion(client, user.id, sessionId);
        } catch(e) {
            t.fail(`Failed to create a session ${e.message}`);
        } finally {
            await client.logout();
        }
    });

    test('authenticated - should not be able to get current session when unlogged', async (t) => {
        const client = newClient();
        const user = await client.login(accessToken);

        const sessionId = await createSession(user.id, client);
        t.not(await client.getUserSession(user.id, sessionId), null);

        await client.logout();

        try {
            t.is(await client.getUserSession(user.id, sessionId), null);
        } catch {
            t.pass();
        } finally {
            await client.login(accessToken);
            await client.deleteUserSession(user.id, sessionId);
            await waitForSessionDeletion(client, user.id, sessionId);
            await client.logout();
        }
    });

    if (env == EnvironmentType.staging) { // TODO Not deployed on prod yet
        test('authenticated - should be able to execute in session', async (t) => {
            const client = newClient();
            const user = await client.login(accessToken);

            const sessionId = await createSession(user.id, client);
            try {
                const { stdout } = await client.createUserSessionExecution(user.id, sessionId, {command: ["ls"]});
                console.log(stdout);
                t.not(stdout, null);
            } finally {
                client.deleteUserSession(user.id, sessionId);
                await waitForSessionDeletion(client, user.id, sessionId);
                await client.logout();
            }
        });
    }
}
