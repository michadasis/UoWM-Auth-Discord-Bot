// Pluggable authentication provider.
//
// A provider implements:
//   newChecks() -> { codeVerifier, nonce }
//   authorizationUrl({ state, nonce, codeVerifier }) -> URL on the official login page
//   exchange(callbackUrl, { state, nonce, codeVerifier }) -> { issuer, claims }
//
// Both "uowm" and "mock" speak OpenID Connect; they differ only in issuer and
// transport settings (see config.js). A CAS or SAML provider could be added here
// with the same interface.

import { createOidcProvider } from './oidc.js';

export function createProvider(config) {
    switch (config.provider) {
        case 'uowm':
        case 'mock':
            return createOidcProvider(config.oidc, config.redirectUri);
        default:
            throw new Error(`Unknown AUTH_PROVIDER: ${config.provider}`);
    }
}
