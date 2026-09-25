// Harness for the email code flow: real services, in-memory repository, fake mailer and Discord.

import crypto from 'node:crypto';
import { loadConfig } from '../../src/lib/server/config.js';
import { createVerificationService } from '../../src/lib/server/verification.js';
import { createEmailVerificationService } from '../../src/lib/server/emailVerification.js';
import { hashStateToken } from '../../src/lib/server/crypto.js';
import { createMemoryRepository } from './memoryRepository.js';
import { createFakeDiscord, testEnv } from './harness.js';

const TEN_MINUTES = 10 * 60 * 1000;
const silentLogger = { log() {}, info() {}, warn() {}, error() {} };

export function createEmailHarness({ env = {}, members = ['discord-A', 'discord-B'], faculty = ['prof.example'] } = {}) {
    const config = loadConfig(
        testEnv({
            AUTH_PROVIDER: 'email',
            ALLOW_INSECURE_DEV: 'true',
            EMAIL_TRANSPORT: 'console',
            ...env,
        }),
    );
    const repo = createMemoryRepository();
    const discord = createFakeDiscord(members);
    const clock = { now: Date.now() };
    const sent = [];
    const mailer = {
        failNext: false,
        async send(message) {
            if (mailer.failNext) {
                mailer.failNext = false;
                throw new Error('simulated SMTP failure');
            }
            sent.push(message);
        },
    };

    const linker = createVerificationService({ config, repo, provider: null, discord, now: () => clock.now, logger: silentLogger });
    const service = createEmailVerificationService({
        config,
        repo,
        mailer,
        loadFacultyLocals: async () => new Set(faculty),
        linker,
        now: () => clock.now,
        logger: silentLogger,
    });

    function issueLink(discordUserId) {
        const token = crypto.randomBytes(32).toString('base64url');
        repo.insertState(hashStateToken(token), { discordUserId, createdAt: clock.now, expiresAt: clock.now + TEN_MINUTES });
        return token;
    }

    function lastCode() {
        return sent.at(-1).text.match(/(\d{6})/)[1];
    }

    // Full happy path: send code to the address, read it from the mailbox, submit it.
    async function verify(token, address) {
        const send = await service.sendCode(token, address);
        if (send.code !== 'code_sent') return { send, result: send };
        const result = await service.verifyCode(token, lastCode());
        return { send, result };
    }

    return { config, repo, discord, clock, sent, mailer, service, issueLink, lastCode, verify };
}
