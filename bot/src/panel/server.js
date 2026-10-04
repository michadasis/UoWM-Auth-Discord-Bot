// The admin panel: a small HTTPS server inside the bot process, so it shares the Discord client
// and the database. Routes live in ./routes, one file per area.

const fs = require("fs");
const path = require("path");
const https = require("https");
const pages = require("./pages");
const session = require("./session");
const oauth = require("./discordOAuth");
const access = require("./access");
const panelLog = require("../lib/panelLog");
const { EmbedBuilder } = require("discord.js");
const colors = require("../lib/colors");
const { adminLog } = require("../lib/adminLog");
const { rateLimiter, send, redirect, readForm, sameOrigin } = require("./http");
const { formatDay } = require("../lib/messageStats");

// Loaded with this module (not per request), one file per area of the panel.
const ROUTES = ["auth", "home", "stats", "people", "replies", "roleMenus", "texts", "faculty", "welcome", "settings"].map((file) => require(`./routes/${file}`));

// deps: { client, pool, config, fetchUser }. config: { baseUrl, clientId, clientSecret, sessionSecret,
// guildId, adminRoleId, moderatorRoleId }.
function createHandler({ client, pool, config, fetchUser = oauth.fetchUser }) {
    const origin = new URL(config.baseUrl).origin;
    const redirectUri = `${origin}/auth/callback`;
    const loginLimit = rateLimiter(20, 10 * 60 * 1000);
    const guild = () => client.guilds.fetch(config.guildId);

    // Read live, so a role changed in the settings applies to panel access right away.
    const staffRoles = () => ({
        adminRoleId: process.env.ADMIN_ROLE_ID || config.adminRoleId,
        moderatorRoleId: process.env.MODERATOR_ROLE_ID || config.moderatorRoleId,
    });

    // The logged-in panel user, or null. Also re-checks the role on every request.
    async function currentUser(req) {
        const cookies = session.parseCookies(req.headers.cookie);
        const data = session.verify(config.sessionSecret, cookies[session.SESSION_COOKIE]);
        if (!data) return { state: "anonymous" };
        const member = await access.fetchMember(await guild(), data.uid);
        if (!access.canUsePanel(member, staffRoles())) return { state: "forbidden" };
        return { state: "ok", member, csrf: data.csrf };
    }

    // Runs page(who) for logged-in panel users; otherwise login or 403.
    async function withUser(req, res, page) {
        const who = await currentUser(req);
        if (who.state === "anonymous") {
            const hadSession = session.SESSION_COOKIE in session.parseCookies(req.headers.cookie);
            return redirect(res, hadSession ? "/login?n=expired" : "/login", hadSession ? [session.clearCookie(session.SESSION_COOKIE)] : []);
        }
        if (who.state === "forbidden") return send(res, 403, pages.forbiddenPage(), { "Set-Cookie": [session.clearCookie(session.SESSION_COOKIE)] });
        const u = who.member.user;
        return page({ ...who, user: { id: u.id, username: u.username, globalName: u.globalName, avatar: u.avatar } });
    }

    async function names() {
        const g = await guild();
        await g.roles.fetch();
        await g.channels.fetch();
        return {
            roles: new Map([...g.roles.cache.values()].map((r) => [r.id, r.name])),
            channels: new Map([...g.channels.cache.values()].map((c) => [c.id, c.name])),
        };
    }

    // For POST forms: CSRF token and same origin, or a 403 page. Returns the form or null.
    async function checkedForm(req, res, who, back, maxBytes = 64 * 1024) {
        const form = await readForm(req, maxBytes);
        if (!sameOrigin(req, origin) || !session.safeEqual(form.get("csrf") || "", who.csrf)) {
            send(res, 403, pages.messagePage("Μη έγκυρο αίτημα", "Ανανεώστε τη σελίδα και δοκιμάστε ξανά.", `<a class="button ghost" href="${back}">Πίσω</a>`));
            return null;
        }
        return form;
    }

    // Every panel change goes to the admin log in Discord and to the panel's own history.
    // plain: the history text, when the Discord text has mentions that would not read well there.
    const logChange = async (who, title, text, plain = text) => {
        await adminLog(client, new EmbedBuilder().setColor(colors.blue).setTitle(title).setDescription(`**Από:** <@${who.user.id}>\n${text}`));
        await panelLog.addEntry(pool, who.user.id, title, plain);
    };

    const shortDay = (day) => formatDay(day).replace(/\/\d{4}$/, "");

    const formatWhen = (at) => (at && !Number.isNaN(at.getTime()) ? at.toLocaleString("el-GR", { timeZone: "Europe/Athens", dateStyle: "short", timeStyle: "short" }) : "");

    const ctx = { client, pool, config, fetchUser, origin, redirectUri, loginLimit, guild, staffRoles, currentUser, withUser, names, checkedForm, logChange, formatWhen, shortDay };
    const routes = Object.assign({}, ...ROUTES.map((makeRoutes) => makeRoutes(ctx)));


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
