import test from 'ava';
import pkg from '@substrate/playground-api';
const { Client } = pkg;

const env = process.env.ENVIRONMENT || "development";
const client = new Client({env: env});

test('unauthenticated - should not be able to create a new instance', async (t) => {
  const res = await client.deployInstance('node-template');
  t.is(res.error, 'Unauthorized');
});

test('unauthenticated - should be able to list templates', async (t) => {
  const res = await client.getDetails();
  t.is(Object.keys(res.result.templates).length > 0, true);
});
