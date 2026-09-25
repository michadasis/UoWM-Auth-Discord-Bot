import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEmailHarness } from './helpers/emailHarness.js';
import { ROLE } from './helpers/harness.js';
import { classifyAddress, parseAddress, loadFacultyLocals, maskAddress } from '../src/lib/server/emailPolicy.js';
import { EMAIL_LIMITS } from '../src/lib/server/emailVerification.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEN_MINUTES = 10 * 60 * 1000;

describe('email code verification', () => {
    let h;

    beforeEach(() => {
        h = createEmailHarness();
    });

    test('Informatics student (csNNNNN) gets the student role', async () => {
        const token = h.issueLink('discord-A');
        assert.equal((await h.service.begin(token)).code, 'address_needed');

        const { send, result } = await h.verify(token, 'cs01234');

        assert.equal(send.code, 'code_sent');
        assert.equal(send.maskedAddress, 'cs0***4@uowm.gr');
        assert.equal(h.sent[0].to, 'cs01234@uowm.gr');
        assert.equal(result.code, 'verified_student');
        assert.deepEqual(h.discord.rolesOf('discord-A'), [ROLE.student]);

        const [row] = h.repo.allUsers();
        assert.equal(row.affiliation, 'student');
        assert.ok(!JSON.stringify(row).includes('01234'), 'student number must not be stored');
        assert.equal(h.discord.dms.at(-1).embed.title, 'Επιτυχής επιβεβαίωση');
    });

    test('accepts the full address in any case', async () => {
        const { result } = await h.verify(h.issueLink('discord-A'), '  CS01234@UOWM.GR ');
        assert.equal(result.code, 'verified_student');
    });

    test('professor on the faculty list gets the professor role', async () => {
        const { result } = await h.verify(h.issueLink('discord-A'), 'prof.example@uowm.gr');

        assert.equal(result.code, 'verified_professor');
        assert.deepEqual(h.discord.rolesOf('discord-A'), [ROLE.professor]);
        assert.equal(h.repo.allUsers()[0].affiliation, 'faculty');
    });

    test('student of another department is rejected without sending email', async () => {
        const send = await h.service.sendCode(h.issueLink('discord-A'), 'psy01234');
        assert.equal(send.code, 'wrong_department');
        assert.equal(h.sent.length, 0);
    });

    test('outsider (not a student pattern, not on the faculty list) is rejected', async () => {
        const send = await h.service.sendCode(h.issueLink('discord-A'), 'someone.else');
        assert.equal(send.code, 'not_eligible');
        assert.equal(h.sent.length, 0);
    });

    test('address outside the university domain is rejected', async () => {
        const send = await h.service.sendCode(h.issueLink('discord-A'), 'cs01234@gmail.com');
        assert.equal(send.code, 'invalid_address');
        assert.equal(h.sent.length, 0);
    });

    test('expired link is rejected', async () => {
        const token = h.issueLink('discord-A');
        await h.service.sendCode(token, 'cs01234');
        h.clock.now += TEN_MINUTES;

        assert.equal((await h.service.verifyCode(token, h.lastCode())).code, 'expired');
        assert.equal(h.repo.allUsers().length, 0);
    });

    test('reused link is rejected after a successful verification', async () => {
        const token = h.issueLink('discord-A');
        const { result } = await h.verify(token, 'cs01234');
        assert.equal(result.code, 'verified_student');

        assert.equal((await h.service.begin(token)).code, 'used');
        assert.equal((await h.service.verifyCode(token, h.lastCode())).code, 'used');
        assert.equal((await h.service.sendCode(token, 'cs01234')).code, 'used');
    });

    test('one university account cannot verify two Discord accounts', async () => {
        assert.equal((await h.verify(h.issueLink('discord-A'), 'cs01234')).result.code, 'verified_student');

        const { result } = await h.verify(h.issueLink('discord-B'), 'cs01234');

        assert.equal(result.code, 'uni_account_in_use');
        assert.deepEqual(h.discord.rolesOf('discord-B'), []);
        assert.equal(h.repo.allUsers().length, 1);
    });

    test('wrong codes: attempts are counted and the link is burned after the limit', async () => {
        const token = h.issueLink('discord-A');
        await h.service.sendCode(token, 'cs01234');
        const wrong = h.lastCode() === '000000' ? '111111' : '000000';

        for (let i = 1; i < EMAIL_LIMITS.maxAttempts; i++) {
            const r = await h.service.verifyCode(token, wrong);
            assert.equal(r.code, 'wrong_code');
            assert.equal(r.attemptsLeft, EMAIL_LIMITS.maxAttempts - i);
        }
        assert.equal((await h.service.verifyCode(token, wrong)).code, 'too_many_attempts');
        assert.equal((await h.service.verifyCode(token, h.lastCode())).code, 'used', 'even the right code no longer works');
        assert.equal(h.repo.allUsers().length, 0);
    });

    test('requesting a new code keeps the attempt count (no reset by resending)', async () => {
        const token = h.issueLink('discord-A');
        await h.service.sendCode(token, 'cs01234');
        for (let i = 0; i < EMAIL_LIMITS.maxAttempts - 1; i++) await h.service.verifyCode(token, 'abcdef');
        h.clock.now += EMAIL_LIMITS.resendCooldownMs;
        await h.service.sendCode(token, 'cs01234');

        assert.equal((await h.service.verifyCode(token, 'abcdef')).code, 'too_many_attempts');
    });

    test('resend cooldown', async () => {
        const token = h.issueLink('discord-A');
        assert.equal((await h.service.sendCode(token, 'cs01234')).code, 'code_sent');
        assert.equal((await h.service.sendCode(token, 'cs01234')).code, 'resend_too_soon');
        h.clock.now += EMAIL_LIMITS.resendCooldownMs;
        assert.equal((await h.service.sendCode(token, 'cs01234')).code, 'code_sent');
        assert.equal(h.sent.length, 2);
    });

    test('rate limit per target mailbox across Discord users', async () => {
        for (let i = 0; i < EMAIL_LIMITS.maxSendsPerTarget; i++) {
            const user = i % 2 ? 'discord-A' : 'discord-B';
            assert.equal((await h.service.sendCode(h.issueLink(user), 'cs01234')).code, 'code_sent');
        }
        assert.equal((await h.service.sendCode(h.issueLink('discord-A'), 'cs01234')).code, 'rate_limited');
        h.clock.now += EMAIL_LIMITS.windowMs;
        assert.equal((await h.service.sendCode(h.issueLink('discord-A'), 'cs01234')).code, 'code_sent');
    });

    test('rate limit per Discord user across new links', async () => {
        for (let i = 0; i < EMAIL_LIMITS.maxSendsPerUser; i++) {
            assert.equal((await h.service.sendCode(h.issueLink('discord-A'), `cs0000${i}`)).code, 'code_sent');
        }
        assert.equal((await h.service.sendCode(h.issueLink('discord-A'), 'cs09999')).code, 'rate_limited');
    });

    test('the code and address are not stored in plain text', async () => {
        const token = h.issueLink('discord-A');
        await h.service.sendCode(token, 'cs01234');
        const stored = JSON.stringify(h.repo.allStates());
        assert.ok(!stored.includes(h.lastCode()));
        assert.ok(!stored.includes('cs01234'));
    });

    test('SMTP failure is reported', async () => {
        h.mailer.failNext = true;
        assert.equal((await h.service.sendCode(h.issueLink('discord-A'), 'cs01234')).code, 'email_send_failed');
    });

    test('verifying before requesting a code asks for an address', async () => {
        assert.equal((await h.service.verifyCode(h.issueLink('discord-A'), '123456')).code, 'address_needed');
    });
});

