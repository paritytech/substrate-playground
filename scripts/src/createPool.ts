
import { Client, EnvironmentType, playgroundBaseURL, environmentTypeFromString } from '@substrate/playground-client';
import k8s from '@kubernetes/client-node';

import 'cross-fetch/dist/node-polyfill.js'; // TODO remove once moving to Node18 (https://github.com/nodejs/node/pull/41749)

const accessToken = process.env.ACCESS_TOKEN;

function newClient(): Client {
    const env = environmentTypeFromString(process.env.ENV);
    return new Client(playgroundBaseURL(env), 30000, {credentials: "include"});
}

async function mainSessionId(client: Client): Promise<string> {
    return (await client.get()).user?.id.toLocaleLowerCase();
}

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

const rolesConfigMap = 'playground-roles';
await k8sApi.readNamespacedConfigMap(rolesConfigMap, 'default').catch(async _ => {
    await k8sApi.createNamespacedConfigMap('default', {
        metadata: {
            name: rolesConfigMap
        },
        data: {
            'super-admin': `
permissions:
- all :
    all : ''`,
        }
    });
});

const template = 'node-template';

// Deploy necessary configmap if they don't exist yet
// Create super admin Role via kube API
// Create main user via kube API
// Connect via Client, create others Role, feed repository

if (accessToken) {
    const client = newClient();
    await client.login(accessToken);
    try {
        const sessionId = await mainSessionId(client);
        await client.createSession(sessionId, {template: template});

    } finally {
        await client.logout();
    }

}
