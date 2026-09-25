// In-memory implementation of the repository interface in src/lib/server/repository.js,
// including the PRIMARY KEY / UNIQUE semantics of db/setup.sql.

export function createMemoryRepository() {
    const states = new Map();
    const users = new Map();
    const guests = new Map();

    return {
        // Test-only: what the bot's /auth command inserts.
        insertState(stateHash, { discordUserId, createdAt, expiresAt }) {
            states.set(stateHash, { discordUserId, codeVerifier: null, nonce: null, createdAt, expiresAt, usedAt: null });
        },
        insertGuest(discordUserId, msgId) {
            guests.set(discordUserId, { discordUserId, msgId });
        },
        allUsers() {
            return [...users.values()].map((u) => ({ ...u }));
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
