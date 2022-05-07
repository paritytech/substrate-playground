import test from 'ava';
import { Client, EnvironmentType, playgroundBaseURL, environmentTypeFromString } from '@substrate/playground-client';

import 'cross-fetch/dist/node-polyfill.js'; // TODO remove once moving to Node18 (https://github.com/nodejs/node/pull/41749)

const env = environmentTypeFromString(process.env.ENV);
const accessToken = process.env.ACCESS_TOKEN;

function newClient(): Client {
    return new Client(playgroundBaseURL(env), 30000, {credentials: "include"});
}

// Disable certificate checking for 'dev' env
if (env == EnvironmentType.dev) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

async function mainSessionId(client: Client): Promise<string> {
    return (await client.get()).user?.id.toLocaleLowerCase();
}

const template = 'node-template';

test('unauthenticated - should not be able to create a new session', async (t) => {
    try {
        const client = newClient();
        await client.createSession(await mainSessionId(client), {template: template});
        t.fail('Can create a session w/o login');
    } catch {
        t.pass();
    }
});

if (accessToken) {
    test('authenticated - should be able to get current session', async (t) => {
        const client = newClient();
        await client.login(accessToken);
        try {
            const sessionId = await mainSessionId(client);
            await client.createSession(sessionId, {template: template});
            t.not(await client.getSession(sessionId), null);
            await client.deleteSession(sessionId);
        } catch {
            t.fail('Failed to create a session');
            await client.logout();
        }
    });

    test('authenticated - should not be able to get current session when unlogged', async (t) => {
        const client = newClient();
        await client.login(accessToken);

        const sessionId = await mainSessionId(client);
        await client.createSession(sessionId, {template: template});
        t.not(await client.getSession(sessionId), null);

        await client.logout();

        try {
            t.is(await client.getSession(sessionId), null);
        } catch {
            t.pass();

            await client.login(accessToken);
            await client.deleteSession(sessionId);
        }
    });

    if (env == EnvironmentType.staging) { // TODO Not deployed on prod yet
        test('authenticated - should be able to execute in session', async (t) => {
            const client = newClient();
            await client.login(accessToken);

            const sessionId = await mainSessionId(client);
            await client.createSession(sessionId, {template: template});
            try {
                const { stdout } = await client.createSessionExecution(sessionId, {command: ["ls"]});
                console.log(stdout);
                t.not(stdout, null);
            } finally {
                client.deleteSession(sessionId);
                await client.logout();
            }
        });
    }
}
