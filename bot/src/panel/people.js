// Members and guests for the panel pages, with their Discord names.

const PAGE_SIZE = 50;
let lastFullFetch = 0;

// The guild's members, fetched in full at most once a minute.
async function allMembers(guild, now = Date.now()) {
    if (now - lastFullFetch > 60 * 1000 || guild.members.cache.size < (guild.memberCount ?? 0)) {
        await guild.members.fetch().catch(() => null);
        lastFullFetch = now;
    }
    return guild.members.cache;
}

const fold = (text) => String(text ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("el");

function describe(id, member) {
    return {
        id,
        name: member ? member.displayName || member.user.globalName || member.user.username : "Άγνωστος χρήστης",
        username: member?.user.username ?? null,
        avatar: member?.user.avatar ?? null,
        inServer: Boolean(member),
    };
}

const formatDate = (value) => {
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("el-GR", { timeZone: "Europe/Athens" });
};

// { q, aff, page } -> { items, total, page, pages, counts }
async function verifiedMembers(pool, guild, { q = "", aff = "", page = 1, pageSize = PAGE_SIZE } = {}) {
    const rows = await pool.query("SELECT discord_user_id, affiliation, verified_at FROM users ORDER BY verified_at DESC");
    const members = await allMembers(guild);
    const counts = {};
    for (const r of rows) counts[r.affiliation] = (counts[r.affiliation] || 0) + 1;

    const needle = fold(q.trim());
    const all = rows
        .filter((r) => r && r.discord_user_id && (!aff || r.affiliation === aff))
        .map((r) => ({ ...describe(r.discord_user_id, members.get(r.discord_user_id)), affiliation: r.affiliation, verifiedAt: formatDate(r.verified_at) }))
        .filter((m) => !needle || [m.name, m.username, m.id].some((v) => fold(v).includes(needle)));
    const pages = Math.max(1, Math.ceil(all.length / pageSize));
    const current = Math.min(Math.max(1, Number(page) || 1), pages);
    return { items: pageSize === Infinity ? all : all.slice((current - 1) * pageSize, current * pageSize), total: all.length, page: current, pages, counts };
}

async function guestList(pool, guild) {
    const rows = await pool.query("SELECT discord_id, reason, given_by FROM guests");
    const members = await allMembers(guild);
    return rows.filter((r) => r && r.discord_id).map((r) => ({
        ...describe(r.discord_id, members.get(r.discord_id)),
        reason: r.reason,
        givenBy: r.given_by ? describe(r.given_by, members.get(r.given_by)).name : "",
    }));
}

// Finds one member by ID, username or display name. Returns { member } or { error }.
async function findMember(guild, query) {
    const text = String(query ?? "").trim().replace(/^@/, "");
    if (!text) return { error: "Γράψτε username, όνομα ή ID." };
    if (/^\d{17,20}$/.test(text)) {
        const member = await guild.members.fetch(text).catch(() => null);
        return member ? { member } : { error: "Δεν υπάρχει μέλος με αυτό το ID στον server." };
    }
    const members = [...(await allMembers(guild)).values()].filter((m) => !m.user.bot);
    const needle = fold(text);
    const exact = members.filter((m) => [m.user.username, m.displayName, m.user.globalName].some((v) => v && fold(v) === needle));
    if (exact.length === 1) return { member: exact[0] };
    const candidates = exact.length ? exact : members.filter((m) => [m.user.username, m.displayName, m.user.globalName].some((v) => v && fold(v).includes(needle)));
    if (candidates.length === 1) return { member: candidates[0] };
    if (!candidates.length) return { error: `Κανένα μέλος δεν ταιριάζει με «${text}».` };
    const list = candidates.slice(0, 6).map((m) => `${m.displayName} (@${m.user.username})`).join(", ");
    return { error: `Ταιριάζουν πολλά μέλη: ${list}${candidates.length > 6 ? " ..." : ""}. Γράψτε το username ακριβώς ή το ID.` };
}

module.exports = { verifiedMembers, guestList, findMember, PAGE_SIZE };

// Everything the panel knows about one member, or null if neither in the server nor on record.
async function memberDetail(pool, guild, id) {
    const member = await guild.members.fetch(id).catch(() => null);
    const [user] = await pool.query("SELECT affiliation, verified_at FROM users WHERE discord_user_id = ?", [id]).catch(() => []);
    const [guest] = await pool.query("SELECT reason, given_by FROM guests WHERE discord_id = ?", [id]).catch(() => []);
    if (!member && !user && !guest) return null;
    let givenBy = "";
    if (guest?.given_by) {
        const giver = await guild.members.fetch(guest.given_by).catch(() => null);
        givenBy = giver ? giver.displayName : guest.given_by;
    }
    const roles = member
        ? [...(member.roles?.cache?.values() ?? [])].filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position).map((r) => ({ id: r.id, name: r.name }))
        : [];
    return {
        ...describe(id, member),
        joinedAt: member?.joinedAt ? formatDate(member.joinedAt) : null,
        affiliation: user?.affiliation ?? null,
        verifiedAt: user ? formatDate(user.verified_at) : null,
        guest: guest ? { reason: guest.reason, givenBy } : null,
        roles,
    };
}

const csvField = (value) => {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// All verified members matching the filters, as CSV (UTF-8 with BOM for Excel).
async function verifiedMembersCsv(pool, guild, { q = "", aff = "" } = {}) {
    const { items } = await verifiedMembers(pool, guild, { q, aff, page: 1, pageSize: Infinity });
    const labels = { student: "Φοιτητής", faculty: "Καθηγητής", staff: "Προσωπικό" };
    const rows = [["Discord ID", "Όνομα", "Username", "Ιδιότητα", "Επαλήθευση", "Στον server"]]
        .concat(items.map((m) => [m.id, m.name, m.username ?? "", labels[m.affiliation] ?? m.affiliation, m.verifiedAt, m.inServer ? "ναι" : "όχι"]));
    return "\uFEFF" + rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

module.exports.memberDetail = memberDetail;
module.exports.verifiedMembersCsv = verifiedMembersCsv;
