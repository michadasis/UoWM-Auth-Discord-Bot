// The admin panel: a small HTTPS server inside the bot process, so it shares the Discord client
// and the database. Phase 1: login with Discord, access control and an overview page.

const fs = require("fs");
const path = require("path");
const https = require("https");
const pages = require("./pages");
const session = require("./session");
const oauth = require("./discordOAuth");
const access = require("./access");
const settings = require("../lib/settings");
const { guildOptions, readSettingsForm } = require("./settingsForm");
const { EmbedBuilder } = require("discord.js");
const colors = require("../lib/colors");
const { adminLog } = require("../lib/adminLog");
const texts = require("../lib/texts");
const { PLACEHOLDERS, MAX_LENGTH, renderTemplate, toTemplate, checkTemplate } = require("../lib/verifyTemplate");
const { fileText } = require("../lib/verifyInfoMessage");
const { periodEntries } = require("../lib/activityData");
const { expandPeriods, dayKey, formatDay, dailyTotals, totalsByPeriod, topChannels, getMeta } = require("../lib/messageStats");
const { OUTSIDE_PERIODS, canView, periodsForYear } = require("../lib/activityData");
const { buildActivitySvg, renderPng } = require("../lib/activityChart");
const { buildActivityCsv } = require("../lib/activityCsv");
const { ChannelType } = require("discord.js");
const { loadEmailConfig } = require("../lib/config");
const { renderDiscord } = require("./discordPreview");
const { toLines, fromLines } = require("./periodLines");
const { readFacultyFile, checkFacultyText, writeFacultyFile } = require("./facultyFile");
const panelLog = require("../lib/panelLog");
const { healthChecks } = require("./health");
const { verifiedMembers, guestList, findMember } = require("./people");
const { removeVerification, AFFILIATION_LABELS } = require("../lib/verification");
const { giveGuest, removeGuest } = require("../lib/guests");

