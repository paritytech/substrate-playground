import 'cross-fetch/polyfill';

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise(function(resolve, reject) {
        setTimeout(function() {
            reject(new Error("timeout"));
        }, ms)
        promise.then(resolve, reject);
    });
}

async function fetchWithTimeout(url: string, opts: Object, ms: number = 30000): Promise<Response | Error>  {
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
            if (response.ok) {
                // Here the JSON is already in JSON-RPC format so return as-is
                return await response.json();
            } else {
                if (response.status == 401) {
                    return {error: "User unauthorized"};
                }
                return {error: response.statusText};
            }
        } catch (e) {
            console.error(e);
            return {error: response.statusText};
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

const DEFAULT_OPTS = {credentials: "include"};

export class Client {

    base;
    defaultOpts;

    constructor({ base, env, defaultOpts = DEFAULT_OPTS }: {base?: string, env?: Environment, defaultOpts?: Object }) {
        if (!base && !env) {
            throw new Error('At least one of `base` or `env` must be set')
        }
        if (base && env) {
            throw new Error('Both `base` or `env` cannot be set')
        }
        this.base = base || playgroundBaseURL(env);
        this.defaultOpts = defaultOpts;
    }

    async getDetails(opts: Object = this.defaultOpts): Promise<RPCResponse<Details>> {
        return fromResponse(await fetchWithTimeout(this.base, {
            method: 'GET',
            headers: headers,
            ...opts
        }));
    }
    
    async getInstanceDetails(instanceUUID: string, opts: Object = this.defaultOpts): Promise<JSONRPCResponse<Phase>> {
        return fromResponse(await fetchWithTimeout(`${this.base}/${instanceUUID}`, {
            method: 'GET',
            headers: headers,
            ...opts
        }));
    }
    
    async deployInstance(template: string, opts: Object = this.defaultOpts) {
        return fromResponse(await fetchWithTimeout(`${this.base}/?template=${template}`, {
            method: 'POST',
            headers: headers,
            ...opts
        }));
    }
    
    async stopInstance(instanceUUID: string, opts: Object = this.defaultOpts) {
        return fromResponse(await fetchWithTimeout(`${this.base}/${instanceUUID}`, {
            method: 'DELETE',
            headers: headers,
            ...opts
        }));
    }
    
    async logout(opts: Object = this.defaultOpts) {
        return fromResponse(await fetchWithTimeout(`${this.base}/logout`, {
            method: 'GET',
            headers: headers,
            ...opts
        }));
    }

}