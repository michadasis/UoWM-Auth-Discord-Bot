import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// The /auth link carries a random token; the DB only stores its SHA-256.
// The bot computes the same hash in bot/src/lib/authState.js.
export function hashStateToken(token) {
    return createHash('sha256').update(token, 'utf8').digest('hex');
}

// Keyed hash (HMAC) of the university identifier. A secret key instead of a
// per-row salt, because we must look rows up by it to enforce "one university
// account per Discord account", while still making the stored value useless
// without the key.
export function hashUniversityId(secret, issuer, subject) {
    return createHmac('sha256', secret).update(`${issuer}\n${subject}`, 'utf8').digest('hex');
}

export function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
