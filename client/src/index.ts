import { rpc } from './rpc';
import { Playground, Session, SessionConfiguration, SessionUpdateConfiguration, User, UserConfiguration, UserUpdateConfiguration, } from './types';

export class Client {

    static userResource = 'user';
    static usersResource = 'users';
    static sessionResource = 'session';
    static sessionsResource = 'sessions';

    private readonly base: string;
    private readonly defaultInit: RequestInit;

    constructor(base: string, defaultInit?: RequestInit) {
        this.base = base;
        this.defaultInit = defaultInit;
    }

    path(...resources: string[]) {
        return [this.base, ...resources].join("/");
    }

    async get(init: RequestInit = this.defaultInit): Promise<Playground> {
        return rpc(this.path(), init);
    }

    // Current User

    async getCurrentUser(init: RequestInit = this.defaultInit): Promise<User> {
        return rpc(this.path(Client.userResource), {
            ...init
        });
    }

    // Users

    async getUser(id: string, init: RequestInit = this.defaultInit): Promise<User | null> {
        return rpc(this.path(Client.usersResource, id), init);
    }

    async listUsers(init: RequestInit = this.defaultInit): Promise<Record<string, User>> {
        return rpc(this.path(Client.usersResource), init);
    }

    async createUser(id: string, conf: UserConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.usersResource, id), {
            method: 'PUT',
            body: JSON.stringify(conf),
            ...init
        });
    }

    async updateUser(id: string, conf: UserUpdateConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.usersResource, id), {
            method: 'PATCH',
            body: JSON.stringify(conf),
            ...init
        });
    }

    async deleteUser(id: string, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.usersResource, id), {
            method: 'DELETE',
            ...init
        });
    }

    // Current Session

    async getCurrentSession(init: RequestInit = this.defaultInit): Promise<Session | null> {
        return rpc(this.path(Client.sessionResource), init);
    }

    async createCurrentSession(conf: SessionConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionResource), {
            method: 'PUT',
            body: JSON.stringify(conf),
            ...init
        });
    }

    async updateCurrentSession(conf: SessionUpdateConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionResource), {
            method: 'PATCH',
            body: JSON.stringify(conf),
            ...init
        });
    }

    async deleteCurrentSession(init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionResource), {
            method: 'DELETE',
            ...init
        });
    }

    // Sessions

    async listSessions(init: RequestInit = this.defaultInit): Promise<Record<string, Session>> {
        return rpc(this.path(Client.sessionsResource), init);
    }

    async createSession(id: string, conf: SessionConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionsResource, id), {
            method: 'PUT',
            body: JSON.stringify(conf),
            ...init
        });
    }

    async updateSession(id: string, conf: SessionUpdateConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionsResource, id), {
            method: 'PATCH',
            body: JSON.stringify(conf),
            ...init
        });
    }

    async deleteSession(id: string, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionsResource, id), {
            method: 'DELETE',
            ...init
        });
    }

    // Login

    async login(token: string, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path('login'), {
            body: token,
            ...init
        });
    }

    async logout(init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path('logout'), init);
    }

}

export * from "./types";
export * from "./utils";
