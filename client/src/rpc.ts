export enum RpcErrorCode {
    PARSE_ERROR = -32700,
    INVALID_REQUEST = -32600,
    METHOD_NOT_FOUND = -32601,
    INVALID_PARAMS = -32602,
    INTERNAL_ERROR = -32603,
    SERVER_ERROR = -32000,
    TIMEOUT_ERROR = 1000,
}

async function fetchWithTimeout<T>(input: RequestInfo, init: RequestInit, timeout: number = 30000): Promise<T> {
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        const response = await fetch(input, {
          ...init,
          signal: controller.signal
        });
        clearTimeout(id);
        if (response.ok) {
            try {
                const { result, error } = await response.json();
                if (result) {
                    return Promise.resolve(result);
                } else {
                    return Promise.reject(error);
                }
            } catch (e) {
                try {
                    const data = await response.text();
                    return Promise.reject({code: RpcErrorCode.PARSE_ERROR, message: response.statusText, data: data});
                } catch (e) {
                    return Promise.reject({code: RpcErrorCode.PARSE_ERROR, message: response.statusText});
                }
            }
        } else {
            if (response.status == 401) {
                return Promise.reject({code: RpcErrorCode.INVALID_REQUEST, message: "User unauthorized"});
            }
            return Promise.reject({code: RpcErrorCode.SERVER_ERROR, message: response.statusText});
        }
    } catch (e) {
        console.log(e)
        return Promise.reject({code: RpcErrorCode.TIMEOUT_ERROR, message: `Failed `});
    }
}

const headers = {'Accept': 'application/json', 'Content-Type': 'application/json'};

export async function rpc<T>(input: string, init: RequestInit): Promise<T> {
    return await fetchWithTimeout(input, {
        method: 'GET',
        headers: headers,
        ...init
    });
}
