// The admin panel: a small HTTPS server inside the bot process, so it shares the Discord client
// and the database. Phase 1: login with Discord, access control and an overview page.

const fs = require("fs");
const path = require("path");
const https = require("https");
const pages = require("./pages");
const session = require("./session");
const oauth = require("./discordOAuth");
const access = require("./access");

const SECURITY_HEADERS = {
    "Content-Security-Policy": "default-src 'none'; style-src 'self'; img-src 'self' https://cdn.discordapp.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=15552000",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cache-Control": "no-store",
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
function createHandler({ client, pool, config, fetchUser = oauth.fetchUser }) {
    const origin = new URL(config.baseUrl).origin;
    const redirectUri = `${origin}/auth/callback`;
    const loginLimit = rateLimiter(20, 10 * 60 * 1000);
    const guild = () => client.guilds.fetch(config.guildId);

    // The logged-in panel user, or null. Also re-checks the role on every request.
    async function currentUser(req) {
        const cookies = session.parseCookies(req.headers.cookie);
        const data = session.verify(config.sessionSecret, cookies[session.SESSION_COOKIE]);
        if (!data) return { state: "anonymous" };
        const member = await access.fetchMember(await guild(), data.uid);
        if (!access.canUsePanel(member, config)) return { state: "forbidden" };
        return { state: "ok", member, csrf: data.csrf };
    }

    async function overview() {
        const rows = await pool.query("SELECT affiliation, COUNT(*) AS n FROM users GROUP BY affiliation");
        const count = (a) => Number(rows.find((r) => r.affiliation === a)?.n ?? 0);
        const guests = Number((await pool.query("SELECT COUNT(*) AS n FROM guests"))[0].n);
        const g = await guild();
        const since = client.readyTimestamp ? new Date(client.readyTimestamp) : new Date();
        return {
            students: count("student"),
            faculty: count("faculty"),
            staff: count("staff"),
            guests,
            verified: count("student") + count("faculty") + count("staff"),
            guildName: g.name,
            guildMembers: g.memberCount,
            ping: Math.round(client.ws.ping),
            onlineSince: since.toLocaleString("el-GR", { timeZone: "Europe/Athens", dateStyle: "short", timeStyle: "short" }),
        };
    }

    const routes = {
        "GET /panel.css": async (req, res) => send(res, 200, pages.CSS, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=3600" }),

        "GET /login": async (req, res) => {
            const who = await currentUser(req);
            if (who.state === "ok") return redirect(res, "/");
            return send(res, 200, pages.loginPage());
        },

        "GET /auth/start": async (req, res, ip) => {
            if (!loginLimit(ip)) return send(res, 429, pages.messagePage("Πολλές προσπάθειες", "Δοκιμάστε ξανά σε λίγα λεπτά."));
            const state = session.randomToken();
            const stateCookie = session.cookie(session.STATE_COOKIE, session.sign(config.sessionSecret, { state, exp: Date.now() + session.STATE_TTL_MS }), session.STATE_TTL_MS);
            return redirect(res, oauth.authorizeUrl({ clientId: config.clientId, redirectUri, state }), [stateCookie]);
        },

        "GET /auth/callback": async (req, res, ip, url) => {
            if (!loginLimit(ip)) return send(res, 429, pages.messagePage("Πολλές προσπάθειες", "Δοκιμάστε ξανά σε λίγα λεπτά."));
            const clearState = session.clearCookie(session.STATE_COOKIE);
            if (url.searchParams.get("error")) return redirect(res, "/login", [clearState]);

            const cookies = session.parseCookies(req.headers.cookie);
            const saved = session.verify(config.sessionSecret, cookies[session.STATE_COOKIE]);
            const state = url.searchParams.get("state");
            const code = url.searchParams.get("code");
            if (!saved || !state || !code || !session.safeEqual(saved.state, state)) {
                return send(res, 400, pages.messagePage("Η σύνδεση έληξε", "Ξεκινήστε τη σύνδεση από την αρχή."), { "Set-Cookie": [clearState] });
            }

            const user = await fetchUser({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri, code });
            access.forget(user.id);
            const member = await access.fetchMember(await guild(), user.id);
            if (!access.canUsePanel(member, config)) {
                console.log(`Panel: refused login for ${user.id}`);
                return send(res, 403, pages.forbiddenPage(), { "Set-Cookie": [clearState] });
            }

            console.log(`Panel: ${member.user.tag} (${user.id}) logged in`);
            const value = session.sign(config.sessionSecret, { uid: user.id, csrf: session.randomToken(), exp: Date.now() + session.SESSION_TTL_MS });
            return redirect(res, "/", [clearState, session.cookie(session.SESSION_COOKIE, value, session.SESSION_TTL_MS)]);
        },

        "POST /logout": async (req, res) => {
            const cookies = session.parseCookies(req.headers.cookie);
            const data = session.verify(config.sessionSecret, cookies[session.SESSION_COOKIE]);
            const form = await readForm(req);
            if (!data || !sameOrigin(req, origin) || !session.safeEqual(form.get("csrf") || "", data.csrf)) {
                return send(res, 403, pages.messagePage("Μη έγκυρο αίτημα", "Ανανεώστε τη σελίδα και δοκιμάστε ξανά.", '<a class="button ghost" href="/">Αρχική</a>'));
            }
            return redirect(res, "/login", [session.clearCookie(session.SESSION_COOKIE)]);
        },

        "GET /": async (req, res) => {
            const who = await currentUser(req);
            if (who.state === "anonymous") return redirect(res, "/login");
            if (who.state === "forbidden") return send(res, 403, pages.forbiddenPage(), { "Set-Cookie": [session.clearCookie(session.SESSION_COOKIE)] });
            const u = who.member.user;
            return send(res, 200, pages.dashboardPage({
                user: { id: u.id, username: u.username, globalName: u.globalName, avatar: u.avatar },
                csrf: who.csrf,
                info: await overview(),
            }));
        },
    };

    return async (req, res) => {
        const ip = req.socket.remoteAddress || "unknown";
        let url;
        try {
            url = new URL(req.url, origin);
        } catch {
            return send(res, 400, pages.notFoundPage());
        }
        const route = routes[`${req.method} ${url.pathname}`];
        if (!route) {
            const known = Object.keys(routes).some((k) => k.endsWith(` ${url.pathname}`));
            return send(res, known ? 405 : 404, pages.notFoundPage());
        }
        try {
            await route(req, res, ip, url);
        } catch (err) {
            console.error(`Panel error on ${req.method} ${url.pathname}:`, err.message);
            if (!res.headersSent) send(res, 500, pages.errorPage());
        }
    };
}

// Reads the panel settings from the environment. Returns null (panel off) without PANEL_PORT.
function loadConfig(env, client) {
    if (!env.PANEL_PORT) return null;
    const missing = ["PANEL_URL", "PANEL_CERT_FILE", "PANEL_KEY_FILE", "PANEL_SESSION_SECRET", "DISCORD_CLIENT_SECRET"].filter((k) => !env[k]);
    if (missing.length) throw new Error(`Panel: missing ${missing.join(", ")}`);
    if (env.PANEL_SESSION_SECRET.length < 32) throw new Error("Panel: PANEL_SESSION_SECRET must be at least 32 characters");
    const baseUrl = new URL(env.PANEL_URL);
    if (baseUrl.protocol !== "https:") throw new Error("Panel: PANEL_URL must start with https://");
    return {
        port: Number(env.PANEL_PORT),
        baseUrl: baseUrl.origin,
        certFile: path.resolve(env.PANEL_CERT_FILE),
        keyFile: path.resolve(env.PANEL_KEY_FILE),
        sessionSecret: env.PANEL_SESSION_SECRET,
        clientId: client.application?.id || client.user.id,
        clientSecret: env.DISCORD_CLIENT_SECRET,
        guildId: env.GUILD_ID,
        adminRoleId: env.ADMIN_ROLE_ID,
        moderatorRoleId: env.MODERATOR_ROLE_ID,
    };
}

function readTls(config) {
    return { cert: fs.readFileSync(config.certFile), key: fs.readFileSync(config.keyFile) };
}

// Starts the panel if PANEL_PORT is set. Reloads the certificate when its files change, so a
// renewed certificate needs no restart.
function startPanel(client, pool) {
    const config = loadConfig(process.env, client);
    if (!config) {
        console.log("Panel: off (PANEL_PORT not set).");
        return null;
    }
    const server = https.createServer(readTls(config), createHandler({ client, pool, config }));
    server.on("error", (err) => console.error(`Panel server error: ${err.message}`));
    server.listen(config.port, "0.0.0.0", () => console.log(`Panel: listening on ${config.baseUrl} (port ${config.port})`));

    let stamp = [config.certFile, config.keyFile].map((f) => fs.statSync(f).mtimeMs).join();
    setInterval(() => {
        try {
            const now = [config.certFile, config.keyFile].map((f) => fs.statSync(f).mtimeMs).join();
            if (now === stamp) return;
            server.setSecureContext(readTls(config));
            stamp = now;
            console.log("Panel: certificate reloaded.");
        } catch (err) {
            console.error(`Panel: reloading the certificate failed: ${err.message}`);
        }
    }, 60 * 60 * 1000).unref();
    return server;
}

module.exports = { createHandler, loadConfig, startPanel, rateLimiter };
