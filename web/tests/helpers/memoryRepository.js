// In-memory implementation of the repository interface in src/lib/server/repository.js,
// including the PRIMARY KEY / UNIQUE semantics of db/setup.sql.

export function createMemoryRepository() {
    const states = new Map();
    const users = new Map();
    const guests = new Map();
    const sendLog = [];

    return {
        // Test-only: what the bot's /auth command inserts.
        insertState(stateHash, { discordUserId, createdAt, expiresAt }) {
            states.set(stateHash, {
                discordUserId,
                codeVerifier: null,
                nonce: null,
                createdAt,
                expiresAt,
                usedAt: null,
                emailUniIdHash: null,
                emailAffiliation: null,
                emailCodeHash: null,
                emailSentAt: null,
                emailAttempts: 0,
            });
        },
        insertGuest(discordUserId, msgId) {
            guests.set(discordUserId, { discordUserId, msgId });
        },
        allUsers() {
            return [...users.values()].map((u) => ({ ...u }));
        },
        allStates() {
            return [...states.values()].map((s) => ({ ...s }));
        },

        async getState(stateHash) {
            const s = states.get(stateHash);
            return s ? { ...s } : null;
        },
        async setStateChecks(stateHash, codeVerifier, nonce) {
            const s = states.get(stateHash);
            if (!s || s.codeVerifier !== null || s.usedAt !== null) return false;
            Object.assign(s, { codeVerifier, nonce });
            return true;
        },
        async claimState(stateHash, now) {
            const s = states.get(stateHash);
            if (!s || s.usedAt !== null || s.expiresAt <= now) return false;
            s.usedAt = now;
            return true;
        },
        async setEmailChallenge(stateHash, { uniIdHash, affiliation, codeHash, sentAt }) {
            const s = states.get(stateHash);
            if (!s || s.usedAt !== null) return;
            Object.assign(s, { emailUniIdHash: uniIdHash, emailAffiliation: affiliation, emailCodeHash: codeHash, emailSentAt: sentAt });
        },
        async incrementEmailAttempts(stateHash) {
            const s = states.get(stateHash);
            if (!s) return 0;
            s.emailAttempts += 1;
            return s.emailAttempts;
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
        async findUserByDiscordId(discordUserId) {
            const u = users.get(discordUserId);
            return u ? { ...u } : null;
        },
        async findUserByUniHash(uniIdHash) {
            const u = [...users.values()].find((x) => x.uniIdHash === uniIdHash);
            return u ? { ...u } : null;
        },
        async insertUser({ discordUserId, uniIdHash, affiliation }) {
            if (users.has(discordUserId) || [...users.values()].some((u) => u.uniIdHash === uniIdHash)) return 'duplicate';
            users.set(discordUserId, { discordUserId, uniIdHash, affiliation, verifiedAt: new Date() });
            return 'inserted';
        },
        async deleteUser(discordUserId) {
            users.delete(discordUserId);
        },
        async getGuest(discordUserId) {
            const g = guests.get(discordUserId);
            return g ? { ...g } : null;
        },
        async deleteGuest(discordUserId) {
            guests.delete(discordUserId);
        },
    };
}
