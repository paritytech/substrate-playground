import test from 'ava';
import { Client, EnvironmentType, playgroundBaseAPIURL, environmentTypeFromString, Session, playgroundUserBaseURL } from '@substrate/playground-client';

import 'cross-fetch/dist/node-polyfill.js'; // TODO remove once moving to Node18 (https://github.com/nodejs/node/pull/41749)

const env = environmentTypeFromString(process.env.ENV);
const repositoryId = 'node-template';

// Disable certificate checking for 'dev' env, as certificates are self signed
if (env == EnvironmentType.dev) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function newClient(): Client {
    return new Client(playgroundBaseAPIURL(env), 30000, {credentials: "include"});
}

async function createSession(userId: string, client: Client) {
    await client.createSession(userId, {repositorySource: {repositoryId: repositoryId}});
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

async function waitForSessionDeletion(client: Client, userId: string) {
    const timeout = 60 * 1000;
    const interval = 1000;
    const startTime = Date.now();
    return new Promise<void>((resolve, reject) => {
        const id = setInterval(async () => {
            const session = await client.getSession(userId);
            if (session == null) {
                clearInterval(id);
                resolve();
                return;
            } else if ((Date.now() - startTime) > timeout) {
                clearInterval(id);
                reject({type: "Failure", message: `Session not deployed after ${timeout} ms`});
            }
        }, interval);
    });
}

async function waitForSession(client: Client, userId: string): Promise<Session> {
    const interval = 5000;
    return new Promise<Session>((resolve, reject) => {
        const id = setInterval(async () => {
            try {
                const session = await client.getSession(userId);
                const type = session?.state.type;
                if (type == "Running") {
                    clearInterval(id);
                    resolve(session);
                } else if (type == 'Failed') {
                    clearInterval(id);
                    reject({type: "Failure", message: session.state.message});
                }
            } catch (e) {
                clearInterval(id);
                reject({type: "Failure", message: `Error during version access: ${JSON.stringify(e)}`});
            }
        }, interval);
    });
}

const accessToken = process.env.ACCESS_TOKEN;
if (accessToken) {

    test('authenticated - should be able to list users', async (t) => {
        const client = newClient();
        await client.login(accessToken);

        try {
            const users = await client.listUsers();
            t.not(users.length, 0);
        } catch(e) {
            t.fail(`Failed to list users: ${e.message}`);
        } finally {
            await client.logout();
        }
    });

    test('authenticated - should be able to get current session', async (t) => {
        const client = newClient();
        await client.login(accessToken);
        const user = (await client.get()).user;
        await createSession(user.id, client);
        try {
            const session = await waitForSession(client, user.id);
            t.not(session, null);
            const { state } = session;
            if (state.type == "Running") {
                const port = state.runtimeConfiguration.ports.find(port => port.port == 80);
                t.not(port, undefined, "Can't find corresponding port");
                const url = playgroundUserBaseURL(env, user.id);
                const response = await fetch(url);
                t.is(response.ok, true, "Failed to access URL");
            }
        } catch(e) {
            t.fail(`Failed to create a session: ${e.message}`);
        } finally {
            await client.deleteSession(user.id);
            await waitForSessionDeletion(client, user.id);
            await client.logout();
        }
    });

    test('authenticated - should not be able to get current session when unlogged', async (t) => {
        const client = newClient();
        await client.login(accessToken);
        const user = (await client.get()).user;

        try {
            await createSession(user.id, client);
            t.not(await client.getSession(user.id), null);

            await client.logout();

            try {
                t.is(await client.getSession(user.id), null);
            } catch {
                t.pass();
            } finally {
                await client.login(accessToken);
                await client.deleteSession(user.id);
                await waitForSessionDeletion(client, user.id);
                await client.logout();
            }
        } catch(e) {
            t.fail(`Failed to create a session: ${e.message}`);
        }
    });

}
