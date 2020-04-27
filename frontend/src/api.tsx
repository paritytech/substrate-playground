import { fetchWithTimeout } from './utils';

const headers = {'Accept': 'application/json', 'Content-Type': 'application/json'};

type JSONRPCResponse<T> = { result: T} | { error: string };

async function fromResponse(response: Response) {
    try {
        // Here the JSON is already in JSON-RPC format so return as-is
        return await response.json();
    } catch {
        return {error: (!response.ok && response.statusText) || "Internal error: failed to parse returned JSON"};
    }
}

export async function getUserDetails(userUUID: string) {
    return fromResponse(await fetchWithTimeout(`/api/${userUUID}`, {
        method: 'GET',
        headers: headers
    }));
}

export async function getTemplates() {
    return fromResponse(await fetchWithTimeout(`/api/templates`, {
        method: 'GET',
        headers: headers
    }));
}

// See https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#pod-phase
type Phase = "Pending" | "Running" | "Succeeded" | "Failed" | "Unknown";

export async function getInstanceDetails(userUUID: string, instanceUUID: string): Promise<JSONRPCResponse<Phase>> {
    return fromResponse(await fetchWithTimeout(`/api/${userUUID}/${instanceUUID}`, {
        method: 'GET',
        headers: headers
    }));
}

export async function deployImage(userUUID: string, template: string) {
    return fromResponse(await fetchWithTimeout(`/api/${userUUID}?template=${template}`, {
        method: 'POST',
        headers: headers
    }));
}