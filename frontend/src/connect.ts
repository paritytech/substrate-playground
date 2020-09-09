import { v4 as uuidv4 } from 'uuid';
import { BroadcastChannel } from 'broadcast-channel';

const GLOBAL_CHANNEL = "paritytech#playground-instance";
const TYPE_DISCOVERY = "discovery";
const TYPE_INSTANCE_ANNOUNCED = "instanceAnnounced";
const TYPE_INSTANCE_LEFT = "instanceLeft";

function instanceChannelId(uuid: string) {
    return `paritytech#playground-instance-${uuid}`;
}

export class Discoverer {

    #channel = new BroadcastChannel(GLOBAL_CHANNEL);
    #instances = new Map<string, Instance>();

    constructor(onInstanceAppeared: (Instance) => void, onInstanceLeft?: (string) => void) {
        this.#channel.onmessage = (oo) => {
            const o = JSON.parse(oo);
            const type = o.type;
            const uuid = o.uuid;
            switch (type) {
                case TYPE_DISCOVERY:
                    // Another instance of Discoverer is sending 'discovery' request; ignore
                    break;
                case TYPE_INSTANCE_ANNOUNCED: {
                    const existingInstance = this.#instances.get(uuid);
                    if (existingInstance) {
                        onInstanceAppeared(existingInstance);
                    } else {
                        const instance = new Instance(uuid);
                        this.#instances.set(uuid, instance);
                        onInstanceAppeared(instance);
                    }
                    break;
                }
                case TYPE_INSTANCE_LEFT: {
                    if (this.#instances.delete(uuid)) {
                        onInstanceLeft?.(uuid);
                    }
                    break;
                }
                default:
                    console.error(`Unknown type ${type}`)
                    break;
            }
        };
        // Fire this initial events to trigger a response from already running instances
        this.#channel.postMessage(JSON.stringify({type: TYPE_DISCOVERY}));
    }

    get instances(): Map<string, Instance> {
        return this.#instances;
    }

    close(): void {
        this.#channel.close();
    }

}

/**
 * Executed theia instance side.
 */
export class Responder {

    #channel = new BroadcastChannel(GLOBAL_CHANNEL);
    #instanceChannel;
    #uuid;
    online;

    constructor(uuid: string, onInstanceMessage: (object) => void) {
        this.online = false;
        this.#uuid = uuid;
        this.#channel.onmessage = (oo) => {
            const o = JSON.parse(oo);
            const type = o.type;
            switch (type) {
                case TYPE_INSTANCE_ANNOUNCED:
                    // Another instance is anouncing itself; ignore
                    break;
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
        this.#instanceChannel = new BroadcastChannel(instanceChannelId(uuid));
        this.#instanceChannel.onmessage = (s: string) => onInstanceMessage(JSON.parse(s));
    }

    setStatus(online: boolean): void {
        this.online = online;
    }

    announce(): void {
        this.#channel.postMessage(JSON.stringify({type: TYPE_INSTANCE_ANNOUNCED, uuid: this.#uuid}));
    }

    unannounce(): void {
        this.#channel.postMessage(JSON.stringify({type: TYPE_INSTANCE_LEFT, uuid: this.#uuid}));
    }

    respond(data: object): void {
        this.#instanceChannel.postMessage(JSON.stringify(data));
    }

    close(): void {
        this.#channel.close();
        this.#instanceChannel.close();
    }

}

/**
 * Used to communicate with a distant theia instance from its UUID
 */
export class Instance {

    uuid;
    #channel;

    constructor(uuid: string) {
        this.uuid = uuid;
        this.#channel = new BroadcastChannel(instanceChannelId(uuid));
    }

    async sendMessage(data: object): Promise<object> {
        return new Promise((resolve, reject) => {
            const messageUuid = uuidv4();
            const callback = (oo) => {
                const o = JSON.parse(oo);
                // TODO introduce a timeout mechanism: automatically unregister and reject after some time
                if (o.uuid == messageUuid) {
                    this.#channel.removeEventListener('message', callback);
                    const type = o.type;
                    switch (type) {
                        case "extension-answer":
                            resolve(o.data);
                            break;
                        case "extension-answer-offline":
                            reject({message: "Instance is offline"});
                            break;
                        case "extension-answer-error":
                            reject(o.data);
                            break;
                        default:
                            console.error(`Unknown callback type ${type}`, o)
                            break;
                    }
                }
            };
            this.#channel.addEventListener('message', callback);
            this.#channel.postMessage(JSON.stringify(Object.assign({uuid: messageUuid}, data)));
        });
    }

    async execute(action: string, data = {}): Promise<object> {
        return this.sendMessage({type: "action", name: action, data: data});
    }

    async list(): Promise<object> {
        return this.sendMessage({type: "list-actions"});
    }

    close(): void {
        this.#channel.close();
    }

    toString(): string {
        return `Instance ${this.uuid}`;
    }

}
