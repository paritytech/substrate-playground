import { fetchWithTimeout, rpc } from './rpc';
import { Playground, Pool, Workspace, WorkspaceConfiguration, WorkspaceUpdateConfiguration, Template, User, UserConfiguration, UserUpdateConfiguration, } from './types';

export class Client {

    static userResource = 'user';
    static usersResource = 'users';
    static workspaceResource = 'workspace';
    static workspacesResource = 'workspaces';
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

    // Current Workspace

    async getCurrentWorkspace(init: RequestInit = this.defaultInit): Promise<Workspace | null> {
        return rpc(this.path(Client.workspaceResource), init, this.timeout);
    }

    async createCurrentWorkspace(conf: WorkspaceConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.workspaceResource), {
            method: 'PUT',
            body: JSON.stringify(conf),
            ...init
        }, this.timeout);
    }

    async updateCurrentWorkspace(conf: WorkspaceUpdateConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.workspaceResource), {
            method: 'PATCH',
            body: JSON.stringify(conf),
            ...init
        }, this.timeout);
    }

    async deleteCurrentWorkspace(init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.workspaceResource), {
            method: 'DELETE',
            ...init
        }, this.timeout);
    }

    // Workspaces

    async getWorkspace(id: string, init: RequestInit = this.defaultInit): Promise<Workspace | null> {
        return rpc(this.path(Client.workspacesResource, id), init, this.timeout);
    }

    async listWorkspaces(init: RequestInit = this.defaultInit): Promise<Record<string, Workspace>> {
        return rpc(this.path(Client.workspacesResource), init, this.timeout);
    }

    async createWorkspace(id: string, conf: WorkspaceConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.workspacesResource, id), {
            method: 'PUT',
            body: JSON.stringify(conf),
            ...init
        }, this.timeout);
    }

    async updateWorkspace(id: string, conf: WorkspaceUpdateConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.workspacesResource, id), {
            method: 'PATCH',
            body: JSON.stringify(conf),
            ...init
        }, this.timeout);
    }

    async deleteWorkspace(id: string, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.workspacesResource, id), {
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
export * from "./workspace";
export * from "./types";
export * from "./utils";
