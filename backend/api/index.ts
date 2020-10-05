import 'cross-fetch/polyfill';

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise(function(resolve, reject) {
        setTimeout(function() {
            reject(new Error("timeout"));
        }, ms)
        promise.then(resolve, reject);
    });
}

async function fetchWithTimeout(url: string, opts: Object = {cache: "no-store"}, ms: number = 30000): Promise<Response | Error>  {
    return timeout(fetch(url, opts), ms).catch((error: Error) => error);
}

const headers = {'Accept': 'application/json', 'Content-Type': 'application/json'};

export type JSONRPCResponse<T> = { result?: T} | { error?: string };

interface RPCResponse<TResult> {
    result?: TResult;
    error?: string;
}

async function fromResponse<T>(response: Response | Error): Promise<RPCResponse<T>> {
    if (response instanceof Response) {
        try {
            // Here the JSON is already in JSON-RPC format so return as-is
            return await response.json();
        } catch (e) {
            console.error(e);
            return {error: (!response.ok && response.statusText) || (response.status == 401 && "User unauthorized")};
        }
    } else {
        return {error: response.message};
    }
}

export interface Details {
    client_id: number,
    name: string,
}

export interface UserDetails {
    id: string,
    instances: Map<String, String>,
}

// See https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#pod-phase
export type Phase = "Pending" | "Running" | "Succeeded" | "Failed" | "Unknown";

export type Environment = "development" | "staging" | "production";

function playgroundBaseURL(env: Environment) {
    switch (env) {
        case "development":
            return "http://playground-dev.substrate.test/api";
        case "staging":
            return "https://playground-staging.substrate.dev/api";
        case "production":
            return "https://playground.substrate.dev/api";
        default:
            throw new Error(`Unrecognized env ${env}`);
    }
}

export class Client {

    base;

    constructor({ base, env }: {base?: string, env?: Environment}) {
        if (!base && !env) {
            throw new Error('At least one of `base` or `env` must be set')
        }
        if (base && env) {
            throw new Error('Both `base` or `env` cannot be set')
        }
        this.base = base || playgroundBaseURL(env);
    }

    async getDetails(): Promise<RPCResponse<Details>> {
        return fromResponse(await fetchWithTimeout(this.base, {
            method: 'GET',
            headers: headers
        }));
    }
    
    async getInstanceDetails(instanceUUID: string): Promise<JSONRPCResponse<Phase>> {
        return fromResponse(await fetchWithTimeout(`${this.base}/${instanceUUID}`, {
            method: 'GET',
            headers: headers
        }));
    }
    
    async deployInstance(template: string) {
        return fromResponse(await fetchWithTimeout(`${this.base}/?template=${template}`, {
            method: 'POST',
            headers: headers
        }));
    }
    
    async stopInstance(instanceUUID: string) {
        return fromResponse(await fetchWithTimeout(`${this.base}/${instanceUUID}`, {
            method: 'DELETE',
            headers: headers
        }));
    }
    
    async logout() {
        return fromResponse(await fetchWithTimeout(`${this.base}/logout`, {
            method: 'GET',
            headers: headers
        }));
    }

}