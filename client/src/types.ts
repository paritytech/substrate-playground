export interface Playground {
    env: Environment,
    configuration: Configuration,
    user?: LoggedUser,
}

export interface Environment {
    secured: boolean,
    host: string,
    namespace: string,
}

export interface Configuration {
    githubClientId: string,
    workspace: WorkspaceDefaults,
}

export interface WorkspaceDefaults {
    /* The default number of minutes workspace can last */
    duration: number,
    maxDuration: number,
    poolAffinity: string,
    maxWorkspacesPerPod: string,
}

export interface IdentifiedResource {
    id: string
}

export interface OwnedResource {
    userId: string
}

export interface LoggedUser extends IdentifiedResource {
    admin: boolean,
    organizations: string[],
    poolAffinity: string,
    canCustomizeDuration: boolean,
    canCustomizePoolAffinity: boolean,
}

export interface User {
    admin: boolean,
    poolAffinity: string,
    canCustomizeDuration: boolean,
    canCustomizePoolAffinity: boolean,
}

export interface UserConfiguration {
    admin: boolean,
    poolAffinity?: string,
    canCustomizeDuration: boolean,
    canCustomizePoolAffinity: boolean,
}

export interface UserUpdateConfiguration {
    admin: boolean,
    poolAffinity?: string,
    canCustomizeDuration: boolean,
    canCustomizePoolAffinity: boolean,
}

export interface Workspace extends IdentifiedResource, OwnedResource {
    repositoryVersion: RepositoryVersion,
    state: WorkspaceState,
    maxDuration: number,
}

export interface WorkspaceStateRunning {
    startTime: number,
    node: Node,
}
export interface WorkspaceStateFailed {
    message: string,
    reason: string,
}

export type WorkspaceState = 'WorkspaceStateDeploying' | WorkspaceStateRunning | 'WorkspaceStatePaused' | WorkspaceStateFailed | 'WorkspaceStateUnknown';

export interface Pool {
    name: string,
    instanceType?: string,
    nodes: Node[],
}

export interface Node {
    hostname: string,
}

export interface WorkspaceConfiguration {
    repositoryId: string,
    repositoryReference: string,
    /* The number of minutes this workspace will be able to last */
    duration?: number,
    poolAffinity?: string,
}

export interface WorkspaceUpdateConfiguration {
    /* The number of minutes this workspace will be able to last */
    duration?: number,
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

export interface RuntimeConfiguration {
    env?: NameValuePair[],
    ports?: Port[],
}

export interface Repository {
    id?: string,
    tags?: Record<string, string>,
    url: string,
    versions: RepositoryVersion[],
}

export interface RepositoryConfiguration extends IdentifiedResource {
    tags?: Record<string, string>,
    url: string,
}

export interface RepositoryVersion {
    reference: string,
    state: RepositoryVersionState,
    runtime: Runtime,
}

export interface BUILT {
    progress: number,
}

export type RepositoryVersionState = 'BUILDING' | BUILT;

export interface Runtime {
    containerConfiguration: ContainerConfiguration,
    env?: NameValuePair[],
    ports?: Port[],
}

export type ContainerConfiguration = IMAGE | DOCKERFILE;

export interface IMAGE {
    value: string,
}

export interface DOCKERFILE {
    value: string,
}
