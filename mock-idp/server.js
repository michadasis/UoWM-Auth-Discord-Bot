// Minimal OpenID Connect provider for LOCAL DEVELOPMENT AND TESTS ONLY.
//
// It mimics the parts of the UoWM Apereo CAS OIDC endpoint that the web app uses:
// discovery, authorization code flow with PKCE (S256), RS256-signed ID tokens,
// userinfo and JWKS. There are no passwords: the "login" page is a list of
// configurable test users (see users.json). Never expose this server publicly.

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE_TTL_MS = 60_000;
const TOKEN_TTL_S = 300;

function b64url(input) {
    return Buffer.from(input).toString('base64url');
}

function randomToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function sendJson(res, status, body, extraHeaders = {}) {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...extraHeaders });
    res.end(JSON.stringify(body));
}

function oauthError(res, status, error, description) {
    sendJson(res, status, { error, error_description: description });
}

async function readForm(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

/**
 * @param {object} options
 * @param {string} [options.issuer]  Public issuer URL. Defaults to http://127.0.0.1:<port>.
 * @param {number} [options.port]    0 picks a random free port.
 * @param {string} [options.host]
 * @param {Array}  options.users     Test users, see users.json.
 * @param {Array<{clientId: string, clientSecret: string, redirectUris: string[]}>} options.clients
 */
export async function createMockIdp({ issuer, port = 0, host = '127.0.0.1', users, clients }) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const kid = randomToken().slice(0, 16);
    const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };

    const codes = new Map();
    const accessTokens = new Map();
    let issuerUrl = issuer;

    function signJwt(payload) {
        const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
        const body = b64url(JSON.stringify(payload));
        const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey).toString('base64url');
        return `${header}.${body}.${signature}`;
    }

    function findClient(clientId) {
        return clients.find((c) => c.clientId === clientId);
    }

    function authenticateClient(req, form) {
        let clientId = form.get('client_id');
        let clientSecret = form.get('client_secret');
        const auth = req.headers.authorization;
        if (auth?.startsWith('Basic ')) {
            const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
            const idx = decoded.indexOf(':');
            clientId = decodeURIComponent(decoded.slice(0, idx));
            clientSecret = decodeURIComponent(decoded.slice(idx + 1));
        }
        const client = findClient(clientId);
        if (!client || !clientSecret) return null;
        const a = Buffer.from(client.clientSecret);
        const b = Buffer.from(clientSecret);
        return a.length === b.length && crypto.timingSafeEqual(a, b) ? client : null;
    }

    function validateAuthorizeParams(params) {
        const client = findClient(params.get('client_id'));
        if (!client) return 'unknown client_id';
        if (!client.redirectUris.includes(params.get('redirect_uri'))) return 'redirect_uri not registered';
        if (params.get('response_type') !== 'code') return 'only response_type=code is supported';
        if (!(params.get('scope') || '').split(' ').includes('openid')) return 'scope must include openid';
        if (!params.get('state')) return 'state is required';
        if (params.get('code_challenge_method') !== 'S256' || !params.get('code_challenge')) return 'PKCE S256 is required';
        return null;
    }

    function discovery() {
        return {
            issuer: issuerUrl,
            authorization_endpoint: `${issuerUrl}/authorize`,
            token_endpoint: `${issuerUrl}/token`,
            userinfo_endpoint: `${issuerUrl}/userinfo`,
            jwks_uri: `${issuerUrl}/jwks`,
            scopes_supported: ['openid', 'profile', 'extendedProfile'],
            response_types_supported: ['code'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
            token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
            code_challenge_methods_supported: ['S256'],
            grant_types_supported: ['authorization_code'],
        };
    }

    function renderLoginPage(params) {
        const hidden = [...params.entries()]
            .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
            .join('');
        const buttons = users
            .map((u) => `<button name="user" value="${escapeHtml(u.id)}">${escapeHtml(u.label)} (${escapeHtml(u.id)})</button>`)
            .join('');
        return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MOCK SSO</title>
<style>body{font-family:sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem}
.warn{background:#fee;border:2px solid #c00;padding:1rem;margin-bottom:1rem}
button{display:block;width:100%;margin:.5rem 0;padding:.75rem;font-size:1rem;cursor:pointer}</style></head>
<body><div class="warn"><strong>MOCK identity provider for local testing.</strong> This is not the University of Western Macedonia login page. No passwords are used.</div>
<form method="post" action="${escapeHtml(issuerUrl)}/authorize">${hidden}${buttons}</form></body></html>`;
    }

    async function handle(req, res) {
        const url = new URL(req.url, issuerUrl);
        const route = `${req.method} ${url.pathname}`;

        if (route === 'GET /.well-known/openid-configuration') return sendJson(res, 200, discovery());
        if (route === 'GET /jwks') return sendJson(res, 200, { keys: [publicJwk] });

        if (route === 'GET /authorize') {
            const problem = validateAuthorizeParams(url.searchParams);
            if (problem) return oauthError(res, 400, 'invalid_request', problem);
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            return res.end(renderLoginPage(url.searchParams));
        }

        if (route === 'POST /authorize') {
            const form = await readForm(req);
            const problem = validateAuthorizeParams(form);
            if (problem) return oauthError(res, 400, 'invalid_request', problem);
            const user = users.find((u) => u.id === form.get('user'));
            if (!user) return oauthError(res, 400, 'invalid_request', 'unknown test user');

            const code = randomToken();
            codes.set(code, {
                user,
                clientId: form.get('client_id'),
                redirectUri: form.get('redirect_uri'),
                nonce: form.get('nonce'),
                codeChallenge: form.get('code_challenge'),
                expiresAt: Date.now() + CODE_TTL_MS,
            });
            const target = new URL(form.get('redirect_uri'));
            target.searchParams.set('code', code);
            target.searchParams.set('state', form.get('state'));
            res.writeHead(302, { location: target.toString() });
            return res.end();
        }

        if (route === 'POST /token') {
            const form = await readForm(req);
            const client = authenticateClient(req, form);
            if (!client) return oauthError(res, 401, 'invalid_client', 'client authentication failed');
            if (form.get('grant_type') !== 'authorization_code') return oauthError(res, 400, 'unsupported_grant_type', 'only authorization_code');

            const code = form.get('code');
            const entry = codes.get(code);
            codes.delete(code); // single use
            if (!entry || entry.expiresAt < Date.now()) return oauthError(res, 400, 'invalid_grant', 'code invalid or expired');
            if (entry.clientId !== client.clientId) return oauthError(res, 400, 'invalid_grant', 'code issued to another client');
            if (entry.redirectUri !== form.get('redirect_uri')) return oauthError(res, 400, 'invalid_grant', 'redirect_uri mismatch');
            const verifier = form.get('code_verifier') || '';
            const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
            if (challenge !== entry.codeChallenge) return oauthError(res, 400, 'invalid_grant', 'PKCE verification failed');

            const now = Math.floor(Date.now() / 1000);
            const accessToken = randomToken();
            accessTokens.set(accessToken, { user: entry.user, expiresAt: Date.now() + TOKEN_TTL_S * 1000 });
            const idToken = signJwt({
                ...entry.user.claims,
                iss: issuerUrl,
                aud: client.clientId,
                iat: now,
                exp: now + TOKEN_TTL_S,
                ...(entry.nonce ? { nonce: entry.nonce } : {}),
            });
            return sendJson(res, 200, { access_token: accessToken, token_type: 'Bearer', expires_in: TOKEN_TTL_S, id_token: idToken });
        }

        if (route === 'GET /userinfo') {
            const auth = req.headers.authorization || '';
            const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
            const entry = accessTokens.get(token);
            if (!entry || entry.expiresAt < Date.now()) {
                return sendJson(res, 401, { error: 'invalid_token' }, { 'www-authenticate': 'Bearer error="invalid_token"' });
            }
            return sendJson(res, 200, entry.user.claims);
        }

        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
    }

    const server = http.createServer((req, res) => {
        handle(req, res).catch((err) => {
            console.error('[mock-idp]', err);
            if (!res.headersSent) oauthError(res, 500, 'server_error', 'internal error');
        });
    });

    await new Promise((resolve) => server.listen(port, host, resolve));
    const actualPort = server.address().port;
    if (!issuerUrl) issuerUrl = `http://${host}:${actualPort}`;

    return {
        issuer: issuerUrl,
        port: actualPort,
        close: () => new Promise((resolve) => server.close(resolve)),
    };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    const env = process.env;
    const required = ['MOCK_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'PUBLIC_BASE_URL'];
    const missing = required.filter((k) => !env[k]);
    if (missing.length) {
        console.error(`[mock-idp] missing env vars: ${missing.join(', ')}`);
        process.exit(1);
    }
    const usersFile = env.MOCK_USERS_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), 'users.json');
    const idp = await createMockIdp({
        issuer: env.MOCK_ISSUER.replace(/\/$/, ''),
        port: Number(env.MOCK_PORT || 4000),
        host: env.MOCK_HOST || '0.0.0.0',
        users: JSON.parse(fs.readFileSync(usersFile, 'utf8')),
        clients: [{
            clientId: env.OIDC_CLIENT_ID,
            clientSecret: env.OIDC_CLIENT_SECRET,
            redirectUris: [`${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/callback`],
        }],
    });
    console.log(`[mock-idp] MOCK OIDC provider listening on port ${idp.port}, issuer ${idp.issuer}`);
}
