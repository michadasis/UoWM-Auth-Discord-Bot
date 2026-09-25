import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/lib/server/affiliation.js';
import { loadConfig, ConfigError } from '../src/lib/server/config.js';
import { testEnv } from './helpers/harness.js';

const policy = {
    expectedHomeOrg: 'uowm.gr',
    departmentFilter: { claim: 'dept', pattern: /informatics/i },
};

describe('classify', () => {
    test('accepts single string claims as well as arrays', () => {
        assert.deepEqual(classify({ eduPersonAffiliation: 'faculty', schacHomeOrganization: 'uowm.gr' }, policy), {
            ok: true,
            affiliation: 'faculty',
        });
        assert.deepEqual(classify({ eduPersonScopedAffiliation: 'staff@uowm.gr' }, policy), { ok: true, affiliation: 'staff' });
    });

    test('faculty wins over student', () => {
        const claims = { eduPersonScopedAffiliation: ['student@uowm.gr', 'faculty@uowm.gr'] };
        assert.equal(classify(claims, policy).affiliation, 'faculty');
    });

    test('ignores affiliations scoped to other institutions', () => {
        const claims = { eduPersonScopedAffiliation: ['faculty@example.edu', 'affiliate@uowm.gr'] };
        assert.deepEqual(classify(claims, policy), { ok: false, reason: 'not_eligible' });
    });

    test('rejects when the home organization cannot be confirmed', () => {
        assert.deepEqual(classify({ eduPersonAffiliation: ['student'] }, policy), { ok: false, reason: 'wrong_home_org' });
    });

    test('students need a matching department claim; missing claim fails closed', () => {
        const base = { eduPersonScopedAffiliation: ['student@uowm.gr'] };
        assert.equal(classify({ ...base, dept: 'Informatics' }, policy).affiliation, 'student');
        assert.equal(classify(base, policy).reason, 'wrong_department');
    });

    test('department filter does not apply to faculty', () => {
        assert.equal(classify({ eduPersonScopedAffiliation: ['faculty@uowm.gr'] }, policy).affiliation, 'faculty');
    });
});

describe('loadConfig', () => {
    test('requires the department filter settings unless explicitly turned off', () => {
        const env = testEnv({ MOCK_ISSUER: 'http://127.0.0.1:1', STUDENT_DEPARTMENT_CLAIM: '' });
        assert.throws(() => loadConfig(env), ConfigError);
        assert.equal(loadConfig({ ...env, STUDENT_DEPARTMENT_FILTER: 'off' }).policy.departmentFilter, null);
    });

    test('the real provider requires https and defaults to the UoWM issuer', () => {
        const env = testEnv({ AUTH_PROVIDER: 'uowm' });
        assert.throws(() => loadConfig(env), /https/);
        const config = loadConfig({ ...env, PUBLIC_BASE_URL: 'https://verify.example.org' });
        assert.equal(config.oidc.issuer, 'https://sso.uowm.gr/oidc');
        assert.equal(config.oidc.allowInsecureRequests, false);
        assert.equal(config.redirectUri, 'https://verify.example.org/callback');
    });

    test('rejects a short hash secret', () => {
        assert.throws(() => loadConfig(testEnv({ MOCK_ISSUER: 'http://127.0.0.1:1', UNI_ID_HASH_SECRET: 'short' })), /UNI_ID_HASH_SECRET/);
    });
});
