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

test('unauthenticated - should not be able to create a new session', async (t) => {
    try {
        const client = newClient();
        const sessionId = (await client.get()).user?.id.toLocaleLowerCase();
        await client.createSession(sessionId, {template: 'node-template'});
        t.fail('Can create a session w/o login');
    } catch {
        t.pass();
    }
});

if (accessToken) {
    test('authenticated - should be able to get current session', async (t) => {
        const client = newClient();
        await client.login(accessToken);

        const sessionId = (await client.get()).user?.id.toLocaleLowerCase();

        await client.getSession(sessionId);

        await client.logout();

        try {
            await client.getSession(sessionId);
        } catch {
            t.pass();
        }
    });

    if (env == EnvironmentType.staging) { // TODO Not deployed on prod yet
        test('authenticated - should be able to execute in session', async (t) => {
            const client = newClient();
            await client.login(accessToken);

            const sessionId = (await client.get()).user?.id.toLocaleLowerCase();
            await client.createSession(sessionId, {template: "node-template"});
            try {
                const { stdout } = await client.createSessionExecution(sessionId, {command: ["ls"]});
                console.log(stdout);
            } finally {
                client.deleteSession(sessionId);
                await client.logout();
            }
        });
    }
}
