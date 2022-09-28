export interface IdentifiedResource {
    id: string
}

export interface OwnedResource {
    userId: User['id']
}
export interface Playground {
    configuration: Configuration,
    user?: User,
}

export interface Configuration {
    githubClientId: string,
}

export interface Node {
    hostname: string,
}

export interface Pool extends IdentifiedResource {
    instanceType?: string,
    nodes: Node[],
}

export enum Preferences {
    SessionDefaultDuration = "SessionDefaultDuration",
    SessionMaxDuration = "SessionMaxDuration",
    SessionPoolAffinity = "SessionPoolAffinity",
    UserDefaultRoles = "UserDefaultRoles"
}
export interface Preference extends IdentifiedResource {
    value: string,
}

export interface PreferenceConfiguration {
    value: string,
}

export interface PreferenceUpdateConfiguration {
    value?: string,
}

export interface Profile extends IdentifiedResource {
    preferences: Record<string, string>,
}

export interface ProfileConfiguration {
    preferences: Record<string, string>,
}

export interface ProfileUpdateConfiguration {
    preferences?: Record<string, string>,
}

export interface RepositoryDetails extends IdentifiedResource {
    reference: string,
}

export enum ResourceType {
    Pool = "Pool",
    Preference = "Preference",
    Profile = "Profile",
    Repository = "Repository",
    RepositoryVersion = "RepositoryVersion",
    Role = "Role",
    Session = "Session",
    SessionExecution = "SessionExecution",
    User = "User",
    Workspace = "Workspace",
}

export type ResourcePermission =
    | {type: "Create" }
    | {type: "Read" }
    | {type: "Update" }
    | {type: "Delete" }
    | {type: "Custom", name: string };

export interface Role extends IdentifiedResource {
    permissions: Record<ResourceType, Array<ResourcePermission>>,
}

export interface RoleConfiguration {
    permissions: Record<ResourceType, Array<ResourcePermission>>,
}

export interface RoleUpdateConfiguration {
    permissions?: Record<ResourceType, Array<ResourcePermission>>,
}

export interface Repository extends IdentifiedResource {
    url: string,
    currentVersion?: string,
}

export interface RepositoryConfiguration {
    url: string,
}

export interface RepositoryUpdateConfiguration {
    currentVersion?: string,
}

export interface RepositoryVersion extends IdentifiedResource {
    state: RepositoryVersionState,
}

export interface RepositoryVersionConfiguration {
}

export type RepositoryVersionState =
    | {type: "Init" }
    | {type: "Cloning", progress: number }
    | {type: "Building", progress: number, devcontainerJson: string }
    | {type: "Ready", devcontainerJson?: string }
    | {type: "Failed", message: string };

export interface NameValuePair {
    name: string,
    value: string,
}

export interface Port {
    name: string,
    protocol?: string,
    port: number,
    target?: number
}

export interface Session extends OwnedResource {
    state: SessionState;
    /* The maximum number of minutes this session can last */
    maxDuration: number,
}

export interface SessionRuntimeConfiguration {
    env: NameValuePair[],
    ports: Port[],
}

export type SessionState =
    | {type: "Deploying" }
    | {type: "Running", startTime: number/* in seconds */ , node: Node, runtimeConfiguration: SessionRuntimeConfiguration }
    | {type: "Failed", message: string, reason: string };

export interface RepositorySource {
    repositoryId: Repository['id'],
    repositoryVersionId?: RepositoryVersion['id'],
}

export interface SessionConfiguration {
    repositorySource: RepositorySource,
    /* The number of minutes this session will be able to last */
    duration?: number,
    poolAffinity?: string,
    runtimeConfiguration?: SessionRuntimeConfiguration,
}

export interface SessionUpdateConfiguration {
    /* The number of minutes this session will be able to last */
    duration?: number,
    runtimeConfiguration?: SessionRuntimeConfiguration,
}

export interface SessionExecution {
    stdout: string,
}

export interface SessionExecutionConfiguration {
    command: Array<string>,
}

export interface User extends IdentifiedResource {
    role: string,
    profile?: string,
    preferences: Record<string, string>,
}

export interface UserConfiguration {
    role: string,
    profile?: string,
    preferences: Record<string, string>,
}

export interface UserUpdateConfiguration {
    role?: string,
    profile?: string,
    preferences?: Record<string, string>,
}