const SECURITY_HEADERS = {
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' https://cdn.discordapp.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
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

    // Activity for the home page: the last 30 days of messages and verifications, and the
    // latest verified members.
    async function activity() {
        const today = dayKey(new Date());
        const days = [];
        for (let i = 29; i >= 0; i--) days.push(dayKey(new Date(Date.now() - i * 86400000)));
        const messages = new Map((await dailyTotals(pool, days[0], today).catch(() => [])).map((d) => [d.day, d.count]));
        const verifiedRows = await pool.query(
            `SELECT DATE_FORMAT(verified_at, '%Y-%m-%d') AS d, COUNT(*) AS n FROM users
             WHERE verified_at >= ? GROUP BY d`, [days[0]],
        ).catch(() => []);
        const verified = new Map(verifiedRows.filter((r) => r && r.d).map((r) => [r.d, Number(r.n)]));
        const series = days.map((day) => ({ day, label: shortDay(day), messages: messages.get(day) ?? 0, verified: verified.get(day) ?? 0 }));
        const last7 = series.slice(-7);

        const latestRows = await pool.query("SELECT discord_user_id, affiliation, verified_at FROM users ORDER BY verified_at DESC LIMIT 6").catch(() => []);
        const g = await guild();
        const latest = [];
        for (const r of latestRows.filter((x) => x && x.discord_user_id)) {
            const m = await g.members.fetch(r.discord_user_id).catch(() => null);
            latest.push({
                id: r.discord_user_id,
                name: m ? m.displayName : "Άγνωστος χρήστης",
                username: m?.user.username ?? null,
                avatar: m?.user.avatar ?? null,
                affiliation: r.affiliation,
                when: formatWhen(new Date(r.verified_at)),
            });
        }
        return {
            series,
            messagesToday: series[series.length - 1].messages,
            messages7d: last7.reduce((sum, d) => sum + d.messages, 0),
            verified7d: last7.reduce((sum, d) => sum + d.verified, 0),
            latest,
        };
    }

    // "Καλημέρα" / "Καλησπέρα" by the time in Greece.
    function greeting() {
        const hour = Number(new Date().toLocaleString("en-GB", { timeZone: "Europe/Athens", hour: "2-digit", hour12: false }));
        return hour >= 5 && hour < 13 ? "Καλημέρα" : "Καλησπέρα";
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

    async function renderSettings(res, who, extra = {}, status = 200) {
        const g = await guild();
        await g.roles.fetch();
        await g.channels.fetch();
        return send(res, status, pages.settingsPage({ user: who.user, csrf: who.csrf, settings: await settings.listSettings(pool), ...guildOptions(g), ...extra }));
    }

    // Like describeValue, but with names instead of mentions, for the panel's history.
    function plainValue(g, def, value) {
        if (value === null || value === undefined || value === "") return "κενό";
        const role = (id) => `@${g.roles.cache.get(id)?.name ?? id}`;
        if (def.type === "role") return role(value);
        if (def.type === "roles") return value.split(",").map(role).join(", ");
        if (def.type === "channel") return `#${g.channels.cache.get(value)?.name ?? value}`;
        if (def.type === "lines") return value.split("\n").join(" / ");
        return String(value);
    }

    function describeValue(g, def, value) {
        if (value === null || value === undefined || value === "") return "κενό";
        if (def.type === "role") return `<@&${value}>`;
        if (def.type === "roles") return value.split(",").map((id) => `<@&${id}>`).join(" ");
        if (def.type === "channel") return `<#${value}>`;
        if (def.type === "lines") return value.split("\n").map((l) => "`" + l.replace(/`/g, "'") + "`").join(" · ");
        return "`" + value.replace(/`/g, "'") + "`";
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

    async function renderVerifyText(res, who, { template, errors = [], saved = false, previewed = false }, status = 200) {
        const fromPanel = texts.getText("verify_info") !== null;
        const current = template ?? (fromPanel ? texts.getText("verify_info") : toTemplate(fileText()));
        const n = await names();
        const message = renderTemplate(current);
        return send(res, status, pages.verifyTextPage({
            user: who.user, csrf: who.csrf, template: current, previewHtml: renderDiscord(message, n),
            length: message.length, maxLength: MAX_LENGTH, fromPanel,
            placeholders: PLACEHOLDERS.map(([name, key]) => [name, process.env[key] ? n.roles.get(process.env[key]) : null]),
            errors, saved, previewed,
        }));
    }

    const COUNTED_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice, ChannelType.GuildForum, ChannelType.GuildMedia];
    const shortDay = (day) => formatDay(day).replace(/\/\d{4}$/, "");

    // Year and channel from the query, checked. Panel users are Admins or Moderators, but the
    // channel list still follows what they can see in Discord.
    async function statsQuery(url, who) {
        const g = await guild();
        await g.channels.fetch();
        const today = dayKey(new Date());
        const thisYear = Number(today.slice(0, 4));
        const createdYear = Number(dayKey(g.createdAt).slice(0, 4));
        const years = [];
        for (let y = thisYear; y >= createdYear; y--) years.push(y);

        const channels = [];
        for (const c of [...g.channels.cache.values()].filter((ch) => COUNTED_TYPES.includes(ch.type))
            .sort((a, b) => (a.parent?.rawPosition ?? -1) - (b.parent?.rawPosition ?? -1) || a.rawPosition - b.rawPosition)) {
            if (await canView(g, who.member, c.id)) channels.push({ id: c.id, name: c.name, category: c.parent?.name ?? null });
        }

        const yearParam = url.searchParams.get("year");
        const year = yearParam ? Number(yearParam) : thisYear;
        const channelId = url.searchParams.get("channel") || null;
        let error = null;
        if (!Number.isInteger(year) || year > thisYear || year < createdYear) error = `Διαθέσιμα έτη: ${createdYear} έως ${thisYear}.`;
        else if (channelId && !channels.some((c) => c.id === channelId)) error = "Το κανάλι δεν υπάρχει ή δεν έχετε πρόσβαση σε αυτό.";
        return { g, today, thisYear, year: error ? thisYear : year, years, channels, channelId: error ? null : channelId, error };
    }

    const statsParams = (year, channelId) => `year=${year}${channelId ? `&channel=${channelId}` : ""}`;

    async function statsView(url, who) {
        const q = await statsQuery(url, who);
        const view = { year: q.year, years: q.years, channelId: q.channelId, channels: q.channels, error: q.error };
        if (q.error) return view;
        const yearStart = `${q.year}-01-01`;
        const yearEnd = `${q.year}-12-31`;
        const days = await dailyTotals(pool, yearStart, yearEnd, q.channelId);
        if (!days.length) {
            const backfilled = await getMeta(pool, "backfill_done");
            view.empty = `Δεν έχουν καταμετρηθεί μηνύματα για το ${q.year}.` + (backfilled ? "" : " Τα παλιά μηνύματα μετριούνται με το /stats-backfill στο Discord.");
            return view;
        }
        const periods = await periodsForYear(q.year);
        const last = q.year === q.thisYear ? q.today : yearEnd;
        view.total = days.reduce((sum, d) => sum + d.count, 0);
        view.dayCount = Math.round((Date.parse(last) - Date.parse(days[0].day)) / 86400000) + 1;
        view.from = formatDay(days[0].day);
        view.to = formatDay(last);
        view.groups = periods.length ? totalsByPeriod(days, periods, OUTSIDE_PERIODS).map((gr) => ({
            name: gr.name,
            count: gr.count,
            range: gr.period ? `${shortDay(gr.period.start < yearStart ? yearStart : gr.period.start)} έως ${shortDay(gr.period.end > yearEnd ? yearEnd : gr.period.end)}` : "",
        })) : [];
        view.top = [];
        if (!q.channelId) {
            const visible = new Map(q.channels.map((c) => [c.id, c.name]));
            for (const c of await topChannels(pool, yearStart, yearEnd, 30)) {
                if (view.top.length < 10 && visible.has(c.channelId)) view.top.push({ name: visible.get(c.channelId), count: c.count });
            }
        }
        view.chartUrl = `/stats/chart.png?${statsParams(q.year, q.channelId)}`;
        view.chartSvg = buildActivitySvg({ year: q.year, days, periods, today: q.today, interactive: true });
        view.csvUrl = `/stats/activity.csv?${statsParams(q.year, q.channelId)}`;
        return view;
    }

    const KIND_LABEL = { yearly: "κάθε χρόνο", easter: "Πάσχα", dated: "μία φορά" };

    // The periods of the current academic year (September to August), one row each.
    function academicYearRows(entries) {
        const today = dayKey(new Date());
        const year = Number(today.slice(0, 4));
        const start = Number(today.slice(5, 7)) >= 9 ? year : year - 1;
        const from = `${start}-09-01`;
        const to = `${start + 1}-08-31`;
        const rows = [];
        for (const entry of entries) {
            for (const p of expandPeriods([entry], start, start + 1)) {
                if (p.start >= from && p.start <= to) rows.push({ name: p.name, start: formatDay(p.start), end: formatDay(p.end), type: KIND_LABEL[entry.kind], sort: p.start });
            }
        }
        return rows.sort((a, b) => a.sort.localeCompare(b.sort));
    }

    async function renderPeriods(res, who, { lines, entries, errors = [], saved = false, previewed = false }, status = 200) {
        const fromPanel = texts.getText("periods") !== null;
        let current = entries;
        if (!current) {
            try {
                current = await periodEntries();
            } catch (err) {
                current = [];
                errors = [...errors, `Το αρχείο περιόδων δεν διαβάζεται: ${err.message}`];
            }
        }
        return send(res, status, pages.periodsPage({
            user: who.user, csrf: who.csrf, lines: lines ?? toLines(current), rows: academicYearRows(current), fromPanel, errors, saved, previewed,
        }));
    }

    const formatWhen = (at) => (at && !Number.isNaN(at.getTime()) ? at.toLocaleString("el-GR", { timeZone: "Europe/Athens", dateStyle: "short", timeStyle: "short" }) : "");

    // Latest panel changes, with the names of who made them.
    async function recentChanges(limit = 8) {
        const entries = await panelLog.recentEntries(pool, limit);
        if (!entries.length) return [];
        const g = await guild();
        const names = new Map();
        for (const id of new Set(entries.map((e) => e.userId))) {
            const member = await g.members.fetch(id).catch(() => null);
            names.set(id, member ? member.displayName || member.user.globalName || member.user.username : id);
        }
        return entries.map((e) => ({ area: e.area, summary: e.summary.replace(/\*\*/g, ""), who: names.get(e.userId), when: formatWhen(e.at) }));
    }

    const routes = {
        "GET /panel.css": async (req, res) => send(res, 200, pages.CSS, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=3600" }),

        "GET /panel.js": async (req, res) => send(res, 200, pages.CLIENT_JS, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" }),

        "GET /favicon.svg": async (req, res) => send(res, 200, pages.FAVICON_SVG, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" }),

        "GET /login": async (req, res, ip, url) => {
            const who = await currentUser(req);
            if (who.state === "ok") return redirect(res, "/");
            return send(res, 200, pages.loginPage(url.searchParams.get("n")));
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
            if (url.searchParams.get("error")) return redirect(res, "/login?n=cancelled", [clearState]);

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
            if (!access.canUsePanel(member, staffRoles())) {
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
            return redirect(res, "/login?n=out", [session.clearCookie(session.SESSION_COOKIE)]);
        },

        "GET /": async (req, res) => withUser(req, res, async (who) =>
            send(res, 200, pages.dashboardPage({
                user: who.user, csrf: who.csrf, info: await overview(), recent: await recentChanges(5),
                activity: await activity(), greeting: greeting(),
                health: await healthChecks({ guild: await guild(), pool, certFile: config.certFile }).catch((err) => [{ status: "warn", text: `Οι έλεγχοι απέτυχαν: ${err.message}` }]),
            }))),

        "GET /history": async (req, res) => withUser(req, res, async (who) =>
            send(res, 200, pages.historyPage({ user: who.user, csrf: who.csrf, entries: await recentChanges(100) }))),

        "GET /settings": async (req, res, ip, url) => withUser(req, res, (who) =>
            renderSettings(res, who, { saved: url.searchParams.get("saved") === "1" })),

        "GET /stats": async (req, res, ip, url) => withUser(req, res, async (who) =>
            send(res, 200, pages.statsPage({ user: who.user, csrf: who.csrf, view: await statsView(url, who) }))),

        "GET /stats/chart.png": async (req, res, ip, url) => withUser(req, res, async (who) => {
            const q = await statsQuery(url, who);
            if (q.error) return send(res, 400, pages.notFoundPage());
            const days = await dailyTotals(pool, `${q.year}-01-01`, `${q.year}-12-31`, q.channelId);
            const png = renderPng(buildActivitySvg({ year: q.year, days, periods: await periodsForYear(q.year), today: q.today }));
            res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "image/png" });
            return res.end(png);
        }),

        "GET /stats/activity.csv": async (req, res, ip, url) => withUser(req, res, async (who) => {
            const q = await statsQuery(url, who);
            if (q.error) return send(res, 400, pages.notFoundPage());
            const yearEnd = `${q.year}-12-31`;
            const days = await dailyTotals(pool, `${q.year}-01-01`, yearEnd, q.channelId);
            const csv = buildActivityCsv({ days, periods: await periodsForYear(q.year), lastDay: yearEnd < q.today ? yearEnd : q.today, outsideName: OUTSIDE_PERIODS });
            const channelName = q.channelId ? q.channels.find((c) => c.id === q.channelId)?.name ?? q.channelId : null;
            const name = `activity-${q.year}${channelName ? `-${channelName}` : ""}.csv`;
            const ascii = name.replace(/[^\w.\-]+/g, "_");
            res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}` });
            return res.end(csv);
        }),

        "GET /verify-text": async (req, res, ip, url) => withUser(req, res, (who) =>
            renderVerifyText(res, who, { saved: url.searchParams.get("saved") === "1" })),

        "POST /verify-text": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/verify-text");
            if (!form) return;
            const action = form.get("action");
            if (action === "reset") {
                if (texts.getText("verify_info") !== null) {
                    await texts.setText(pool, "verify_info", null, who.user.id);
                    await logChange(who, "Μήνυμα επαλήθευσης", "Επαναφορά στο privacyNotice.js.");
                }
                return redirect(res, "/verify-text?saved=1");
            }
            const template = String(form.get("template") ?? "").replace(/\r\n/g, "\n").replace(/\s+$/, "");
            if (action === "preview") return renderVerifyText(res, who, { template, previewed: true });
            const errors = checkTemplate(template);
            const before = texts.getText("verify_info") ?? toTemplate(fileText());
            if (template !== before && form.get("confirm") !== "1") {
                errors.push("Επιβεβαιώστε ότι το μήνυμα θα ξανασταλεί με ping σε όλους, τσεκάροντας το κουτί δίπλα στην Αποθήκευση.");
            }
            if (errors.length) return renderVerifyText(res, who, { template, errors }, 400);
            if (template !== before || texts.getText("verify_info") === null) {
                await texts.setText(pool, "verify_info", template, who.user.id);
                await logChange(who, "Μήνυμα επαλήθευσης", `Το κείμενο άλλαξε (${renderTemplate(template).length} χαρακτήρες).`);
            }
            return redirect(res, "/verify-text?saved=1");
        }),

        // Live preview while typing (the page's script calls this); same rendering as the button.
        "POST /verify-text/preview": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/verify-text");
            if (!form) return;
            const message = renderTemplate(String(form.get("template") ?? "").replace(/\r\n/g, "\n"));
            res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" });
            return res.end(JSON.stringify({ html: renderDiscord(message, await names()), length: message.length, maxLength: MAX_LENGTH }));
        }),

        "GET /members": async (req, res, ip, url) => withUser(req, res, async (who) => {
            const q = (url.searchParams.get("q") || "").slice(0, 100);
            const aff = ["student", "faculty", "staff"].includes(url.searchParams.get("aff")) ? url.searchParams.get("aff") : "";
            const view = await verifiedMembers(pool, await guild(), { q, aff, page: url.searchParams.get("page") });
            const done = url.searchParams.get("done");
            return send(res, 200, pages.membersPage({ user: who.user, csrf: who.csrf, view: { ...view, q, aff, done: done ? `Αφαιρέθηκε η επαλήθευση του ${done}.` : null } }));
        }),

        "POST /members/unverify": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/members");
            if (!form) return;
            const id = String(form.get("id") || "");
            if (!/^\d{17,20}$/.test(id)) return redirect(res, "/members");
            const g = await guild();
            const member = await g.members.fetch(id).catch(() => null);
            const name = member ? member.displayName : id;
            const record = await removeVerification(g, id, `Panel: removed by ${who.user.id}`);
            if (record) {
                const label = AFFILIATION_LABELS[record.affiliation] ?? record.affiliation;
                await logChange(who, "Αφαίρεση επαλήθευσης", `<@${id}> (${label})`, `${name} (${label})`);
            }
            return redirect(res, `/members?done=${encodeURIComponent(name)}`);
        }),

        "GET /guests": async (req, res, ip, url) => withUser(req, res, async (who) => {
            const done = url.searchParams.get("done");
            return send(res, 200, pages.guestsPage({ user: who.user, csrf: who.csrf, guests: await guestList(pool, await guild()), done }));
        }),

        "POST /guests/give": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/guests");
            if (!form) return;
            const g = await guild();
            const reason = String(form.get("reason") || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 300);
            const fail = async (error) => send(res, 400, pages.guestsPage({ user: who.user, csrf: who.csrf, guests: await guestList(pool, g), errors: [error], form: { who: form.get("who"), reason } }));
            if (!process.env.GUEST_ROLE_ID) return fail("Δεν έχει οριστεί ο ρόλος Προσωρινή άδεια στις Ρυθμίσεις.");
            if (!reason) return fail("Γράψτε μια αιτιολογία.");
            const found = await findMember(g, form.get("who"));
            if (found.error) return fail(found.error);
            const target = found.member;
            if (target.user.bot) return fail("Δεν δίνεται άδεια σε bot.");
            try {
                await giveGuest(g, target.id, reason, who.user.id);
            } catch (err) {
                console.error("Panel: giving guest role failed:", err.message);
                return fail("Δεν ήταν δυνατή η απόδοση του ρόλου. Ελέγξτε ότι ο ρόλος του bot είναι πάνω από την Προσωρινή άδεια.");
            }
            await panelLog.addEntry(pool, who.user.id, "Προσωρινές άδειες", `Δόθηκε στον ${target.displayName} (@${target.user.username}): ${reason}`);
            return redirect(res, `/guests?done=${encodeURIComponent(`Δόθηκε προσωρινή άδεια στον ${target.displayName}.`)}`);
        }),

        "POST /guests/remove": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/guests");
            if (!form) return;
            const id = String(form.get("id") || "");
            if (!/^\d{17,20}$/.test(id)) return redirect(res, "/guests");
            const g = await guild();
            const member = await g.members.fetch(id).catch(() => null);
            const name = member ? member.displayName : id;
            const { found, problems } = await removeGuest(client, g, id, who.user.id);
            if (found) await panelLog.addEntry(pool, who.user.id, "Προσωρινές άδειες", `Αφαιρέθηκε από τον ${name}${problems.length ? ` (απέτυχε ${problems.join(" και ")})` : ""}`);
            return redirect(res, `/guests?done=${encodeURIComponent(found ? `Αφαιρέθηκε η προσωρινή άδεια του ${name}.` : "Το μέλος δεν είχε προσωρινή άδεια.")}`);
        }),

        "GET /periods": async (req, res, ip, url) => withUser(req, res, (who) =>
            renderPeriods(res, who, { saved: url.searchParams.get("saved") === "1" })),

        "POST /periods": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/periods");
            if (!form) return;
            const action = form.get("action");
            if (action === "reset") {
                if (texts.getText("periods") !== null) {
                    await texts.setText(pool, "periods", null, who.user.id);
                    await logChange(who, "Περίοδοι", "Επαναφορά στο data/periods.json.");
                }
                return redirect(res, "/periods?saved=1");
            }
            const lines = String(form.get("lines") ?? "").replace(/\r\n/g, "\n");
            const { entries, json, errors } = fromLines(lines);
            if (errors.length) return renderPeriods(res, who, { lines, entries: [], errors }, 400);
            if (action === "preview") return renderPeriods(res, who, { lines, entries, previewed: true });
            await texts.setText(pool, "periods", json, who.user.id);
            await logChange(who, "Περίοδοι", `Αποθηκεύτηκαν ${entries.length} περίοδοι.`);
            return redirect(res, "/periods?saved=1");
        }),

        "GET /faculty": async (req, res, ip, url) => withUser(req, res, async (who) => {
            const { facultyFile, domain } = loadEmailConfig();
            const text = await readFacultyFile(facultyFile);
            return send(res, 200, pages.facultyPage({ user: who.user, csrf: who.csrf, text, domain, count: checkFacultyText(text, domain).count, saved: url.searchParams.get("saved") === "1" }));
        }),

        "POST /faculty": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/faculty", 256 * 1024);
            if (!form) return;
            const { facultyFile, domain } = loadEmailConfig();
            const text = String(form.get("text") ?? "");
            const { count, errors } = checkFacultyText(text, domain);
            if (errors.length) return send(res, 400, pages.facultyPage({ user: who.user, csrf: who.csrf, text, domain, count, errors }));
            const before = checkFacultyText(await readFacultyFile(facultyFile), domain).count;
            await writeFacultyFile(facultyFile, text);
            await logChange(who, "Λίστα καθηγητών", `Διευθύνσεις: ${before} → ${count}.`);
            return redirect(res, "/faculty?saved=1");
        }),

        "POST /settings": async (req, res) => withUser(req, res, async (who) => {
            const form = await readForm(req, 32 * 1024);
            if (!sameOrigin(req, origin) || !session.safeEqual(form.get("csrf") || "", who.csrf)) {
                return send(res, 403, pages.messagePage("Μη έγκυρο αίτημα", "Ανανεώστε τη σελίδα και δοκιμάστε ξανά.", '<a class="button ghost" href="/settings">Ρυθμίσεις</a>'));
            }
            const g = await guild();
            await g.roles.fetch();
            await g.channels.fetch();
            const current = await settings.listSettings(pool);
            const { changes, errors } = readSettingsForm(form, current, g);
            if (errors.length) return renderSettings(res, who, { errors }, 400);

            for (const change of changes) await settings.setSetting(pool, change.key, change.value, who.user.id);
            if (changes.length) {
                const byKey = new Map(current.map((s) => [s.key, s]));
                const lines = changes.map((c) => {
                    const def = byKey.get(c.key);
                    const after = c.value === null ? `${describeValue(g, def, def.envValue)} (από .env)` : describeValue(g, def, c.value);
                    return `**${def.label}:** ${describeValue(g, def, def.value)} → ${after}`;
                });
                console.log(`Panel: ${who.user.id} changed ${changes.map((c) => c.key).join(", ")}`);
                for (const c of changes) {
                    const def = byKey.get(c.key);
                    const after = c.value === null ? `${plainValue(g, def, def.envValue)} (από .env)` : plainValue(g, def, c.value);
                    await panelLog.addEntry(pool, who.user.id, "Ρυθμίσεις", `${def.label}: ${plainValue(g, def, def.value)} → ${after}`);
                }
                await adminLog(client, new EmbedBuilder()
                    .setColor(colors.blue)
                    .setTitle("Αλλαγή ρυθμίσεων από τον πίνακα")
                    .setDescription([`**Από:** <@${who.user.id}>`, "", ...lines].join("\n")));
            }
            return redirect(res, "/settings?saved=1");
        }),
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
