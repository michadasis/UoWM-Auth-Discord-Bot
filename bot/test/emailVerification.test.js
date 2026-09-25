const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createHarness, ROLE } = require("./helpers/harness");
const { LIMITS } = require("../src/lib/emailVerification");
const { parseAddress, classifyAddress, loadFacultyLocals, maskAddress } = require("../src/lib/emailPolicy");
const { loadEmailConfig } = require("../src/lib/config");
const { messages } = require("../src/lib/messages");

describe("email code verification", () => {
    let h;

    beforeEach(() => {
        h = createHarness();
    });

    test("Informatics student gets the student role", async () => {
        const { request, result } = await h.verify("discord-A", "cs01234@uowm.gr");

        assert.equal(request.code, "code_sent");
        assert.equal(request.maskedAddress, "cs0***4@uowm.gr");
        assert.equal(h.sent[0].to, "cs01234@uowm.gr");
        assert.equal(result.code, "verified_student");
        assert.deepEqual(h.discord.rolesOf("discord-A"), [ROLE.student]);

        const [row] = h.repo.allUsers();
        assert.deepEqual(Object.keys(row).sort(), ["affiliation", "discordUserId", "uniIdHash", "verifiedAt"]);
        assert.match(row.uniIdHash, /^[0-9a-f]{64}$/);
        assert.ok(!JSON.stringify(row).includes("01234"), "student number must not be stored");
        assert.equal(h.repo.allChallenges().length, 0, "challenge is consumed");
    });

    test("username alone and any case are accepted", async () => {
        assert.equal((await h.verify("discord-A", "  CS01234 ")).result.code, "verified_student");
    });

    test("faculty on the list gets the professor role and admins are pinged", async () => {
        const { result } = await h.verify("discord-A", "prof.example@uowm.gr");

        assert.equal(result.code, "verified_professor");
        assert.deepEqual(h.discord.rolesOf("discord-A"), [ROLE.professor]);
        assert.equal(h.repo.allUsers()[0].affiliation, "faculty");
        assert.match(h.discord.adminMessages.at(-1).content, /<@&role-admin>/);
    });

    test("outsider (not a student pattern, not on the faculty list) is rejected without email", async () => {
        assert.equal((await h.service.requestCode("discord-A", "someone.else@uowm.gr")).code, "not_eligible");
        assert.equal(h.sent.length, 0);
    });

    test("student of another department is rejected without email", async () => {
        assert.equal((await h.service.requestCode("discord-A", "psy01234")).code, "wrong_department");
        assert.equal((await h.service.requestCode("discord-A", "iscs01234")).code, "wrong_department");
        assert.equal(h.sent.length, 0);
    });

    test("address outside the university domain is rejected", async () => {
        assert.equal((await h.service.requestCode("discord-A", "cs01234@gmail.com")).code, "invalid_address");
        assert.equal(h.sent.length, 0);
    });

    test("expired code is rejected", async () => {
        await h.service.requestCode("discord-A", "cs01234");
        h.clock.now += LIMITS.codeTtlMs;

        assert.equal((await h.service.submitCode("discord-A", h.lastCode())).code, "expired_code");
        assert.equal((await h.service.submitCode("discord-A", h.lastCode())).code, "no_pending_code");
        assert.equal(h.repo.allUsers().length, 0);
    });

    test("reused code is rejected", async () => {
        const { result } = await h.verify("discord-A", "cs01234");
        assert.equal(result.code, "verified_student");

        assert.equal((await h.service.submitCode("discord-A", h.lastCode())).code, "no_pending_code");
        assert.equal(h.repo.allUsers().length, 1);
    });

    test("concurrent submissions of the same code: only one is processed", async () => {
        await h.service.requestCode("discord-A", "cs01234");
        const code = h.lastCode();
        const results = await Promise.all([h.service.submitCode("discord-A", code), h.service.submitCode("discord-A", code)]);
        assert.deepEqual(results.map((r) => r.code).sort(), ["no_pending_code", "verified_student"]);
    });

    test("a code only works for the Discord user who requested it", async () => {
        await h.service.requestCode("discord-A", "cs01234");
        assert.equal((await h.service.submitCode("discord-B", h.lastCode())).code, "no_pending_code");
        assert.deepEqual(h.discord.rolesOf("discord-B"), []);
    });

    test("one university account cannot verify two Discord accounts", async () => {
        assert.equal((await h.verify("discord-A", "cs01234")).result.code, "verified_student");

        const { result } = await h.verify("discord-B", "cs01234@uowm.gr");

        assert.equal(result.code, "uni_account_in_use");
        assert.deepEqual(h.discord.rolesOf("discord-B"), []);
        assert.deepEqual(h.discord.rolesOf("discord-A"), [ROLE.student]);
        assert.equal(h.repo.allUsers().length, 1);
        assert.ok(h.discord.adminMessages.some((m) => m.embeds[0].title.includes("δεύτερου λογαριασμού")));
        assert.ok(h.discord.dms.some((d) => d.userId === "discord-A" && d.embed.title === "Ειδοποίηση ασφαλείας"));
    });

    test("an already verified Discord account cannot request a new code", async () => {
        await h.verify("discord-A", "cs01234");
        assert.equal((await h.service.requestCode("discord-A", "cs05678")).code, "discord_verified");
    });

    test("wrong codes: the code is cancelled after the attempt limit", async () => {
        await h.service.requestCode("discord-A", "cs01234");
        const right = h.lastCode();
        const wrong = right === "000000" ? "111111" : "000000";

        for (let i = 1; i < LIMITS.maxAttempts; i++) {
            const r = await h.service.submitCode("discord-A", wrong);
            assert.equal(r.code, "wrong_code");
            assert.equal(r.attemptsLeft, LIMITS.maxAttempts - i);
        }
        assert.equal((await h.service.submitCode("discord-A", wrong)).code, "too_many_attempts");
        assert.equal((await h.service.submitCode("discord-A", right)).code, "no_pending_code", "even the right code no longer works");
        assert.equal(h.repo.allUsers().length, 0);
    });

    test("requesting a new code does not reset wrong attempts", async () => {
        await h.service.requestCode("discord-A", "cs01234");
        for (let i = 0; i < LIMITS.maxAttempts - 1; i++) await h.service.submitCode("discord-A", "abcdef");
        h.clock.now += LIMITS.resendCooldownMs;
        await h.service.requestCode("discord-A", "cs01234");

        assert.equal((await h.service.submitCode("discord-A", "abcdef")).code, "too_many_attempts");
    });

    test("only the newest code is valid", async () => {
        await h.service.requestCode("discord-A", "cs01234");
        const first = h.lastCode();
        h.clock.now += LIMITS.resendCooldownMs;
        await h.service.requestCode("discord-A", "cs01234");
        if (first !== h.lastCode()) {
            assert.equal((await h.service.submitCode("discord-A", first)).code, "wrong_code");
        }
        assert.equal((await h.service.submitCode("discord-A", h.lastCode())).code, "verified_student");
    });

    test("resend cooldown", async () => {
        assert.equal((await h.service.requestCode("discord-A", "cs01234")).code, "code_sent");
        assert.equal((await h.service.requestCode("discord-A", "cs01234")).code, "resend_too_soon");
        h.clock.now += LIMITS.resendCooldownMs;
        assert.equal((await h.service.requestCode("discord-A", "cs01234")).code, "code_sent");
    });

    test("rate limit per mailbox across Discord users", async () => {
        for (let i = 0; i < LIMITS.maxSendsPerTarget; i++) {
            assert.equal((await h.service.requestCode(i % 2 ? "discord-A" : "discord-B", "cs01234")).code, "code_sent");
            h.clock.now += LIMITS.resendCooldownMs;
        }
        assert.equal((await h.service.requestCode("discord-A", "cs01234")).code, "rate_limited");
        h.clock.now += LIMITS.windowMs;
        assert.equal((await h.service.requestCode("discord-A", "cs01234")).code, "code_sent");
    });

    test("rate limit per Discord user across mailboxes", async () => {
        for (let i = 0; i < LIMITS.maxSendsPerUser; i++) {
            assert.equal((await h.service.requestCode("discord-A", `cs0000${i}`)).code, "code_sent");
            h.clock.now += LIMITS.resendCooldownMs;
        }
        assert.equal((await h.service.requestCode("discord-A", "cs09999")).code, "rate_limited");
    });

    test("the code and the address are not stored in plain text", async () => {
        await h.service.requestCode("discord-A", "cs01234");
        const stored = JSON.stringify(h.repo.allChallenges());
        assert.ok(!stored.includes(h.lastCode()));
        assert.ok(!stored.includes("cs01234"));
    });

    test("submitting without requesting a code", async () => {
        assert.equal((await h.service.submitCode("discord-A", "123456")).code, "no_pending_code");
    });

    test("SMTP failure is reported", async () => {
        h.mailer.failNext = true;
        assert.equal((await h.service.requestCode("discord-A", "cs01234")).code, "email_send_failed");
    });

    test("user who is not a member of the server is rejected", async () => {
        assert.equal((await h.verify("discord-stranger", "cs01234")).result.code, "not_in_guild");
        assert.equal(h.repo.allUsers().length, 0);
    });

    test("verified guest loses the guest role and guest record", async () => {
        h.discord.addMember("discord-A", [ROLE.guest]);
        h.repo.insertGuest("discord-A", "msg-1");

        assert.equal((await h.verify("discord-A", "cs01234")).result.code, "verified_student");
        assert.deepEqual(h.discord.rolesOf("discord-A"), [ROLE.student]);
        assert.equal(await h.repo.getGuest("discord-A"), null);
        assert.deepEqual(h.discord.deletedMessages, [{ channelId: "chan-guest", messageId: "msg-1" }]);
    });

    test("database row is rolled back if the role cannot be added", async () => {
        h.discord.failAddRole = true;
        assert.equal((await h.verify("discord-A", "cs01234")).result.code, "error");
        assert.equal(h.repo.allUsers().length, 0);
    });
});

