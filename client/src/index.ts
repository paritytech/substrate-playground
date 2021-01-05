import { rpc } from './rpc';
import { Playground, Session, SessionConfiguration, User, UserConfiguration, } from './types';

export class Client {

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

    // Users

    async listUsers(init: RequestInit = this.defaultInit): Promise<Map<string, User>> {
        return rpc(this.path(Client.usersResource), init);
    }

    async createOrUpdateUser(id: string, user: UserConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.usersResource, id), {
            body: JSON.stringify(user),
            ...init
        });
    }

    async deleteUser(id: string, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.usersResource, id), {
            method: 'DELETE',
            ...init
        });
    }

    // User Session

    async getUserSession(init: RequestInit = this.defaultInit): Promise<Session> {
        return rpc(this.path(Client.sessionResource), init);
    }

    async createOrUpdateUserSession(session: SessionConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionResource), {
            method: 'PUT',
            body: JSON.stringify(session),
            ...init
        });
    }

    async deleteUserSession(init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionResource), {
            method: 'DELETE',
            ...init
        });
    }

    // Sessions

    async listSessions(init: RequestInit = this.defaultInit): Promise<Record<string, Session>> {
        return rpc(this.path(Client.sessionsResource), init);
    }

    async createOrUpdateSession(id: string, session: SessionConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionsResource, id), {
            method: 'PUT',
            body: JSON.stringify(session),
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
