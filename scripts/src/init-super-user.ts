import k8s from '@kubernetes/client-node';

// First create the super user, who has `super-admin` role.

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

const rolesConfigMap = 'playground-roles';
// Only create if not existing yet
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

// Create main user, id is a CLI argument

/// TODO
