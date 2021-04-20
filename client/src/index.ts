import { fetchWithTimeout, rpc } from './rpc';
import { Playground, Pool, Session, SessionConfiguration, SessionUpdateConfiguration, Template, User, UserConfiguration, UserUpdateConfiguration, } from './types';

export class Client {

    static userResource = 'user';
    static usersResource = 'users';
    static sessionResource = 'session';
    static sessionsResource = 'sessions';
    static templatesResource = 'templates';
    static poolsResource = 'pools';

    private readonly base: string;
    private readonly timeout: number;
    private readonly defaultInit: RequestInit;

    constructor(base: string, timeout: number = 10000, defaultInit?: RequestInit) {
        this.base = base;
        this.defaultInit = defaultInit;
        this.timeout = timeout;
    }

    path(...resources: string[]): string {
        return [this.base, ...resources].join("/");
    }

    loginPath(queryParams: string = window.location.search): string {
        return this.path(`login/github${queryParams}`);
    }

    async get(init: RequestInit = this.defaultInit): Promise<Playground> {
        return rpc(this.path(""), init, this.timeout);
    }

    // Current User

    async getCurrentUser(init: RequestInit = this.defaultInit): Promise<User> {
        return rpc(this.path(Client.userResource), {
            ...init
        }, this.timeout);
    }

    // Users

    async getUser(id: string, init: RequestInit = this.defaultInit): Promise<User | null> {
        return rpc(this.path(Client.usersResource, id), init, this.timeout);
    }

    async listUsers(init: RequestInit = this.defaultInit): Promise<Record<string, User>> {
        return rpc(this.path(Client.usersResource), init, this.timeout);
    }

    async createUser(id: string, conf: UserConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.usersResource, id), {
            method: 'PUT',
            body: JSON.stringify(conf),
            ...init
        }, this.timeout);
    }

    async updateUser(id: string, conf: UserUpdateConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.usersResource, id), {
            method: 'PATCH',
            body: JSON.stringify(conf),
            ...init
        }, this.timeout);
    }

    async deleteUser(id: string, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.usersResource, id), {
            method: 'DELETE',
            ...init
        }, this.timeout);
    }

    // Current Session

    async getCurrentSession(init: RequestInit = this.defaultInit): Promise<Session | null> {
        return rpc(this.path(Client.sessionResource), init, this.timeout);
    }

    async createCurrentSession(conf: SessionConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionResource), {
            method: 'PUT',
            body: JSON.stringify(conf),
            ...init
        }, this.timeout);
    }

    async updateCurrentSession(conf: SessionUpdateConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionResource), {
            method: 'PATCH',
            body: JSON.stringify(conf),
            ...init
        }, this.timeout);
    }

    async deleteCurrentSession(init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionResource), {
            method: 'DELETE',
            ...init
        }, this.timeout);
    }

    // Sessions

    async getSession(id: string, init: RequestInit = this.defaultInit): Promise<Session | null> {
        return rpc(this.path(Client.sessionsResource, id), init, this.timeout);
    }

    async listSessions(init: RequestInit = this.defaultInit): Promise<Record<string, Session>> {
        return rpc(this.path(Client.sessionsResource), init, this.timeout);
    }

    async createSession(id: string, conf: SessionConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionsResource, id), {
            method: 'PUT',
            body: JSON.stringify(conf),
            ...init
        }, this.timeout);
    }

    async updateSession(id: string, conf: SessionUpdateConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionsResource, id), {
            method: 'PATCH',
            body: JSON.stringify(conf),
            ...init
        }, this.timeout);
    }

    async deleteSession(id: string, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionsResource, id), {
            method: 'DELETE',
            ...init
        }, this.timeout);
    }

    // Templates

    async listTemplates(init: RequestInit = this.defaultInit): Promise<Record<string, Template>> {
        return rpc(this.path(Client.templatesResource), init, this.timeout);
    }

    // Pools

    async getPool(id: string, init: RequestInit = this.defaultInit): Promise<Pool | null> {
        return rpc(this.path(Client.poolsResource, id), init, this.timeout);
    }

    async listPools(init: RequestInit = this.defaultInit): Promise<Record<string, Pool>> {
        return rpc(this.path(Client.poolsResource), init, this.timeout);
    }

    // Login

    async login(bearer: string, init: RequestInit = this.defaultInit): Promise<Response> {
        return fetchWithTimeout(`${this.path('login')}?bearer=${bearer}`, {
            ...init
        }, this.timeout);
    }

    async logout(init: RequestInit = this.defaultInit): Promise<Response> {
        return fetchWithTimeout(this.path('logout'), init, this.timeout);
    }

}

export * from "./login";
export * from "./rpc";
export * from "./types";
export * from "./utils";
