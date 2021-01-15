import test from 'ava';
import pkg from '@substrate/playground-client';
const { Client, playgroundBaseURL } = pkg;

const env = process.env.ENV || "dev";
const client = new Client(playgroundBaseURL(env), {credentials: "include"});

test('unauthenticated - should not be able to create a new session', async (t) => {
  const res = await client.createOrUpdateCurrentSession({template: 'node-template'});
  t.is(res.error, 'User unauthorized');
});

test('unauthenticated - should be able to list templates', async (t) => {
  const res = await client.get();
  t.is(Object.keys(res.result.templates).length > 0, true);
});
