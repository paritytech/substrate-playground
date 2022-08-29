export enum RpcErrorCode {
    PARSE_ERROR = -32700,
    INVALID_REQUEST = -32600,
    METHOD_NOT_FOUND = -32601,
    INVALID_PARAMS = -32602,
    INTERNAL_ERROR = -32603,
    RESPONSE_ERROR = -32100,
    SERVER_ERROR = -32000,
    TIMEOUT_ERROR = 1000,
}

// `fetch` but with a `timeout` in milliseconds. Relies on `AbortController`.
export async function fetchWithTimeout(input: RequestInfo, { signal, ...options }: RequestInit = {}, timeout: number): Promise<Response> {
    const controller = new AbortController();
    if (signal) signal.addEventListener("abort", () => controller.abort());
    const id = setTimeout(() => controller.abort(), timeout);
    const response = fetch(input, {
      ...options,
      signal: controller.signal
    });
    return response.finally(() => clearTimeout(id));
}

async function call<T>(input: RequestInfo, init: RequestInit, timeout: number): Promise<T> {
    try {
        const response = await fetchWithTimeout(input, init, timeout);
        if (response.ok) {
            try {
                const { result, error } = await response.json();
                if (error) {
                    // Backend already returns formated errors
                    return Promise.reject({code: RpcErrorCode.RESPONSE_ERROR, ...error});
                } else {
                    return Promise.resolve(result);
                }
            } catch (e) {
                return Promise.reject({code: RpcErrorCode.PARSE_ERROR, message: e.message || 'Failed to parse as JSON'});
            }
        } else {
            if (response.status == 401) {
                return Promise.reject({code: RpcErrorCode.INVALID_REQUEST, message: 'User unauthorized'});
            }
            return Promise.reject({code: RpcErrorCode.SERVER_ERROR, message: response.statusText});
        }
    } catch (e) {
        return Promise.reject({code: RpcErrorCode.TIMEOUT_ERROR, message: e.message || `Failed to fetch in ${timeout} ms`});
    }
}

export async function rpc<T>(input: string, { headers, ...options }: RequestInit = {}, timeout: number): Promise<T> {
    return await call(input, {
        method: 'GET',
        headers: {'Accept': 'application/json', 'Content-Type': 'application/json', ...headers},
        ...options
    }, timeout);
}
