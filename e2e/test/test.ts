import test from 'ava';
import { Client, EnvironmentType, playgroundBaseURL } from '@substrate/playground-client';
import 'cross-fetch/polyfill';
import 'abort-controller/polyfill';

const env: EnvironmentType = EnvironmentType[process.env.ENV] || EnvironmentType.dev;
const client = new Client(playgroundBaseURL(env), {credentials: "include"});

test('unauthenticated - should not be able to create a new session', async (t) => {
    try {
        await client.createOrUpdateCurrentSession({template: 'node-template'});
        t.fail('Can create a session w/o login');
    } catch {
        t.pass();
    }
});

test('unauthenticated - should be able to list templates', async (t) => {
  const details = await client.get();
  t.is(Object.keys(details.templates).length > 0, true);
});
