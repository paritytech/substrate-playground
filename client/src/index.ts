import { fetchWithTimeout, rpc } from './rpc';
import { Playground, Pool, Workspace, WorkspaceConfiguration, WorkspaceUpdateConfiguration, User, UserConfiguration, UserUpdateConfiguration, Repository, RepositoryConfiguration, RepositoryUpdateConfiguration, RepositoryVersion, RepositoryVersionConfiguration, SessionConfiguration, Session, SessionUpdateConfiguration, Template, } from './types';

export class Client {

    static userResource = 'user';
    static usersResource = 'users';
    static workspaceResource = 'workspace';
    static workspacesResource = 'workspaces';
    static sessionResource = 'session';
    static sessionsResource = 'sessions';
    static repositoriesResource = 'repositories';
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

    async getUser(id: User['id'], init: RequestInit = this.defaultInit): Promise<User | null> {
        return rpc(this.path(Client.usersResource, id), init, this.timeout);
    }

    async listUsers(init: RequestInit = this.defaultInit): Promise<User[]> {
        return rpc(this.path(Client.usersResource), init, this.timeout);
    }

    async createUser(id: User['id'], conf: UserConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.usersResource, id), {
            method: 'PUT',
            body: JSON.stringify(conf),
            ...init
        }, this.timeout);
    }

    async updateUser(id: User['id'], conf: UserUpdateConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.usersResource, id), {
            method: 'PATCH',
            body: JSON.stringify(conf),
            ...init
        }, this.timeout);
    }

    async deleteUser(id: User['id'], init: RequestInit = this.defaultInit): Promise<void> {
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

    async getWorkspace(id: Workspace['id'], init: RequestInit = this.defaultInit): Promise<Workspace | null> {
        return rpc(this.path(Client.workspacesResource, id), init, this.timeout);
    }

    async listWorkspaces(init: RequestInit = this.defaultInit): Promise<Workspace[]> {
        return rpc(this.path(Client.workspacesResource), init, this.timeout);
    }

    async createWorkspace(id: Workspace['id'], conf: WorkspaceConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.workspacesResource, id), {
            method: 'PUT',
            body: JSON.stringify(conf),
            ...init
        }, this.timeout);
    }

    async updateWorkspace(id: Workspace['id'], conf: WorkspaceUpdateConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.workspacesResource, id), {
            method: 'PATCH',
            body: JSON.stringify(conf),
            ...init
        }, this.timeout);
    }

    async deleteWorkspace(id: Workspace['id'], init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.workspacesResource, id), {
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

    // Repositories

    async getRepository(id: Repository['id'], init: RequestInit = this.defaultInit): Promise<Repository | null> {
        return rpc(this.path(Client.repositoriesResource, id), init, this.timeout);
    }

    async listRepositories(init: RequestInit = this.defaultInit): Promise<Repository[]> {
        return rpc(this.path(Client.repositoriesResource), init, this.timeout);
    }

    async createRepository(id: Repository['id'], conf: RepositoryConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.repositoriesResource, id), {
            method: 'PUT',
            body: JSON.stringify(conf),
            ...init
        }, this.timeout);
    }

    async updateRepository(id: Repository['id'], conf: RepositoryUpdateConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.repositoriesResource, id), {
            method: 'PATCH',
            body: JSON.stringify(conf),
            ...init
        }, this.timeout);
    }

    async deleteRepository(id: Repository['id'], init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.repositoriesResource, id), {
            method: 'DELETE',
            ...init
        }, this.timeout);
    }

    async getRepositoryVersion(id: Repository['id'], version: string, init: RequestInit = this.defaultInit): Promise<RepositoryVersion | null> {
        return rpc(this.path(Client.repositoriesResource, id, 'versions', version), init, this.timeout);
    }

    async listRepositoryVersions(id: Repository['id'], init: RequestInit = this.defaultInit): Promise<RepositoryVersion[]> {
        return rpc(this.path(Client.repositoriesResource, id, 'versions'), init, this.timeout);
    }

    async createRepositoryVersion(id: Repository['id'], version: string, conf: RepositoryVersionConfiguration, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.repositoriesResource, id, 'versions', version), {
            method: 'PUT',
            body: JSON.stringify(conf),
            ...init
        }, this.timeout);
    }

    async deleteRepositoryVersion(id: Repository['id'], version: string, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.repositoriesResource, id, 'versions', version), {
            method: 'DELETE',
            ...init
        }, this.timeout);
    }

    // Templates

    async listTemplates(init: RequestInit = this.defaultInit): Promise<Record<string, Template>> {
        return rpc(this.path(Client.templatesResource), init, this.timeout);
    }

    // Pools

    async getPool(id: Pool['id'], init: RequestInit = this.defaultInit): Promise<Pool | null> {
        return rpc(this.path(Client.poolsResource, id), init, this.timeout);
    }

    async listPools(init: RequestInit = this.defaultInit): Promise<Pool[]> {
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
