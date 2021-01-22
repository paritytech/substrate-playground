export interface Playground {
    env: Environment,
    configuration: Configuration,
    templates: Record<string, Template>,
    user?: PlaygroundUser,
}

export interface Environment {
    secured: boolean,
    host: string,
    namespace: string,
}

export interface Configuration {
    githubClientId: string,
    sessionDefaults: SessionDefaults,
}

export interface SessionDefaults {
    /* The default number of minutes sessions can last */
    duration: number,
}

export interface PlaygroundUser {
    id: string,
    avatar: string,
    admin: boolean,
    canCustomizeDuration: boolean,
}

export interface User {
    admin: boolean,
    canCustomizeDuration: boolean,
}

export interface UserConfiguration {
    admin: boolean,
    canCustomizeDuration: boolean,
}

export interface UserUpdateConfiguration {
    admin: boolean,
    canCustomizeDuration: boolean,
}
export interface Session {
    user: String,
    url: string,
    template: Template,
    pod: PodDetails,
    /* The number of minutes this session can last */
    duration: number,
}

export interface SessionConfiguration {
    template: string,
    /* The number of minutes this session will be able to last */
    duration?: number,
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
export interface PodDetails {
    phase: Phase,
    reason: String,
    message: String,
    /* The number of seconds since this session started */
    startTime?: number,
}