describe('email policy', () => {
    const emailConfig = createEmailHarness().config.email;

    test('parseAddress', () => {
        assert.equal(parseAddress('cs01234', 'uowm.gr'), 'cs01234');
        assert.equal(parseAddress('cs01234@uowm.gr', 'uowm.gr'), 'cs01234');
        assert.equal(parseAddress('cs01234@evil.gr', 'uowm.gr'), null);
        assert.equal(parseAddress('cs01234@uowm.gr@evil.gr', 'uowm.gr'), null);
        assert.equal(parseAddress('a b', 'uowm.gr'), null);
        assert.equal(parseAddress('', 'uowm.gr'), null);
    });

    test('default student pattern accepts only cs followed by 4 to 6 digits', () => {
        const none = new Set();
        assert.equal(classifyAddress('cs05415', emailConfig, none).affiliation, 'student');
        assert.equal(classifyAddress('iscs05415', emailConfig, none).reason, 'wrong_department');
        assert.equal(classifyAddress('cs1', emailConfig, none).reason, 'not_eligible');
    });

    test('identity is keyed on the student number', () => {
        const config = createEmailHarness({ env: { EMAIL_STUDENT_PATTERN: '^(?:iscs|cs)(\\d{4,6})$' } }).config.email;
        const a = classifyAddress('iscs05415', config, new Set());
        const b = classifyAddress('cs05415', config, new Set());
        assert.equal(a.identityKey, b.identityKey);
    });

    test('faculty list file: comments, blank lines, full addresses and other domains', async () => {
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'faculty-')), 'faculty.txt');
        fs.writeFileSync(file, '# comment\n\nProf.One@uowm.gr\r\nprof.two  # inline\nother@example.com\n');
        assert.deepEqual([...(await loadFacultyLocals(file, 'uowm.gr'))].sort(), ['prof.one', 'prof.two']);
        assert.equal((await loadFacultyLocals(file + '.missing', 'uowm.gr')).size, 0);
    });

    test('maskAddress', () => {
        assert.equal(maskAddress('cs01234', 'uowm.gr'), 'cs0***4@uowm.gr');
        assert.equal(maskAddress('ab', 'uowm.gr'), 'a*b@uowm.gr');
    });

    test('console transport is refused on an https deployment', () => {
        assert.throws(
            () => createEmailHarness({ env: { PUBLIC_BASE_URL: 'https://verify.example.org' } }),
            /EMAIL_TRANSPORT=console/,
        );
    });
});