describe("email policy and config", () => {
    const config = loadEmailConfig({ EMAIL_TRANSPORT: "console", UNI_ID_HASH_SECRET: "x".repeat(32) });

    test("parseAddress", () => {
        assert.equal(parseAddress("cs01234", "uowm.gr"), "cs01234");
        assert.equal(parseAddress("cs01234@uowm.gr", "uowm.gr"), "cs01234");
        assert.equal(parseAddress("cs01234@evil.gr", "uowm.gr"), null);
        assert.equal(parseAddress("cs01234@uowm.gr@evil.gr", "uowm.gr"), null);
        assert.equal(parseAddress("a b", "uowm.gr"), null);
        assert.equal(parseAddress("", "uowm.gr"), null);
    });

    test("default student pattern: cs followed by 4 to 6 digits", () => {
        const none = new Set();
        assert.equal(classifyAddress("cs05415", config, none).affiliation, "student");
        assert.equal(classifyAddress("cs1", config, none).reason, "not_eligible");
    });

    test("identity is keyed on the student number", () => {
        const custom = loadEmailConfig({ EMAIL_TRANSPORT: "console", UNI_ID_HASH_SECRET: "x".repeat(32), EMAIL_STUDENT_PATTERN: "^(?:iscs|cs)(\\d{4,6})$" });
        assert.equal(classifyAddress("iscs05415", custom, new Set()).identityKey, classifyAddress("cs05415", custom, new Set()).identityKey);
    });

    test("faculty list file: comments, blank lines, full addresses and other domains", async () => {
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "faculty-")), "faculty.txt");
        fs.writeFileSync(file, "# comment\n\nProf.One@uowm.gr\r\nprof.two  # inline\nother@example.com\n");
        assert.deepEqual([...(await loadFacultyLocals(file, "uowm.gr"))].sort(), ["prof.one", "prof.two"]);
        assert.equal((await loadFacultyLocals(`${file}.missing`, "uowm.gr")).size, 0);
    });

    test("maskAddress", () => {
        assert.equal(maskAddress("cs01234", "uowm.gr"), "cs0***4@uowm.gr");
        assert.equal(maskAddress("ab", "uowm.gr"), "a*b@uowm.gr");
    });

    test("SMTP settings are required unless the console transport is chosen", () => {
        assert.throws(() => loadEmailConfig({ UNI_ID_HASH_SECRET: "x".repeat(32) }), /SMTP_HOST is required/);
        assert.throws(() => loadEmailConfig({ EMAIL_TRANSPORT: "console", UNI_ID_HASH_SECRET: "short" }), /at least 32/);
    });

    test("every result code has a Greek message", () => {
        const codes = ["verified_student", "verified_professor", "discord_verified", "already_verified", "discord_already_linked",
            "uni_account_in_use", "invalid_address", "wrong_department", "not_eligible", "not_in_guild", "resend_too_soon",
            "rate_limited", "email_send_failed", "wrong_code", "too_many_attempts", "no_pending_code", "expired_code", "error"];
        for (const code of codes) assert.ok(messages[code]?.title && messages[code]?.text, code);
    });
});
