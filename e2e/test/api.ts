import test from 'ava';
import { Client, EnvironmentType, playgroundBaseURL, environmentTypeFromString } from '@substrate/playground-client';

import 'cross-fetch/dist/node-polyfill.js'; // TODO remove once moving to Node18 (https://github.com/nodejs/node/pull/41749)

const env = environmentTypeFromString(process.env.ENV);
const accessToken = process.env.ACCESS_TOKEN;
if (!accessToken) {
    console.error("ACCESS_TOKEN env is not set");
    process.exit(1);
}

function newClient(): Client {
    return new Client(playgroundBaseURL(env), 30000, {credentials: "include"});
}

// Disable certificate checking for 'dev' env
if (env == EnvironmentType.dev) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

test('unauthenticated - should not be able to create a new workspace', async (t) => {
    try {
        await newClient().createCurrentWorkspace({repositoryDetails: {id: 'node-template', reference: ''}});
        t.fail('Can create a workspace w/o login');
    } catch {
        t.pass();
    }
});

test('authenticated - should be able to get current session', async (t) => {
    const client = newClient();
    await client.login(accessToken);

    await client.getCurrentSession();

    await client.logout();

    try {
        await client.getCurrentSession();
    } catch {
        t.pass();
    }
});

test('unauthenticated - should be able to list templates', async (t) => {
    const details = await newClient().get();
    t.is(Object.keys(details.templates).length > 0, true);
});
