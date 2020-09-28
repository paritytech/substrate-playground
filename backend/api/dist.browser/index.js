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
function fetchWithTimeout(url, opts = { cache: "no-store" }, ms = 30000) {
    return __awaiter(this, void 0, void 0, function* () {
        return timeout(fetch(url, opts), ms).catch(error => error);
    });
}
const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
function fromResponse(response) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Here the JSON is already in JSON-RPC format so return as-is
            return yield response.json();
        }
        catch (e) {
            console.error(e);
            return { error: (!response.ok && response.statusText) || (response.status == 401 && "User unauthorized") || "Internal error: failed to parse returned JSON" };
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
export class Client {
    constructor({ base, env }) {
        if (!base && !env) {
            throw new Error('At least one of `base` or `env` must be set');
        }
        if (base && env) {
            throw new Error('Both `base` or `env` cannot be set');
        }
        this.base = base || playgroundBaseURL(env);
    }
    getDetails() {
        return __awaiter(this, void 0, void 0, function* () {
            return fromResponse(yield fetchWithTimeout(this.base, {
                method: 'GET',
                headers: headers
            }));
        });
    }
    getInstanceDetails(instanceUUID) {
        return __awaiter(this, void 0, void 0, function* () {
            return fromResponse(yield fetchWithTimeout(`${this.base}/${instanceUUID}`, {
                method: 'GET',
                headers: headers
            }));
        });
    }
    deployInstance(template) {
        return __awaiter(this, void 0, void 0, function* () {
            return fromResponse(yield fetchWithTimeout(`${this.base}/?template=${template}`, {
                method: 'POST',
                headers: headers
            }));
        });
    }
    stopInstance(instanceUUID) {
        return __awaiter(this, void 0, void 0, function* () {
            return fromResponse(yield fetchWithTimeout(`${this.base}/${instanceUUID}`, {
                method: 'DELETE',
                headers: headers
            }));
        });
    }
    logout() {
        return __awaiter(this, void 0, void 0, function* () {
            return fromResponse(yield fetchWithTimeout(`${this.base}/logout`, {
                method: 'GET',
                headers: headers
            }));
        });
    }
}
