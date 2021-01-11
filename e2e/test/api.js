import test from 'ava';
import pkg from '@substrate/playground-client';
const { Client } = pkg;

const env = process.env.ENV || "dev";
const client = new Client({env: env});

test('unauthenticated - should not be able to create a new session', async (t) => {
  const res = await client.deployInstance('node-template');
  t.is(res.error, 'User unauthorized');
});

test('unauthenticated - should be able to list templates', async (t) => {
  const res = await client.getDetails();
  t.is(Object.keys(res.result.templates).length > 0, true);
});
