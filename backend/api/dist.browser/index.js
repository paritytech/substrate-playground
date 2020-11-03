var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import 'cross-fetch/polyfill';
function timeout(promise, ms) {
    return new Promise(function (resolve, reject) {
        setTimeout(function () {
            reject(new Error("timeout"));
        }, ms);
        promise.then(resolve, reject);
    });
}
function fetchWithTimeout(url, opts, ms = 30000) {
    return __awaiter(this, void 0, void 0, function* () {
        return timeout(fetch(url, opts), ms).catch((error) => error);
    });
}
const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
function fromResponse(response) {
    return __awaiter(this, void 0, void 0, function* () {
        if (response instanceof Response) {
            try {
                if (response.ok) {
                    // Here the JSON is already in JSON-RPC format so return as-is
                    return yield response.json();
                }
                else {
                    if (response.status == 401) {
                        return { error: "User unauthorized" };
                    }
                    return { error: response.statusText };
                }
            }
            catch (e) {
                console.error(e);
                return { error: response.statusText };
            }
        }
        else {
            return { error: response.message };
        }
    });
}
function playgroundBaseURL(env) {
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
const DEFAULT_OPTS = { credentials: "include" };
export class Client {
    constructor({ base, env, defaultOpts = DEFAULT_OPTS }) {
        if (!base && !env) {
            throw new Error('At least one of `base` or `env` must be set');
        }
        if (base && env) {
            throw new Error('Both `base` or `env` cannot be set');
        }
        this.base = base || playgroundBaseURL(env);
        this.defaultOpts = defaultOpts;
    }
    getDetails(opts = this.defaultOpts) {
        return __awaiter(this, void 0, void 0, function* () {
            return fromResponse(yield fetchWithTimeout(`${this.base}/`, Object.assign({ method: 'GET', headers: headers }, opts)));
        });
    }
    deployInstance(template, opts = this.defaultOpts) {
        return __awaiter(this, void 0, void 0, function* () {
            return fromResponse(yield fetchWithTimeout(`${this.base}/?template=${template}`, Object.assign({ method: 'POST', headers: headers }, opts)));
        });
    }
    stopInstance(opts = this.defaultOpts) {
        return __awaiter(this, void 0, void 0, function* () {
            return fromResponse(yield fetchWithTimeout(`${this.base}/`, Object.assign({ method: 'DELETE', headers: headers }, opts)));
        });
    }
    logout(opts = this.defaultOpts) {
        return __awaiter(this, void 0, void 0, function* () {
            return fromResponse(yield fetchWithTimeout(`${this.base}/logout`, Object.assign({ method: 'GET', headers: headers }, opts)));
        });
    }
}
