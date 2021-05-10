import { v4 as uuidv4 } from 'uuid';

export interface Params {
    timeout?: number,
}

export interface Request {
    id: string,
    type: Type,
    data: Record<string, unknown>,
}

export interface Response<T> {
    id: string,
    result?: T,
    error?: string,
}

export enum Type {
    LIST, EXEC
}

// A client allowing to send command to a local workspace
export class WorkspaceClient {

    private readonly el: Window;
    private readonly defaultParams: Params;

    constructor(el: Window, defaultParams?: Params) {
        this.el = el;
        this.defaultParams = defaultParams || {timeout: 5000};
    }

    async exec<T>(command: string, ...parameters: Array<unknown>): Promise<T> {
        return this.send(Type.EXEC, {command: command, parameters: parameters});
    }

    async list(): Promise<Record<string, unknown>> {
        return this.send(Type.LIST);
    }

    async send<T>(type: Type, data: Record<string, unknown> = {}, {timeout: timeout}: Params = this.defaultParams): Promise<T> {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(async () => {
                window.removeEventListener('message', callback, false);
                reject({type: 'timeout', message: `No message after ${timeout} ms`});
            }, timeout);
            const id = uuidv4();
            const callback = (event: MessageEvent<Response<T>>) => {
                if (event.data.id == id) {
                    window.removeEventListener('message', callback, false);
                    clearTimeout(timeoutId);
                    const { result, error } = event.data;
                    if (error) {
                        reject({type: 'failure', message: error});
                    } else {
                        resolve(result);
                    }
                }
            };
            window.addEventListener('message', callback, false);

            const request: Request = {id: id, type: type, data: data};
            this.el.postMessage(request, "*");
        });
    }

}
