const test = require('ava');
const fetch = require('node-fetch');
const { Client } = require('@substrate/playground-api');

function playgroundDomain() {
  const env = process.env.ENVIRONMENT || "development";
  switch (env) {
    case "development":
      return "http://playground-dev.substrate.test";
    case "staging":
      return "https://playground-staging.substrate.dev";
    case "production":
      return "https://playground.substrate.dev";
    default:
      throw new Error(`Unrecognized env ${env}`);
  }
}

const env = process.env.ENVIRONMENT || "development";
const client = new Client({env: env});

test('unauthenticated - should not be able to create a new instance', async (t) => {
  const res = await fetch(`${playgroundDomain()}/api/?template=node-template`, { method: 'POST' });
  t.is(res.status, 401);
});

test('unauthenticated - should be able to list templates', async (t) => {
  const res = await client.getDetails();
  t.is(res.status, 200);
});

test('unauthenticated - should not have access to instances', async (t) => {
  const uuid = "TODO";
  const res = await fetch(`${playgroundDomain()}/api/${uuid}`);
  t.is(res.status, 401);
});

test('unauthenticated - should not be able to delete instances', async (t) => {
  const uuid = "TODO";
  const res = await fetch(`${playgroundDomain()}/api/${uuid}`, { method: 'DELETE' });
  t.is(res.status, 401);
});

const cookie = process.env.TEST_ACCOUNT_COOKIE;
if (cookie) {
  const headers = { cookie };
  let uuid;

  test('authenticated - should be able to create a new instance', async (t) => {
    const res = await fetch(`${playgroundDomain()}/api/?template=node-template`, { method: 'POST', headers });
    t.is(res.status, 200);
    const json = await res.json();
 //   expect(json.result).to.not.be.empty();
    uuid = json.result;
  });

  test('authenticated - should have access to instance information', async (t) => {
    const res = await fetch(`${playgroundDomain()}/api/${uuid}`, { headers });
    t.is(res.status, 200);
    const json = await res.json();
 //   expect(json.result).to.not.be.empty();
  });

  test('authenticated - should delete the instance', async (t) => {
    const res = await fetch(`${playgroundDomain()}/api/${uuid}`, { method: 'DELETE', headers });
    t.is(res.status, 401);
  });
}