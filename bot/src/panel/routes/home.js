// Home page and change history.

const pages = require("../pages");
const { dayKey, dailyTotals } = require("../../lib/messageStats");
const panelLog = require("../../lib/panelLog");
const { healthChecks } = require("../health");
const { send } = require("../http");
const { PermissionFlagsBits } = require("discord.js");

module.exports = function homeRoutes(ctx) {
    const { client, pool, config, guild, withUser, formatWhen, shortDay } = ctx;

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

    return {
        "GET /": async (req, res) => withUser(req, res, async (who) =>
            send(res, 200, pages.dashboardPage({
                user: who.user, csrf: who.csrf, info: await overview(), recent: await recentChanges(5),
                activity: await activity(), greeting: greeting(),
                canLogoutEveryone: who.member.id === who.member.guild.ownerId || Boolean(who.member.permissions?.has?.(PermissionFlagsBits.Administrator)),
                health: await healthChecks({ guild: await guild(), pool, certFile: config.certFile }).catch((err) => [{ status: "warn", text: `Οι έλεγχοι απέτυχαν: ${err.message}` }]),
            }))),

        "GET /history": async (req, res, ip, url) => withUser(req, res, async (who) => {
            const filters = {
                area: (url.searchParams.get("area") || "").slice(0, 64),
                userId: /^\d{17,20}$/.test(url.searchParams.get("who") || "") ? url.searchParams.get("who") : "",
                q: (url.searchParams.get("q") || "").trim().slice(0, 100),
                page: url.searchParams.get("page"),
            };
            const result = await panelLog.queryEntries(pool, filters);
            const g = await guild();
            const nameOf = new Map();
            for (const id of new Set([...result.userIds, ...result.entries.map((e) => e.userId)])) {
                nameOf.set(id, (await g.members.fetch(id).catch(() => null))?.displayName ?? id);
            }
            const entries = result.entries.map((e) => ({ area: e.area, summary: e.summary.replace(/\*\*/g, ""), who: nameOf.get(e.userId), when: formatWhen(e.at) }));
            return send(res, 200, pages.historyPage({
                user: who.user, csrf: who.csrf, entries, filters, total: result.total, page: result.page, pages: result.pages,
                areas: result.areas, people: result.userIds.map((id) => ({ id, name: nameOf.get(id) })).sort((a, b) => a.name.localeCompare(b.name, "el")),
            }));
        }),
    };
};
