import { User } from "./types";

export enum EnvironmentType {dev, staging, production}

export function environmentTypeFromString(s: string): EnvironmentType {
    switch (s) {
        case "dev":
            return EnvironmentType.dev;
        case "staging":
            return EnvironmentType.staging;
        case "production":
            return EnvironmentType.production;
        default:
            throw new Error(`Unrecognized env ${s}`);
    }
}

export function playgroundBaseURL(env: EnvironmentType) {
    switch (env) {
        case EnvironmentType.dev:
            return "https://playground-dev.substrate.test";
        case EnvironmentType.staging:
            return "https://playground-staging.substrate.io";
        case EnvironmentType.production:
            return "https://playground.substrate.io";
        default:
            throw new Error(`Unrecognized env ${env}`);
    }
}

export function playgroundBaseAPIURL(env: EnvironmentType) {
    return `${playgroundBaseURL(env)}/api`
}

// Return a normalized session ID that is valid with regards to Playground constraints
export function normalizeSessionId(sessionId: string): string {
    return sessionId.toLocaleLowerCase();
}

// Return the main session ID for a considered user
export function mainSessionId(user: User): string {
    return normalizeSessionId(user.id);
}
