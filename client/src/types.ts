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

export interface RepositorySource {
    repositoryId: Repository['id'],
    repositoryVersionId: RepositoryVersion['id'],
}

export interface SessionConfiguration {
    repositorySource: RepositorySource,
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
    role: string,
    preferences: Record<string, string>,
}

export interface UserConfiguration {
    role: string,
    preferences: Record<string, string>,
}

export interface UserUpdateConfiguration {
    role: string,
    preferences: Record<string, string>,
}

export enum ResourceType {
    Pool = "Pool",
    Repository = "Repository",
    RepositoryVersion = "RepositoryVersion",
    Role = "Role",
    Session = "Session",
    SessionExecution = "SessionExecution",
    User = "User",
    Workspace = "Workspace",
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
