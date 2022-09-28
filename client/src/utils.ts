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

export function playgroundUserBaseURL(env: EnvironmentType, userId: string) {
    const subdomain = userSubDomain(userId);
    switch (env) {
        case EnvironmentType.dev:
            return `https://${subdomain}.playground-dev.substrate.test`;
        case EnvironmentType.staging:
            return `https://${subdomain}.playground-staging.substrate.io`;
        case EnvironmentType.production:
            return `https://${subdomain}.playground.substrate.io`;
        default:
            throw new Error(`Unrecognized env ${env}`);
    }
}

export function playgroundBaseAPIURL(env: EnvironmentType) {
    return `${playgroundBaseURL(env)}/api`
}

// Return a normalized user sub-domain that is valid with regards to Playground constraints
export function userSubDomain(userId: string): string {
    return userId.toLocaleLowerCase();
}
