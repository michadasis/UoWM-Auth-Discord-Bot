// Test harness: real verification and linking logic, in-memory repository (mirrors the
// PRIMARY KEY / UNIQUE rules of db/setup.sql), fake mailer and fake Discord.

const { loadEmailConfig } = require("../../src/lib/config");
const { createEmailVerification } = require("../../src/lib/emailVerification");
const { createLinker } = require("../../src/lib/linker");

const ROLE = { student: "role-student", professor: "role-professor", guest: "role-guest" };

function createMemoryRepository() {
    const challenges = new Map();
    const users = new Map();
    const guests = new Map();
    const sendLog = [];

    return {
        allUsers: () => [...users.values()].map((u) => ({ ...u })),
        allChallenges: () => [...challenges.values()].map((c) => ({ ...c })),
        insertGuest: (discordUserId, msgId) => guests.set(discordUserId, { discordUserId, msgId }),

        async getChallenge(id) {
            const c = challenges.get(id);
            return c ? { ...c } : null;
        },
        async saveChallenge(challenge) {
            challenges.set(challenge.discordUserId, { ...challenge });
        },
        async incrementAttempts(id) {
            const c = challenges.get(id);
            if (!c) return 0;
            c.attempts += 1;
            return c.attempts;
        },
        async deleteChallenge(id, codeHash) {
            const c = challenges.get(id);
            if (!c || (codeHash && c.codeHash !== codeHash)) return false;
            challenges.delete(id);
            return true;
        },
        async countEmailSends({ discordUserId, targetHash, since }) {
            const recent = sendLog.filter((e) => e.sentAt > since);
            return {
                byUser: recent.filter((e) => e.discordUserId === discordUserId).length,
                byTarget: recent.filter((e) => e.targetHash === targetHash).length,
            };
        },
        async logEmailSend(entry) {
            sendLog.push({ ...entry });
        },
        async findUserByDiscordId(id) {
            const u = users.get(id);
            return u ? { ...u } : null;
        },
        async findUserByUniHash(hash) {
            const u = [...users.values()].find((x) => x.uniIdHash === hash);
            return u ? { ...u } : null;
        },
        async insertUser({ discordUserId, uniIdHash, affiliation }) {
            if (users.has(discordUserId) || [...users.values()].some((u) => u.uniIdHash === uniIdHash)) return "duplicate";
            users.set(discordUserId, { discordUserId, uniIdHash, affiliation, verifiedAt: new Date() });
            return "inserted";
        },
        async deleteUser(id) {
            users.delete(id);
        },
        async getGuest(id) {
            const g = guests.get(id);
            return g ? { ...g } : null;
        },
        async deleteGuest(id) {
            guests.delete(id);
        },
    };
}

function createFakeDiscord(memberIds) {
    const members = new Map(memberIds.map((id) => [id, new Set()]));
    const fake = {
        dms: [],
        adminMessages: [],
        deletedMessages: [],
        failAddRole: false,
        addMember: (id, roles = []) => members.set(id, new Set(roles)),
        rolesOf: (id) => [...(members.get(id) ?? [])],
        async getMember(id) {
            return members.has(id) ? { roles: fake.rolesOf(id) } : null;
        },
        async addRole(id, roleId) {
            if (fake.failAddRole) throw new Error("simulated Discord failure");
            members.get(id).add(roleId);
        },
        async removeRole(id, roleId) {
            members.get(id)?.delete(roleId);
        },
        async sendDM(id, embed) {
            fake.dms.push({ userId: id, embed });
        },
        async adminLog(message) {
            fake.adminMessages.push(message);
        },
        async deleteMessage(channelId, messageId) {
            fake.deletedMessages.push({ channelId, messageId });
        },
    };
    return fake;
}

const silentLogger = { log() {}, info() {}, warn() {}, error() {} };

function createHarness({ env = {}, members = ["discord-A", "discord-B"], faculty = ["prof.example"] } = {}) {
    const config = loadEmailConfig({
        EMAIL_TRANSPORT: "console",
        UNI_ID_HASH_SECRET: "test-hash-secret-that-is-long-enough-000",
        ...env,
    });
    const repo = createMemoryRepository();
    const discord = createFakeDiscord(members);
    const clock = { now: Date.now() };
    const sent = [];
    const mailer = {
        failNext: false,
        async send(message) {
            if (mailer.failNext) {
                mailer.failNext = false;
                throw new Error("simulated SMTP failure");
            }
            sent.push(message);
        },
    };
    const linker = createLinker({
        repo,
        discord,
        roles: {
            studentRoleId: ROLE.student,
            professorRoleId: ROLE.professor,
            guestRoleId: ROLE.guest,
            guestChannelId: "chan-guest",
            adminRoleId: "role-admin",
            moderatorRoleId: "role-mod",
        },
        logger: silentLogger,
    });
    const service = createEmailVerification({
        config,
        repo,
        mailer,
        loadFacultyLocals: async () => new Set(faculty),
        linker,
        now: () => clock.now,
        logger: silentLogger,
    });

    const lastCode = () => sent.at(-1).text.match(/(\d{6})/)[1];

    // Happy path: /auth, read the mailbox, submit the code.
    async function verify(discordUserId, address) {
        const request = await service.requestCode(discordUserId, address);
        if (request.code !== "code_sent") return { request, result: request };
        return { request, result: await service.submitCode(discordUserId, lastCode()) };
    }

    return { config, repo, discord, clock, sent, mailer, service, lastCode, verify };
}

module.exports = { createHarness, ROLE };
