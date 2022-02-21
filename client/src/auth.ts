export interface Verification {
    deviceCode: string,
    userCode: string,
    verificationUri: string,
    expiresIn: number,
    interval: number,
}

// Scope can be: https://docs.github.com/en/developers/apps/scopes-for-oauth-apps
export async function getVerification(githubClientId: string, scope: string = "read:user"): Promise<Verification> {
    const res = await fetch(`https://github.com/login/device/code?client_id=${githubClientId}&scope=${scope}`, {
        method: 'POST',
        headers: {'Accept': 'application/json'}
    });
    const { device_code, user_code, verification_uri, expires_in, interval } = await res.json();
    // TODO handle errors
    /*
    { error: 'invalid_scope',
      error_description: 'The scopes requested are invalid: user:read.',
      error_uri: 'https://docs.github.com' }
    */
    return {
        deviceCode: device_code,
        userCode: user_code,
        verificationUri: verification_uri,
        expiresIn: expires_in,
        interval: interval,
    };
}

export interface Authorization {
    accessToken: string,
    tokenType: string,
    scope: string,
}

export async function getAuthorization(githubClientId: string, deviceCode: string): Promise<Authorization> {
    const grantType = 'urn:ietf:params:oauth:grant-type:device_code';
    const res = await fetch(`https://github.com/login/oauth/access_token?client_id=${githubClientId}&device_code=${deviceCode}&grant_type=${grantType}`, {
        method: 'POST',
        headers: {'Accept': 'application/json'}
    });
    const { access_token, token_type, scope, } = await res.json();
    return {
        accessToken: access_token,
        tokenType: token_type,
        scope: scope,
    };
}
