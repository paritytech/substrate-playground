export enum Environment {dev, staging, production}

export function playgroundBaseURL(env: Environment) {
    switch (env) {
        case Environment.dev:
            return "http://playground-dev.substrate.test/api";
        case Environment.staging:
            return "https://playground-staging.substrate.dev/api";
        case Environment.production:
            return "https://playground.substrate.dev/api";
        default:
            throw new Error(`Unrecognized env ${env}`);
    }
}
