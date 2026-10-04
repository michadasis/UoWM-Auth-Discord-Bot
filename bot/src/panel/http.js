// Small HTTP helpers shared by the panel's routes.

const SECURITY_HEADERS = {
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' https:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=15552000",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cache-Control": "no-store",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "X-Robots-Tag": "noindex, nofollow",
};

// At most `limit` requests per IP per window, for the login routes.
function rateLimiter(limit, windowMs) {
    const hits = new Map();
    return (ip, now = Date.now()) => {
        const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
        recent.push(now);
        hits.set(ip, recent);
        if (hits.size > 5000) hits.clear(); // memory guard
        return recent.length <= limit;
    };
}

function send(res, status, body, headers = {}) {
    res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8", ...headers });
    res.end(body);
}

function redirect(res, location, cookies = []) {
    res.writeHead(303, { ...SECURITY_HEADERS, Location: location, "Set-Cookie": cookies });
    res.end();
}

function readForm(req, maxBytes = 4096) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
                reject(new Error("body too large"));
                req.destroy();
            } else chunks.push(chunk);
        });
        req.on("end", () => resolve(new URLSearchParams(Buffer.concat(chunks).toString("utf8"))));
        req.on("error", reject);
    });
}

// POSTs must come from a page of the panel itself (CSRF defence in depth, next to the token).
function sameOrigin(req, origin) {
    const source = req.headers.origin || req.headers.referer;
    if (!source) return false;
    try {
        return new URL(source).origin === origin;
    } catch {
        return false;
    }
}

// deps: { client, pool, config, fetchUser }. config: { baseUrl, clientId, clientSecret, sessionSecret,
// guildId, adminRoleId, moderatorRoleId }.

module.exports = { SECURITY_HEADERS, rateLimiter, send, redirect, readForm, sameOrigin };
