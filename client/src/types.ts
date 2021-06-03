export interface IdentifiedResource {
    id: string
}

export interface OwnedResource {
    userId: string
}
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
    baseImage: string,
    /* The default number of minutes workspace can last */
    duration: number,
    maxDuration: number,
    poolAffinity: string,
    maxWorkspacesPerPod: string,
}

export interface Workspace extends IdentifiedResource, OwnedResource {
    repositoryDetails: RepositoryDetails,
    state: WorkspaceState,
    maxDuration: number,
}

export interface RepositoryDetails extends IdentifiedResource {
    reference: string,
}

export type WorkspaceState =
    | {tag: "Deploying" }
    | {tag: "Running", startTime: number, node: Node, runtime: RepositoryRuntimeConfiguration }
    | {tag: "Paused", }
    | {tag: "Failed", message: string, reason: string };

export interface WorkspaceConfiguration {
    repositoryDetails: RepositoryDetails,
    /* The number of minutes this workspace will be able to last */
    duration?: number,
    poolAffinity?: string,
}

export interface WorkspaceUpdateConfiguration {
    /* The number of minutes this workspace will be able to last */
    duration?: number,
}

export interface User extends IdentifiedResource {
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

export interface LoggedUser extends IdentifiedResource {
    admin: boolean,
    organizations: string[],
    poolAffinity: string,
    canCustomizeDuration: boolean,
    canCustomizePoolAffinity: boolean,
}

export interface Repository extends IdentifiedResource {
    tags?: Record<string, string>,
    url: string,
}

export interface RepositoryConfiguration {
    tags?: Record<string, string>,
    url: string,
}

export interface RepositoryUpdateConfiguration {
    tags?: Record<string, string>,
}

export interface RepositoryVersion {
    reference: string,
    imageSource?: PrebuildSource,
    state: RepositoryVersionState,
}

export type PrebuildSource =
    | {tag: "DockerFile", location: string }
    | {tag: "Image", value: string };


export interface RepositoryVersionConfiguration {
    reference: string,
}

export type RepositoryVersionState =
    | {tag: "Cloning", progress: number }
    | {tag: "Building", progress: number, runtime: RepositoryRuntimeConfiguration }
    | {tag: "Ready", runtime: RepositoryRuntimeConfiguration };

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
