// Announcements written in the admin panel: an embed (and optionally a ping) sent to a channel now
// or at a set time, and editable afterwards. A timer sends the scheduled ones.

const { EmbedBuilder } = require("discord.js");

const TIME_ZONE = "Europe/Athens";
const CHECK_MS = 30 * 1000;
let ready = null;

function ensureAnnouncements(pool) {
    ready ??= pool.query(`CREATE TABLE IF NOT EXISTS announcements (
        id INT NOT NULL AUTO_INCREMENT,
        channel_id VARCHAR(20) NULL,
        message_id VARCHAR(20) NULL,
        title VARCHAR(256) NOT NULL DEFAULT '',
        description TEXT NOT NULL,
        color VARCHAR(7) NOT NULL DEFAULT '#F4A11C',
        footer VARCHAR(2048) NOT NULL DEFAULT '',
        image_url VARCHAR(512) NOT NULL DEFAULT '',
        ping VARCHAR(20) NOT NULL DEFAULT '',
        send_at DATETIME NULL,
        sent_at DATETIME NULL,
        last_error VARCHAR(500) NULL,
        created_by VARCHAR(20) NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
    )`).catch((err) => { ready = null; throw err; });
    return ready;
}

// Times are stored as UTC "YYYY-MM-DD HH:MM:SS".
const toSql = (date) => date.toISOString().slice(0, 19).replace("T", " ");
const fromSql = (value) => (value ? new Date(value instanceof Date ? value.getTime() : `${String(value).replace(" ", "T")}Z`) : null);

function toAnnouncement(r) {
    return {
        id: Number(r.id), channelId: r.channel_id || null, messageId: r.message_id || null, title: r.title || "", description: r.description || "",
        color: r.color || "#F4A11C", footer: r.footer || "", imageUrl: r.image_url || "", ping: r.ping || "",
        sendAt: fromSql(r.send_at), sentAt: fromSql(r.sent_at), lastError: r.last_error || null,
    };
}

async function listAnnouncements(pool, limit = 50) {
    await ensureAnnouncements(pool);
    return (await pool.query("SELECT * FROM announcements ORDER BY id DESC LIMIT ?", [limit])).map(toAnnouncement);
}

async function getAnnouncement(pool, id) {
    await ensureAnnouncements(pool);
    const [row] = await pool.query("SELECT * FROM announcements WHERE id = ?", [id]);
    return row ? toAnnouncement(row) : null;
}

async function saveAnnouncement(pool, a, userId) {
    await ensureAnnouncements(pool);
    const values = [a.channelId, a.messageId, a.title, a.description, a.color, a.footer, a.imageUrl, a.ping, a.sendAt ? toSql(a.sendAt) : null, a.sentAt ? toSql(a.sentAt) : null, a.lastError];
    if (a.id) {
        await pool.query("UPDATE announcements SET channel_id = ?, message_id = ?, title = ?, description = ?, color = ?, footer = ?, image_url = ?, ping = ?, send_at = ?, sent_at = ?, last_error = ? WHERE id = ?", [...values, a.id]);
        return a.id;
    }
    const result = await pool.query("INSERT INTO announcements (channel_id, message_id, title, description, color, footer, image_url, ping, send_at, sent_at, last_error, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [...values, userId]);
    return Number(result.insertId);
}

async function deleteAnnouncement(pool, id) {
    await ensureAnnouncements(pool);
    await pool.query("DELETE FROM announcements WHERE id = ?", [id]);
}

// The Discord message. The ping goes in the message text, since mentions in embeds do not notify.
function buildMessage(a) {
    const embed = new EmbedBuilder().setColor(a.color || "#F4A11C");
    if (a.title) embed.setTitle(a.title);
    if (a.description) embed.setDescription(a.description);
    if (a.footer) embed.setFooter({ text: a.footer });
    if (a.imageUrl) embed.setImage(a.imageUrl);
    const message = { embeds: [embed], allowedMentions: { parse: [] } };
    if (a.ping === "everyone") {
        message.content = "@everyone";
        message.allowedMentions = { parse: ["everyone"] };
    } else if (a.ping) {
        message.content = `<@&${a.ping}>`;
        message.allowedMentions = { roles: [a.ping] };
    }
    return message;
}

// Sends it, or edits the message if it was sent before (an edit pings no one). Returns it updated.
async function sendAnnouncement(client, pool, a) {
    const channel = await client.channels.fetch(a.channelId);
    if (a.messageId) {
        const message = await channel.messages.fetch(a.messageId);
        const payload = buildMessage(a);
        delete payload.content; // the ping was in the original message; an edit does not ping
        await message.edit({ ...payload, allowedMentions: { parse: [] } });
        return a;
    }
    const message = await channel.send(buildMessage(a));
    const sent = { ...a, messageId: message.id, sentAt: new Date(), sendAt: null, lastError: null };
    await saveAnnouncement(pool, sent, null);
    return sent;
}

// Sends what is due; failures are kept on the announcement for the panel to show.
async function sendDue(client, pool, now = new Date()) {
    await ensureAnnouncements(pool);
    const due = (await pool.query("SELECT * FROM announcements WHERE sent_at IS NULL AND send_at IS NOT NULL AND send_at <= ?", [toSql(now)])).map(toAnnouncement);
    for (const a of due) {
        try {
            await sendAnnouncement(client, pool, a);
        } catch (err) {
            console.error(`Scheduled announcement ${a.id} failed: ${err.message}`);
            await saveAnnouncement(pool, { ...a, sendAt: null, lastError: err.message.slice(0, 500) }, null);
        }
    }
    return due.length;
}

function startScheduler(client, pool) {
    const timer = setInterval(() => sendDue(client, pool).catch((err) => console.error("Announcement scheduler failed:", err.message)), CHECK_MS);
    timer.unref?.();
    return timer;
}

// "2026-10-10T18:00" in Greek time -> Date (UTC), daylight saving included.
function athensLocalToDate(value) {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!m) return null;
    const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    let guess = asUtc;
    for (let i = 0; i < 2; i++) {
        const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
        const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
        guess += asUtc - shown;
    }
    return new Date(guess);
}

// Date -> "2026-10-10T18:00" in Greek time, for the form.
function dateToAthensLocal(date) {
    if (!date) return "";
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

module.exports = {
    ensureAnnouncements, listAnnouncements, getAnnouncement, saveAnnouncement, deleteAnnouncement, buildMessage,
    sendAnnouncement, sendDue, startScheduler, athensLocalToDate, dateToAthensLocal, toAnnouncement,
};
