// OpenID Connect provider (authorization code flow + PKCE S256, confidential client).
// Used for both the real UoWM SSO (Apereo CAS, https://sso.uowm.gr/oidc) and the local mock;
// only the configuration differs. openid-client validates the ID token signature,
// iss, aud, exp and nonce, the state parameter and the PKCE verifier.

import * as client from 'openid-client';

export function createOidcProvider(cfg, redirectUri) {
    let configPromise;

    function rewritingFetch(url, options) {
        const issuerOrigin = new URL(cfg.issuer).origin;
        const target = url.startsWith(issuerOrigin) ? cfg.internalOrigin + url.slice(issuerOrigin.length) : url;
        return fetch(target, options);
    }

    function getConfiguration() {
        if (!configPromise) {
            configPromise = (async () => {
                const options = {};
                if (cfg.allowInsecureRequests) options.execute = [client.allowInsecureRequests];
                if (cfg.internalOrigin) options[client.customFetch] = rewritingFetch;
                const configuration = await client.discovery(
                    new URL(cfg.issuer),
                    cfg.clientId,
                    undefined,
                    client.ClientSecretBasic(cfg.clientSecret),
                    options,
                );
                if (cfg.internalOrigin) configuration[client.customFetch] = rewritingFetch;
                return configuration;
            })().catch((err) => {
                configPromise = undefined; // retry discovery on the next request
                throw err;
            });
        }
        return configPromise;
    }

    return {
        newChecks() {
            return { codeVerifier: client.randomPKCECodeVerifier(), nonce: client.randomNonce() };
        },

        async authorizationUrl({ state, nonce, codeVerifier }) {
            const configuration = await getConfiguration();
            return client.buildAuthorizationUrl(configuration, {
                redirect_uri: redirectUri,
                scope: cfg.scope,
                state,
                nonce,
                code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
                code_challenge_method: 'S256',
            });
        },

        // callbackUrl: the full callback URL as registered (redirect_uri + query string).
        async exchange(callbackUrl, { state, nonce, codeVerifier }) {
            const configuration = await getConfiguration();
            const tokens = await client.authorizationCodeGrant(configuration, callbackUrl, {
                pkceCodeVerifier: codeVerifier,
                expectedState: state,
                expectedNonce: nonce,
                idTokenExpected: true,
            });
            const idClaims = tokens.claims();
            const userinfo = cfg.fetchUserinfo
                ? await client.fetchUserInfo(configuration, tokens.access_token, idClaims.sub)
                : {};
            // Tokens are not stored anywhere. Signed ID token claims win over userinfo.
            return { issuer: configuration.serverMetadata().issuer, claims: { ...userinfo, ...idClaims } };
        },
    };
}
