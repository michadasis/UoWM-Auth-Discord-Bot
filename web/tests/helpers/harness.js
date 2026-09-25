// End-to-end test harness: real OIDC client code against the local mock IdP,
// with an in-memory repository and a fake Discord API.

import crypto from 'node:crypto';
import fs from 'node:fs';
import { createMockIdp } from '../../../mock-idp/server.js';
import { loadConfig } from '../../src/lib/server/config.js';
import { createProvider } from '../../src/lib/server/provider/index.js';
import { createVerificationService } from '../../src/lib/server/verification.js';
import { hashStateToken } from '../../src/lib/server/crypto.js';
import { createMemoryRepository } from './memoryRepository.js';

const BASE_URL = 'http://127.0.0.1:3999';
const TEN_MINUTES = 10 * 60 * 1000;

export const ROLE = { student: 'role-student', professor: 'role-professor', guest: 'role-guest' };
export const CHANNEL = { admin: 'chan-admin', guest: 'chan-guest' };

export function testEnv(overrides = {}) {
    return {
        AUTH_PROVIDER: 'mock',
        PUBLIC_BASE_URL: BASE_URL,
        OIDC_CLIENT_ID: 'test-client',
        OIDC_CLIENT_SECRET: 'test-secret',
        UNI_ID_HASH_SECRET: 'test-hash-secret-that-is-long-enough-000',
        STUDENT_DEPARTMENT_CLAIM: 'schGrAcEnrollment',
        STUDENT_DEPARTMENT_PATTERN: ':department:informatics$',
        DISCORD_TOKEN: 'discord-token',
        GUILD_ID: 'guild-1',
        STUDENT_ROLE_ID: ROLE.student,
        PROFESSOR_ROLE_ID: ROLE.professor,
        GUEST_ROLE_ID: ROLE.guest,
        ADMIN_CHANNEL_ID: CHANNEL.admin,
        GUEST_CHANNEL_ID: CHANNEL.guest,
        ADMIN_ROLE_ID: 'role-admin',
        MODERATOR_ROLE_ID: 'role-mod',
        DB_USER: 'u',
        DB_PASSWORD: 'p',
        DB_NAME: 'd',
        ...overrides,
    };
}

export function createFakeDiscord(memberIds = []) {
    const members = new Map(memberIds.map((id) => [id, new Set()]));
    const fake = {
        members,
        dms: [],
        channelMessages: [],
        deletedMessages: [],
        failAddRole: false,
        addMember(id, roles = []) {
            members.set(id, new Set(roles));
        },
        rolesOf(id) {
            return [...(members.get(id) ?? [])];
        },
        async getMember(id) {
            return members.has(id) ? { roles: fake.rolesOf(id) } : null;
        },
        async addRole(id, roleId) {
            if (fake.failAddRole) throw new Error('simulated Discord failure');
            members.get(id).add(roleId);
        },
        async removeRole(id, roleId) {
            members.get(id)?.delete(roleId);
        },
        async sendDM(id, embed) {
            fake.dms.push({ userId: id, embed });
            return true;
        },
        async sendChannelMessage(channelId, message) {
            fake.channelMessages.push({ channelId, message });
        },
        async deleteMessage(channelId, messageId) {
            fake.deletedMessages.push({ channelId, messageId });
        },
    };
    return fake;
}

const silentLogger = { log() {}, info() {}, warn() {}, error() {} };

export async function createHarness({ env = {}, members = ['discord-A', 'discord-B'] } = {}) {
    const users = JSON.parse(fs.readFileSync(new URL('../../../mock-idp/users.json', import.meta.url), 'utf8'));
    const idp = await createMockIdp({
        users,
        clients: [{ clientId: 'test-client', clientSecret: 'test-secret', redirectUris: [`${BASE_URL}/callback`] }],
    });

    const config = loadConfig(testEnv({ MOCK_ISSUER: idp.issuer, ...env }));
    const repo = createMemoryRepository();
    const discord = createFakeDiscord(members);
    const clock = { now: Date.now() };
    const service = createVerificationService({
        config,
        repo,
        provider: createProvider(config),
        discord,
        now: () => clock.now,
        logger: silentLogger,
    });

    // Same scheme as bot/src/lib/authState.js.
    function issueLink(discordUserId) {
        const token = crypto.randomBytes(32).toString('base64url');
        repo.insertState(hashStateToken(token), { discordUserId, createdAt: clock.now, expiresAt: clock.now + TEN_MINUTES });
        return token;
    }

    // Plays the browser on the mock login page: picks a test user and returns the callback URL.
    async function loginAtIdp(authorizationUrl, testUserId) {
        const params = new URL(authorizationUrl).searchParams;
        params.set('user', testUserId);
        const res = await fetch(`${idp.issuer}/authorize`, { method: 'POST', body: params, redirect: 'manual' });
        if (res.status !== 302) throw new Error(`mock IdP returned ${res.status}: ${await res.text()}`);
        return new URL(res.headers.get('location'));
    }

    // Full flow for one link. cookieToken defaults to the token (same browser).
    async function verify(token, testUserId, { cookieToken = token, beforeCallback } = {}) {
        const start = await service.startLogin(token);
        if (start.code !== 'redirect') return { start, result: start };
        const callbackUrl = await loginAtIdp(start.redirectUrl, testUserId);
        if (beforeCallback) await beforeCallback();
        const result = await service.completeLogin({ callbackUrl, cookieToken });
        return { start, result, callbackUrl };
    }

    return { idp, config, repo, discord, clock, service, issueLink, loginAtIdp, verify, close: () => idp.close() };
}
