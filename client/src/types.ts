export interface IdentifiedResource {
    id: string
}

export interface OwnedResource {
    userId: string
}
export interface Playground {
    configuration: Configuration,
    user?: string,
}

export interface Configuration {
    githubClientId: string,
    session: SessionDefaults,
}

export interface SessionDefaults {
    /* The default number of minutes sessions can last */
    duration: number,
    maxDuration: number,
    poolAffinity: string,
    maxSessionsPerPod: string,
}

export interface Session extends IdentifiedResource, OwnedResource {
    state: SessionState;
    /* The maximum number of minutes this session can last */
    maxDuration: number,
}

export type SessionState =
    | {tag: "Deploying" }
    | {tag: "Running", startTime: number, node: Node }
    | {tag: "Failed", message: string, reason: string };

export interface RepositoryIdentifier {
    repositoryId: Repository['id'],
    repositoryVersionId: RepositoryVersion['id'],
}

export interface SessionConfiguration {
    repositoryIdentifier: RepositoryIdentifier,
    /* The number of minutes this session will be able to last */
    duration?: number,
    poolAffinity?: string,
}

export interface SessionUpdateConfiguration {
    /* The number of minutes this session will be able to last */
    duration?: number,
}

export interface SessionExecution {
    stdout: string,
}

export interface SessionExecutionConfiguration {
    command: Array<string>,
}

export interface RepositoryDetails extends IdentifiedResource {
    reference: string,
}

export interface User extends IdentifiedResource {
    roles: Array<string>,
    preferences: Record<string, string>,
}

export interface UserConfiguration {
    roles: Array<string>,
    preferences: Record<string, string>,
}

export interface UserUpdateConfiguration {
    roles: Array<string>,
    preferences: Record<string, string>,
}

export enum ResourceType {
    Pool,
    Repository,
    RepositoryVersion,
    Role,
    Session,
    SessionExecution,
    Template,
    User,
    Workspace,
}

export type ResourcePermission =
    | {tag: "Create" }
    | {tag: "Read" }
    | {tag: "Update" }
    | {tag: "Delete" }
    | {tag: "Custom", name: string };

export interface Role extends IdentifiedResource {
    permissions: Record<ResourceType, Array<ResourcePermission>>,
}

export interface RoleConfiguration {
    permissions: Record<ResourceType, Array<ResourcePermission>>,
}

export interface RoleUpdateConfiguration {
    permissions: Record<ResourceType, Array<ResourcePermission>>,
}

export interface Repository extends IdentifiedResource {
    url: string,
}

export interface RepositoryConfiguration {
    url: string,
}

export interface RepositoryUpdateConfiguration {
    url: string,
}

export interface RepositoryVersion extends IdentifiedResource {
    state: RepositoryVersionState,
}

export interface RepositoryVersionConfiguration {
}

export type RepositoryVersionState =
    | {tag: "Cloning", progress: number }
    | {tag: "Building", progress: number, devcontainerJson: string }
    | {tag: "Ready", devcontainerJson: string };

export interface RepositoryRuntimeConfiguration {
    baseImage?: string,
    env?: NameValuePair[],
    ports?: Port[],
}

export interface Template extends IdentifiedResource {
    name: string,
    image: string,
    description: string,
    tags?: Record<string, string>,
    runtime?: RepositoryRuntimeConfiguration,
}

export interface NameValuePair {
    name: string,
    value: string,
}

export interface Port {
    name: string,
    protocol?: string,
    path: string,
    port: number,
    target?: number
}

export interface Pool extends IdentifiedResource {
    instanceType?: string,
    nodes: Node[],
}

export interface Node {
    hostname: string,
}
