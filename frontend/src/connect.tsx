import { v4 as uuidv4 } from 'uuid';

const GLOBAL_CHANNEL = "paritytech#playground-instance";
const TYPE_DISCOVERY = "discovery";
const TYPE_INSTANCE_ANNOUNCED = "instanceAnnounced";
const TYPE_INSTANCE_LEFT = "instanceLeft";

function instanceChannelId(uuid: string) {
    return `paritytech#playground-instance-${uuid}`;
}

export class Discoverer {

    #channel = new BroadcastChannel(GLOBAL_CHANNEL);
    #instances = new Map();

    constructor(onInstanceAppeared, onInstanceLeft) {
        this.#channel.onmessage = (o) => {
            const type = o.data.type;
            const uuid = o.data.uuid;
            switch (type) {
                case TYPE_DISCOVERY:
                    // Another instance of Discoverer is sending 'discovery' request; ignore
                    break;
                case TYPE_INSTANCE_ANNOUNCED: {
                    const existingInstance = this.#instances.get(uuid);
                    if (existingInstance) {
                        onInstanceAppeared(uuid, existingInstance);
                    } else {
                        const instance = new Instance(uuid, o.data.url);
                        this.#instances.set(uuid, instance);
                        onInstanceAppeared(instance);
                    }
                    break;
                }
                case TYPE_INSTANCE_LEFT: {
                    if (this.#instances.delete(uuid) && onInstanceLeft) {
                        onInstanceLeft(uuid);
                    }
                    break;
                }
                default:
                    console.error(`Unknown type ${type}`)
                    break;
            }
        };
        this.#channel.onmessageerror = (o) => {
            console.error('Received error from global channel', o);
            // TODO
        };
        // Fire this initial events to trigger a response from already running instances
        this.#channel.postMessage({type: TYPE_DISCOVERY});
    }

    get instances() {
        return this.#instances;
    }

    close() {
        this.#channel.close();
    }

}

export class Responder {

    #channel = new BroadcastChannel(GLOBAL_CHANNEL);
    #instanceChannel;
    #uuid;
    online;

    constructor(uuid: string, onInstanceMessage) {
        this.online = false;
        this.#uuid = uuid;
        this.#channel.onmessage = (o) => {
            const type = o.data.type;
            switch (type) {
                case TYPE_DISCOVERY: {
                    if (this.online) {
                        this.announce();
                    }
                    break;
                }
                default:
                    console.error(`Unknown responder type ${type}`, o);
                    break;
            }
        };
        this.#channel.onmessageerror = (o) => {
            console.error(`error ${o}`);
        };
        this.#instanceChannel = new BroadcastChannel(instanceChannelId(uuid));
        this.#instanceChannel.onmessage = onInstanceMessage;
        this.#instanceChannel.onmessageerror = console.error;
    }

    announce(): void {
        this.online = true;
        this.#channel.postMessage({type: TYPE_INSTANCE_ANNOUNCED, uuid: this.#uuid, url: document.location.href});
    }

    unannounce(): void {
        this.online = false;
        this.#channel.postMessage({type: TYPE_INSTANCE_LEFT, uuid: this.#uuid});
    }

    respond(data: Object): void {
        this.#instanceChannel.postMessage(data);
    }

    close(): void {
        this.#channel.close();
        this.#instanceChannel.close();
    }

}

export class Instance {

    uuid;
    url;
    #channel;

    constructor(uuid: string, url: string) {
        this.uuid = uuid;
        this.url = url;
        this.#channel = new BroadcastChannel(instanceChannelId(uuid));
    }

    async sendMessage(data) {
        return new Promise((resolve, reject) => {
            const uuid = uuidv4();
            const callback = (o) => {
                // TODO introduce a timeout mechanism: automatically unregister and reject after some time
                if (o.data.uuid == uuid) {
                    this.#channel.removeEventListener('message', callback);
                    const type = o.data.type;
                    switch (type) {
                        case "extension-answer":
                            resolve(o.data.data);
                            break;
                        case "extension-answer-error":
                            reject(o.data.data);
                            break;
                        default:
                            console.error(`Unknown callback type ${type}`, o)
                            break;
                    }
                }
            };
            this.#channel.addEventListener('message', callback);
            this.#channel.postMessage(Object.assign({uuid: uuid}, data));
        });
    }

    async execute(action, data = {}) {
        return this.sendMessage({type: "action", name: action, data: data});
    }

    async list() {
        return this.sendMessage({type: "list-actions"});
    }

    close() {
        this.#channel.close();
    }

    toString() {
        return `Instance ${this.uuid}`;
    }

}
