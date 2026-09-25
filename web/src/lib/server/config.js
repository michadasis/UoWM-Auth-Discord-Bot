// Reads and validates configuration from environment variables.
// Fails fast with a clear message instead of misbehaving at request time.

const UOWM_ISSUER = 'https://sso.uowm.gr/oidc';

export class ConfigError extends Error {}

function required(env, name, problems) {
    const value = env[name];
    if (!value || !value.trim()) {
        problems.push(`${name} is required`);
        return '';
    }
    return value.trim();
}

function optional(env, name, fallback = '') {
    const value = env[name];
    return value && value.trim() ? value.trim() : fallback;
}

export function loadConfig(env = process.env) {
    const problems = [];

    const provider = optional(env, 'AUTH_PROVIDER', 'uowm');
    if (!['uowm', 'mock'].includes(provider)) problems.push('AUTH_PROVIDER must be "uowm" or "mock"');

    const publicBaseUrl = required(env, 'PUBLIC_BASE_URL', problems).replace(/\/$/, '');
    if (provider === 'uowm' && publicBaseUrl && !publicBaseUrl.startsWith('https://')) {
        problems.push('PUBLIC_BASE_URL must use https:// when AUTH_PROVIDER=uowm');
    }

    const issuer = (provider === 'mock' ? required(env, 'MOCK_ISSUER', problems) : optional(env, 'OIDC_ISSUER', UOWM_ISSUER)).replace(/\/$/, '');

    const uniIdHashSecret = required(env, 'UNI_ID_HASH_SECRET', problems);
    if (uniIdHashSecret && uniIdHashSecret.length < 32) problems.push('UNI_ID_HASH_SECRET must be at least 32 characters');

    const departmentFilterMode = optional(env, 'STUDENT_DEPARTMENT_FILTER', 'on');
    let departmentFilter = null;
    if (departmentFilterMode === 'on') {
        const claim = required(env, 'STUDENT_DEPARTMENT_CLAIM', problems);
        const pattern = required(env, 'STUDENT_DEPARTMENT_PATTERN', problems);
        if (claim && pattern) {
            try {
                departmentFilter = { claim, pattern: new RegExp(pattern, 'i') };
            } catch (err) {
                problems.push(`STUDENT_DEPARTMENT_PATTERN is not a valid regular expression: ${err.message}`);
            }
        }
    } else if (departmentFilterMode !== 'off') {
        problems.push('STUDENT_DEPARTMENT_FILTER must be "on" or "off"');
    }

    const expectedHomeOrg = optional(env, 'EXPECTED_HOME_ORG', 'uowm.gr').toLowerCase();

    const config = {
        provider,
        publicBaseUrl,
        redirectUri: `${publicBaseUrl}/callback`,
        secureCookies: publicBaseUrl.startsWith('https://'),
        oidc: {
            issuer,
            clientId: required(env, 'OIDC_CLIENT_ID', problems),
            clientSecret: required(env, 'OIDC_CLIENT_SECRET', problems),
            scope: optional(env, 'OIDC_SCOPES', 'openid extendedProfile'),
            fetchUserinfo: optional(env, 'OIDC_FETCH_USERINFO', 'true') !== 'false',
            // Only for the mock provider inside Docker: the browser reaches the issuer on
            // localhost, the web container reaches it on the compose service name.
            internalOrigin: provider === 'mock' ? optional(env, 'MOCK_INTERNAL_ORIGIN') : '',
            allowInsecureRequests: provider === 'mock',
        },
        policy: {
            // "off" only if the provider releases neither eduPersonScopedAffiliation nor schacHomeOrganization.
            expectedHomeOrg: expectedHomeOrg === 'off' ? '' : expectedHomeOrg,
            departmentFilter,
        },
        uniIdHashSecret,
        discord: {
            token: required(env, 'DISCORD_TOKEN', problems),
            guildId: required(env, 'GUILD_ID', problems),
            studentRoleId: required(env, 'STUDENT_ROLE_ID', problems),
            professorRoleId: required(env, 'PROFESSOR_ROLE_ID', problems),
            guestRoleId: optional(env, 'GUEST_ROLE_ID'),
            guestChannelId: optional(env, 'GUEST_CHANNEL_ID'),
            adminChannelId: optional(env, 'ADMIN_CHANNEL_ID'),
            adminRoleId: optional(env, 'ADMIN_ROLE_ID'),
            moderatorRoleId: optional(env, 'MODERATOR_ROLE_ID'),
        },
        db: {
            host: optional(env, 'DB_HOST', 'db'),
            user: required(env, 'DB_USER', problems),
            password: required(env, 'DB_PASSWORD', problems),
            database: required(env, 'DB_NAME', problems),
        },
    };

    if (problems.length) throw new ConfigError(`Invalid configuration:\n - ${problems.join('\n - ')}`);
    return config;
}
