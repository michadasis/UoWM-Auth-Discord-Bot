// Reads and validates configuration from environment variables.
// Fails fast with a clear message instead of misbehaving at request time.

import path from 'node:path';

const UOWM_ISSUER = 'https://sso.uowm.gr/oidc';
const PROVIDERS = ['email', 'uowm', 'mock'];

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

function regex(env, name, fallback, problems) {
    const source = optional(env, name, fallback);
    try {
        return new RegExp(source, 'i');
    } catch (err) {
        problems.push(`${name} is not a valid regular expression: ${err.message}`);
        return null;
    }
}

function loadOidc(env, provider, problems) {
    const issuer = (provider === 'mock' ? required(env, 'MOCK_ISSUER', problems) : optional(env, 'OIDC_ISSUER', UOWM_ISSUER)).replace(/\/$/, '');
    return {
        issuer,
        clientId: required(env, 'OIDC_CLIENT_ID', problems),
        clientSecret: required(env, 'OIDC_CLIENT_SECRET', problems),
        scope: optional(env, 'OIDC_SCOPES', 'openid extendedProfile'),
        fetchUserinfo: optional(env, 'OIDC_FETCH_USERINFO', 'true') !== 'false',
        // Only for the mock provider inside Docker: the browser reaches the issuer on
        // localhost, the web container reaches it on the compose service name.
        internalOrigin: provider === 'mock' ? optional(env, 'MOCK_INTERNAL_ORIGIN') : '',
        allowInsecureRequests: provider === 'mock',
    };
}

function loadOidcPolicy(env, problems) {
    const departmentFilterMode = optional(env, 'STUDENT_DEPARTMENT_FILTER', 'on');
    let departmentFilter = null;
    if (departmentFilterMode === 'on') {
        const claim = required(env, 'STUDENT_DEPARTMENT_CLAIM', problems);
        const pattern = required(env, 'STUDENT_DEPARTMENT_PATTERN', problems);
        if (claim && pattern) {
            const compiled = regex(env, 'STUDENT_DEPARTMENT_PATTERN', '', problems);
            if (compiled) departmentFilter = { claim, pattern: compiled };
        }
    } else if (departmentFilterMode !== 'off') {
        problems.push('STUDENT_DEPARTMENT_FILTER must be "on" or "off"');
    }
    const expectedHomeOrg = optional(env, 'EXPECTED_HOME_ORG', 'uowm.gr').toLowerCase();
    return {
        // "off" only if the provider releases neither eduPersonScopedAffiliation nor schacHomeOrganization.
        expectedHomeOrg: expectedHomeOrg === 'off' ? '' : expectedHomeOrg,
        departmentFilter,
    };
}

function loadEmail(env, secureOrigin, problems) {
    const transport = optional(env, 'EMAIL_TRANSPORT', 'smtp');
    if (!['smtp', 'console'].includes(transport)) problems.push('EMAIL_TRANSPORT must be "smtp" or "console"');
    if (transport === 'console' && secureOrigin) {
        problems.push('EMAIL_TRANSPORT=console prints codes to the log and is only allowed for local development (http PUBLIC_BASE_URL)');
    }
    const smtp = transport === 'smtp'
        ? {
              host: required(env, 'SMTP_HOST', problems),
              port: Number(optional(env, 'SMTP_PORT', '587')),
              secure: optional(env, 'SMTP_SECURE', 'false') === 'true',
              user: required(env, 'SMTP_USER', problems),
              pass: required(env, 'SMTP_PASS', problems),
          }
        : null;

    return {
        transport,
        smtp,
        from: transport === 'smtp' ? required(env, 'EMAIL_FROM', problems) : optional(env, 'EMAIL_FROM', 'dev@localhost'),
        domain: optional(env, 'EMAIL_DOMAIN', 'uowm.gr').toLowerCase(),
        // The first capture group is the student number; uniqueness is keyed on it.
        studentPattern: regex(env, 'EMAIL_STUDENT_PATTERN', '^cs(\\d{4,6})$', problems),
        // Usernames that look like students of other departments, for a clearer rejection message.
        otherStudentPattern: regex(env, 'EMAIL_OTHER_STUDENT_PATTERN', '^[a-z]{2,6}\\d{3,7}$', problems),
        facultyFile: path.resolve(optional(env, 'FACULTY_EMAILS_FILE', 'data/faculty-emails.txt')),
    };
}

export function loadConfig(env = process.env) {
    const problems = [];

    const provider = optional(env, 'AUTH_PROVIDER', 'email');
    if (!PROVIDERS.includes(provider)) problems.push(`AUTH_PROVIDER must be one of: ${PROVIDERS.join(', ')}`);

    const publicBaseUrl = required(env, 'PUBLIC_BASE_URL', problems).replace(/\/$/, '');
    const secureOrigin = publicBaseUrl.startsWith('https://');
    if (provider !== 'mock' && publicBaseUrl && !secureOrigin && env.ALLOW_INSECURE_DEV !== 'true') {
        problems.push(`PUBLIC_BASE_URL must use https:// when AUTH_PROVIDER=${provider} (set ALLOW_INSECURE_DEV=true for local development)`);
    }

    const uniIdHashSecret = required(env, 'UNI_ID_HASH_SECRET', problems);
    if (uniIdHashSecret && uniIdHashSecret.length < 32) problems.push('UNI_ID_HASH_SECRET must be at least 32 characters');

    const isOidc = provider === 'uowm' || provider === 'mock';

    const config = {
        provider,
        publicBaseUrl,
        redirectUri: `${publicBaseUrl}/callback`,
        secureCookies: secureOrigin,
        oidc: isOidc ? loadOidc(env, provider, problems) : null,
        policy: isOidc ? loadOidcPolicy(env, problems) : null,
        email: provider === 'email' ? loadEmail(env, secureOrigin, problems) : null,
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
