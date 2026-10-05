// Statistics page, chart and CSV.

const pages = require("../pages");
const { dayKey, formatDay, dailyTotals, totalsByPeriod, topChannels, getMeta } = require("../../lib/messageStats");
const { OUTSIDE_PERIODS, canView, periodsForYear } = require("../../lib/activityData");
const { buildActivitySvg, renderPng } = require("../../lib/activityChart");
const { buildActivityCsv } = require("../../lib/activityCsv");
const { ChannelType } = require("discord.js");
const { verificationsByMonth, hourGrid } = require("../../lib/usageStats");
const { SECURITY_HEADERS, send } = require("../http");

module.exports = function statsRoutes(ctx) {
    const { pool, guild, withUser, shortDay } = ctx;

    const COUNTED_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice, ChannelType.GuildForum, ChannelType.GuildMedia];

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
        // The same periods a year earlier, matched by name without the academic year.
        const baseName = (name) => name.replace(/\s*\d{4}-\d{4}$/, "");
        const prevDays = await dailyTotals(pool, `${q.year - 1}-01-01`, `${q.year - 1}-12-31`, q.channelId);
        const prevByName = new Map();
        if (prevDays.length) {
            const prevPeriods = await periodsForYear(q.year - 1);
            for (const gr of totalsByPeriod(prevDays, prevPeriods, OUTSIDE_PERIODS)) prevByName.set(baseName(gr.name), (prevByName.get(baseName(gr.name)) || 0) + gr.count);
        }
        view.hasPrevYear = prevDays.length > 0;
        view.groups = periods.length ? totalsByPeriod(days, periods, OUTSIDE_PERIODS).map((gr) => ({
            name: gr.name,
            count: gr.count,
            lastYear: prevDays.length ? prevByName.get(baseName(gr.name)) ?? 0 : null,
            range: gr.period ? `${shortDay(gr.period.start < yearStart ? yearStart : gr.period.start)} έως ${shortDay(gr.period.end > yearEnd ? yearEnd : gr.period.end)}` : "",
        })) : [];
        view.top = [];
        if (!q.channelId) {
            const visible = new Map(q.channels.map((c) => [c.id, c.name]));
            for (const c of await topChannels(pool, yearStart, yearEnd, 30)) {
                if (view.top.length < 10 && visible.has(c.channelId)) view.top.push({ name: visible.get(c.channelId), count: c.count });
            }
        }
        if (!q.channelId) {
            view.months = await verificationsByMonth(pool, q.year);
            view.hours = await hourGrid(pool, yearStart, last);
        }
        view.chartUrl = `/stats/chart.png?${statsParams(q.year, q.channelId)}`;
        view.chartSvg = buildActivitySvg({ year: q.year, days, periods, today: q.today, interactive: true });
        view.csvUrl = `/stats/activity.csv?${statsParams(q.year, q.channelId)}`;
        return view;
    }

    return {
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
    };
};
