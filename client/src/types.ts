export interface Playground {
    env: Environment,
    configuration: Configuration,
    templates: Record<string, Template>,
    user?: PlaygroundUser,
}

export interface Environment {
    host: string,
    namespace: string,
}

export interface Configuration {
    githubClientId: string,
    sessionDefaults: SessionDefaults,
}

export interface SessionDefaults {
    duration: number,
}

export interface PlaygroundUser {
    id: string,
    avatar: string,
    admin: boolean,
}

export interface User {
    admin: boolean,
}

export interface UserConfiguration {
    admin: boolean,
}

export interface Session {
    user: String,
    url: string,
    template: Template,
    pod: PodDetails,
    duration: number,
}

export interface SessionConfiguration {
    template: string,
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
export interface PodDetails {
    phase: Phase,
    reason: String,
    message: String,
    startTime?: number,
}
