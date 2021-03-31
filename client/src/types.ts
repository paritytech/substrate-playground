export interface Playground {
    env: Environment,
    configuration: Configuration,
    templates: Record<string, Template>,
    user?: LoggedUser,
}

export interface Environment {
    secured: boolean,
    host: string,
    namespace: string,
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

export interface LoggedUser {
    id: string,
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

export interface Session {
    userId: string,
    url: string,
    template: Template,
    pod: Pod,
    /* The number of minutes this session can last */
    duration: number,
    maxDuration: number,
    node: string,
}

export interface Pool {
    name: string,
    instanceType?: string,
    nodes: Node[],
}

export interface Node {
    hostname: string,
}

export interface SessionConfiguration {
    template: string,
    /* The number of minutes this session will be able to last */
    duration?: number,
    poolAffinity?: string,
}

export interface SessionUpdateConfiguration {
    /* The number of minutes this session will be able to last */
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

export interface Template {
    name: string,
    image: string,
    description: string,
    tags?: Record<string, string>,
    runtime?: RuntimeConfiguration,
}

export type Phase = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown';
export interface Pod {
    phase: Phase,
    reason: string,
    message: string,
    /* The number of seconds since this session started */
    startTime?: number,
    container?: ContainerStatus,
}

export type ContainerPhase = 'Running' | 'Terminated' | 'Waiting' | 'Unknown';

export interface ContainerStatus {
    phase: ContainerPhase,
    reason?: string,
    message?: string,
}
