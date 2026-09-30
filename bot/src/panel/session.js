// Signed, stateless session cookies. The cookie holds { uid, csrf, exp } as base64url JSON plus an
// HMAC-SHA256 signature, so it cannot be forged or edited without PANEL_SESSION_SECRET. Nothing
// secret is stored in it, and access is re-checked against Discord roles on every request anyway.

const crypto = require("crypto");

const SESSION_COOKIE = "__Host-panel_session";
const STATE_COOKIE = "__Host-panel_oauth";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;

const b64 = (buffer) => Buffer.from(buffer).toString("base64url");

function hmac(secret, data) {
    return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

function sign(secret, payload) {
    const body = b64(JSON.stringify(payload));
    return `${body}.${hmac(secret, body)}`;
}

// The payload, or null if the value is missing, tampered with or expired.
function verify(secret, value, now = Date.now()) {
    if (typeof value !== "string") return null;
    const dot = value.lastIndexOf(".");
    if (dot <= 0) return null;
    const body = value.slice(0, dot);
    const expected = Buffer.from(hmac(secret, body));
    const given = Buffer.from(value.slice(dot + 1));
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    let payload;
    try {
        payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    } catch {
        return null;
    }
    if (!payload || typeof payload.exp !== "number" || payload.exp <= now) return null;
    return payload;
}

const randomToken = () => crypto.randomBytes(32).toString("base64url");

function parseCookies(header) {
    const cookies = {};
    for (const part of String(header || "").split(";")) {
        const eq = part.indexOf("=");
        if (eq < 0) continue;
        const name = part.slice(0, eq).trim();
        if (name && !(name in cookies)) cookies[name] = part.slice(eq + 1).trim();
    }
    return cookies;
}

// __Host- cookies must be Secure, Path=/ and have no Domain: the browser then only sends them back
// to this exact host over HTTPS.
function cookie(name, value, maxAgeMs) {
    const age = Math.max(0, Math.floor(maxAgeMs / 1000));
    return `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
}

const clearCookie = (name) => cookie(name, "", 0);

// Compares two strings in constant time.
function safeEqual(a, b) {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = {
    SESSION_COOKIE, STATE_COOKIE, SESSION_TTL_MS, STATE_TTL_MS,
    sign, verify, randomToken, parseCookies, cookie, clearCookie, safeEqual,
};
