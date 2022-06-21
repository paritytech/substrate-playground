import { fetchWithTimeout, rpc } from './rpc';
import { Playground, Pool, User, UserConfiguration, UserUpdateConfiguration, Repository, RepositoryConfiguration, RepositoryUpdateConfiguration, RepositoryVersion, RepositoryVersionConfiguration, SessionConfiguration, Session, SessionUpdateConfiguration, SessionExecutionConfiguration, SessionExecution, Role, RoleConfiguration, RoleUpdateConfiguration, } from './types';

export class Client {

    static usersResource = 'users';
    static sessionsResource = 'sessions';
    static sessionExecutionResourcePath = 'execution';
    static repositoriesResource = 'repositories';
    static rolesResource = 'roles';
    static poolsResource = 'pools';

    private readonly base: string;
    private readonly defaultTimeout: number;
    private readonly defaultInit: RequestInit;

    constructor(base: string, defaultTimeout: number = 10000, defaultInit: RequestInit = {}) {
        this.base = base;
        this.defaultInit = defaultInit;
        this.defaultTimeout = defaultTimeout;
    }

    // Login
    async login(bearer: string, timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit) {
        const response = await fetchWithTimeout(`${this.path('login')}?bearer=${bearer}`, init, timeout);
        const headers = this.defaultInit.headers;
        if (headers instanceof Headers) {
            throw Error('Unsupported headers type');
        }
        this.defaultInit.headers = {
            cookie: response.headers.get('set-cookie'),
            ...headers
        };
    }

    async logout(timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit) {
        await fetchWithTimeout(this.path('logout'), init, timeout);
        const headers = this.defaultInit.headers;
        if (headers instanceof Headers) {
            throw Error('Unsupported headers type');
        }
        delete headers['cookie'];
        this.defaultInit.headers = headers;
    }

    path(...resources: string[]): string {
        return [this.base, ...resources].join("/");
    }

    loginPath(queryParams: string = window.location.search): string {
        return this.path(`login/github${queryParams}`);
    }

    async get(timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<Playground> {
        return rpc(this.path(""), init, timeout);
    }

    // Users

    async getUser(id: User['id'], timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<User | null> {
        return rpc(this.path(Client.usersResource, id), init, timeout);
    }

    async listUsers(timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<User[]> {
        return rpc(this.path(Client.usersResource), init, timeout);
    }

    async createUser(id: User['id'], conf: UserConfiguration, timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.usersResource, id), {
            method: 'PUT',
            body: JSON.stringify(conf),
            ...init
        }, timeout);
    }

    async updateUser(id: User['id'], conf: UserUpdateConfiguration, timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.usersResource, id), {
            method: 'PATCH',
            body: JSON.stringify(conf),
            ...init
        }, timeout);
    }

    async deleteUser(id: User['id'], timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.usersResource, id), {
            method: 'DELETE',
            ...init
        }, timeout);
    }

    // Sessions

    async getSession(id: Session['id'], timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<Session | null> {
        return rpc(this.path(Client.sessionsResource, id), init, timeout);
    }

    async listSessions(timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<Session[]> {
        return rpc(this.path(Client.sessionsResource), init, timeout);
    }

    async createSession(id: Session['id'], conf: SessionConfiguration, timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionsResource, id), {
            method: 'PUT',
            body: JSON.stringify(conf),
            ...init
        }, timeout);
    }

    async updateSession(id: Session['id'], conf: SessionUpdateConfiguration, timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionsResource, id), {
            method: 'PATCH',
            body: JSON.stringify(conf),
            ...init
        }, timeout);
    }

    async deleteSession(id: Session['id'], timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.sessionsResource, id), {
            method: 'DELETE',
            ...init
        }, timeout);
    }

    // Session executions

    async createSessionExecution(id: Session['id'], conf: SessionExecutionConfiguration, timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<SessionExecution> {
        return rpc(this.path(Client.sessionsResource, id, Client.sessionExecutionResourcePath), {
            method: 'PUT',
            body: JSON.stringify(conf),
            ...init
        }, timeout);
    }

    // Roles

    async getRole(id: Role['id'], timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<Role | null> {
        return rpc(this.path(Client.rolesResource, id), init, timeout);
    }

    async listRoles(timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<Role[]> {
        return rpc(this.path(Client.rolesResource), init, timeout);
    }

    async createRole(id: Role['id'], conf: RoleConfiguration, timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.rolesResource, id), {
            method: 'PUT',
            body: JSON.stringify(conf),
            ...init
        }, timeout);
    }

    async updateRole(id: Role['id'], conf: RoleUpdateConfiguration, timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.rolesResource, id), {
            method: 'PATCH',
            body: JSON.stringify(conf),
            ...init
        }, timeout);
    }

    async deleteRole(id: Role['id'], timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.rolesResource, id), {
            method: 'DELETE',
            ...init
        }, timeout);
    }

    // Repositories

    async getRepository(id: Repository['id'], timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<Repository | null> {
        return rpc(this.path(Client.repositoriesResource, id), init, timeout);
    }

    async listRepositories(timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<Repository[]> {
        return rpc(this.path(Client.repositoriesResource), init, timeout);
    }

    async createRepository(id: Repository['id'], conf: RepositoryConfiguration, timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.repositoriesResource, id), {
            method: 'PUT',
            body: JSON.stringify(conf),
            ...init
        }, timeout);
    }

    async updateRepository(id: Repository['id'], conf: RepositoryUpdateConfiguration, timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.repositoriesResource, id), {
            method: 'PATCH',
            body: JSON.stringify(conf),
            ...init
        }, timeout);
    }

    async deleteRepository(id: Repository['id'], timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.repositoriesResource, id), {
            method: 'DELETE',
            ...init
        }, timeout);
    }

    async getRepositoryVersion(repositoryId: Repository['id'], repositoryVersionId: RepositoryVersion['id'], timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<RepositoryVersion | null> {
        return rpc(this.path(Client.repositoriesResource, repositoryId, 'versions', repositoryVersionId), init, timeout);
    }

    async listRepositoryVersions(repositoryId: Repository['id'], timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<RepositoryVersion[]> {
        return rpc(this.path(Client.repositoriesResource, repositoryId, 'versions'), init, timeout);
    }

    async createRepositoryVersion(repositoryId: Repository['id'], repositoryVersionId: RepositoryVersion['id'], timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.repositoriesResource, repositoryId, 'versions', repositoryVersionId), {
            method: 'PUT',
            ...init
        }, timeout);
    }

    async deleteRepositoryVersion(repositoryId: Repository['id'], repositoryVersionId: RepositoryVersion['id'], timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<void> {
        return rpc(this.path(Client.repositoriesResource, repositoryId, 'versions', repositoryVersionId), {
            method: 'DELETE',
            ...init
        }, timeout);
    }

    // Pools

    async getPool(id: Pool['id'], timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<Pool | null> {
        return rpc(this.path(Client.poolsResource, id), init, timeout);
    }

    async listPools(timeout: number = this.defaultTimeout, init: RequestInit = this.defaultInit): Promise<Pool[]> {
        return rpc(this.path(Client.poolsResource), init, timeout);
    }

}

export * from "./auth";
export * from "./rpc";
export * from "./session";
export * from "./types";
export * from "./utils";
