export interface Playground {
    templates: Array<Template>,
    session?: Session,
    user?: PlaygroundUser,
}

export interface PlaygroundUser {
    id: string,
    avatar: string,
    admin: boolean,
}

export interface User {
    id: string,
    admin: boolean,
}

export interface UserConfiguration {
    admin: boolean,
}

export interface SessionConfiguration {
    template: string,
}

export interface NameValuePair {
    name: string,
    value: string,
}

export interface Port {
    name: string,
    value: string,
}

export interface RuntimeConfiguration {
    env?: NameValuePair[],
    ports?: Port[],
}

export interface Template {
    name: string,
    image: string,
    description: string,
    tags: Map<string, string>,
    runtime?: RuntimeConfiguration,
}

export interface PodDetails {
    name: string,
    value: string,
}

export interface Session {
    user: String,
    url: string,
    template: Template,
    pod: PodDetails,
    sessionDuration: number,
}

// See https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#pod-phase
export type Phase = "Pending" | "Running" | "Succeeded" | "Failed" | "Unknown";
