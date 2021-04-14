import { v4 as uuidv4 } from 'uuid';

export interface Params {
    timeout?: number,
}

export interface Request {
    id: string,
    type: Type,
    data: Record<string, string>,
}

export interface Response {
    id: string,
    result?: any,
    error?: {message: string},
}

export enum Type {
    LIST, EXEC
}

// A client allowing to send command to a local session
export class SessionClient {

    private readonly el: Window;
    private readonly defaultParams: Params;

    constructor(el: Window, defaultParams?: Params) {
        this.el = el;
        this.defaultParams = defaultParams || {timeout: 5000};
    }

    async send(type: Type, data: Record<string, string>, {timeout: timeout}: Params = this.defaultParams): Promise<string> {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(async () => {
                window.removeEventListener('message', callback, false);
                reject({type: 'timeout', message: `No message after ${timeout} ms`});
            }, timeout);
            const id = uuidv4();
            const callback = (event: MessageEvent<Response>) => {
                if (event.data.id == id) {
                    window.removeEventListener('message', callback, false);
                    clearTimeout(timeoutId);
                    const { result, error } = event.data;
                    if (error) {
                        reject(error);
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
