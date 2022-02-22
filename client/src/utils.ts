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
            return "http://playground-dev.substrate.test/api";
        case EnvironmentType.staging:
            return "https://playground-staging.substrate.dev/api";
        case EnvironmentType.production:
            return "https://playground.substrate.dev/api";
        default:
            throw new Error(`Unrecognized env ${env}`);
    }
}
