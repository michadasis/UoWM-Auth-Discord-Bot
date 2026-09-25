import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, ROLE, CHANNEL } from './helpers/harness.js';

const TEN_MINUTES = 10 * 60 * 1000;

describe('verification flow against the mock OIDC provider', () => {
    let h;

    beforeEach(async () => {
        h = await createHarness();
    });

    afterEach(async () => {
        await h.close();
    });

    test('student of the Department of Informatics gets the student role', async () => {
        const { result } = await h.verify(h.issueLink('discord-A'), 'student');

        assert.equal(result.code, 'verified_student');
        assert.deepEqual(h.discord.rolesOf('discord-A'), [ROLE.student]);

        const [row] = h.repo.allUsers();
        assert.deepEqual(Object.keys(row).sort(), ['affiliation', 'discordUserId', 'uniIdHash', 'verifiedAt']);
        assert.equal(row.discordUserId, 'discord-A');
        assert.equal(row.affiliation, 'student');
        assert.match(row.uniIdHash, /^[0-9a-f]{64}$/);
        assert.ok(!JSON.stringify(row).includes('ics00001'), 'plain username must not be stored');
        assert.ok(!JSON.stringify(row).includes('mock-sub-student-001'), 'plain subject must not be stored');

        const dm = h.discord.dms.find((d) => d.userId === 'discord-A');
        assert.equal(dm.embed.title, 'Επιτυχής επιβεβαίωση');
    });

    test('faculty gets the professor role and admins are pinged', async () => {
        const { result } = await h.verify(h.issueLink('discord-A'), 'faculty');

        assert.equal(result.code, 'verified_professor');
        assert.deepEqual(h.discord.rolesOf('discord-A'), [ROLE.professor]);
        assert.equal(h.repo.allUsers()[0].affiliation, 'faculty');
        const log = h.discord.channelMessages.find((m) => m.channelId === CHANNEL.admin);
        assert.match(log.message.content, /<@&role-admin>/);
    });

    test('administrative staff gets the professor role', async () => {
        const { result } = await h.verify(h.issueLink('discord-A'), 'staff');

        assert.equal(result.code, 'verified_professor');
        assert.deepEqual(h.discord.rolesOf('discord-A'), [ROLE.professor]);
        assert.equal(h.repo.allUsers()[0].affiliation, 'staff');
    });

    test('outsider without student or staff affiliation is rejected', async () => {
        const { result } = await h.verify(h.issueLink('discord-A'), 'outsider');

        assert.equal(result.code, 'not_eligible');
        assert.deepEqual(h.discord.rolesOf('discord-A'), []);
        assert.equal(h.repo.allUsers().length, 0);
        assert.equal(h.discord.dms[0].embed.title, 'Δεν είναι δυνατή η επιβεβαίωση');
    });

    test('student of another institution is rejected', async () => {
        const { result } = await h.verify(h.issueLink('discord-A'), 'foreign-student');

        assert.equal(result.code, 'wrong_home_org');
        assert.equal(h.repo.allUsers().length, 0);
    });

    test('student of another UoWM department is rejected', async () => {
        const { result } = await h.verify(h.issueLink('discord-A'), 'student-other-dept');

        assert.equal(result.code, 'wrong_department');
        assert.deepEqual(h.discord.rolesOf('discord-A'), []);
        assert.equal(h.repo.allUsers().length, 0);
    });

    test('expired link is rejected before reaching the login page', async () => {
        const token = h.issueLink('discord-A');
        h.clock.now += TEN_MINUTES;

        const { start } = await h.verify(token, 'student');

        assert.equal(start.code, 'expired');
        assert.equal(h.repo.allUsers().length, 0);
    });

    test('link that expires during login is rejected at the callback', async () => {
        const token = h.issueLink('discord-A');
        const { result } = await h.verify(token, 'student', {
            beforeCallback: () => {
                h.clock.now += TEN_MINUTES + 1;
            },
        });

        assert.equal(result.code, 'expired');
        assert.deepEqual(h.discord.rolesOf('discord-A'), []);
        assert.equal(h.repo.allUsers().length, 0);
    });

    test('reused link is rejected at /login and at the callback', async () => {
        const token = h.issueLink('discord-A');
        const first = await h.verify(token, 'student');
        assert.equal(first.result.code, 'verified_student');

        const again = await h.service.startLogin(token);
        assert.equal(again.code, 'used');

        const replay = await h.service.completeLogin({ callbackUrl: first.callbackUrl, cookieToken: token });
        assert.equal(replay.code, 'used');
        assert.equal(h.repo.allUsers().length, 1);
    });

    test('concurrent callbacks for the same link: only one is processed', async () => {
        const token = h.issueLink('discord-A');
        const start = await h.service.startLogin(token);
        const callbackUrl = await h.loginAtIdp(start.redirectUrl, 'student');

        const results = await Promise.all([
            h.service.completeLogin({ callbackUrl, cookieToken: token }),
            h.service.completeLogin({ callbackUrl, cookieToken: token }),
        ]);

        assert.deepEqual(results.map((r) => r.code).sort(), ['used', 'verified_student']);
    });

    test('one university account cannot verify two Discord accounts', async () => {
        const a = await h.verify(h.issueLink('discord-A'), 'student');
        assert.equal(a.result.code, 'verified_student');

        const b = await h.verify(h.issueLink('discord-B'), 'student');

        assert.equal(b.result.code, 'uni_account_in_use');
        assert.deepEqual(h.discord.rolesOf('discord-B'), []);
        assert.deepEqual(h.discord.rolesOf('discord-A'), [ROLE.student]);
        assert.equal(h.repo.allUsers().length, 1);
        assert.equal(h.repo.allUsers()[0].discordUserId, 'discord-A');

        const alert = h.discord.channelMessages.find((m) => m.message.embeds[0].title.includes('δεύτερου λογαριασμού'));
        assert.ok(alert, 'admins are alerted');
        assert.ok(h.discord.dms.some((d) => d.userId === 'discord-A' && d.embed.title === 'Ειδοποίηση ασφαλείας'), 'owner is warned');
    });

    test('a Discord account already linked to another university account is rejected', async () => {
        await h.verify(h.issueLink('discord-A'), 'student');
        const { result } = await h.verify(h.issueLink('discord-A'), 'faculty');

        assert.equal(result.code, 'discord_already_linked');
        assert.deepEqual(h.discord.rolesOf('discord-A'), [ROLE.student]);
    });

    test('verifying again with the same university account reports already verified', async () => {
        await h.verify(h.issueLink('discord-A'), 'student');
        const { result } = await h.verify(h.issueLink('discord-A'), 'student');

        assert.equal(result.code, 'already_verified');
    });

    test('callback in a different browser (missing cookie) is rejected without consuming the link', async () => {
        const token = h.issueLink('discord-A');
        const start = await h.service.startLogin(token);
        const callbackUrl = await h.loginAtIdp(start.redirectUrl, 'student');

        const foreign = await h.service.completeLogin({ callbackUrl, cookieToken: undefined });
        assert.equal(foreign.code, 'session_mismatch');

        const own = await h.service.completeLogin({ callbackUrl, cookieToken: token });
        assert.equal(own.code, 'verified_student');
    });

    test('tampered or unknown state is rejected', async () => {
        assert.equal((await h.service.startLogin('not-a-token')).code, 'invalid_link');
        assert.equal((await h.service.startLogin('A'.repeat(43))).code, 'invalid_link');
    });

    test('user cancelling at the login page gets provider_error and the link is consumed', async () => {
        const token = h.issueLink('discord-A');
        await h.service.startLogin(token);
        const callbackUrl = new URL(`${h.config.redirectUri}?error=access_denied&state=${token}`);

        const result = await h.service.completeLogin({ callbackUrl, cookieToken: token });

        assert.equal(result.code, 'provider_error');
        assert.equal((await h.service.startLogin(token)).code, 'used');
    });

    test('user who is not a member of the server is rejected', async () => {
        const { result } = await h.verify(h.issueLink('discord-stranger'), 'student');

        assert.equal(result.code, 'not_in_guild');
        assert.equal(h.repo.allUsers().length, 0);
    });

    test('verified guest loses the guest role and guest record', async () => {
        h.discord.addMember('discord-A', [ROLE.guest]);
        h.repo.insertGuest('discord-A', 'msg-1');

        const { result } = await h.verify(h.issueLink('discord-A'), 'student');

        assert.equal(result.code, 'verified_student');
        assert.deepEqual(h.discord.rolesOf('discord-A'), [ROLE.student]);
        assert.equal(await h.repo.getGuest('discord-A'), null);
        assert.deepEqual(h.discord.deletedMessages, [{ channelId: CHANNEL.guest, messageId: 'msg-1' }]);
    });

    test('database row is rolled back if the Discord role cannot be added', async () => {
        h.discord.failAddRole = true;
        const { result } = await h.verify(h.issueLink('discord-A'), 'student');

        assert.equal(result.code, 'error');
        assert.equal(h.repo.allUsers().length, 0);
    });
});
