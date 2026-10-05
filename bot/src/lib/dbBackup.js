// Database backups: every table of the bot's database (except the short-lived email codes) as
// gzipped JSON, once a day and on demand from the panel, keeping the most recent ones.
// Restore with `node scripts/restore-db.js <file>`.

const fs = require("fs/promises");
const path = require("path");
const zlib = require("zlib");
const { promisify } = require("util");

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const SKIP = new Set(["email_challenges"]); // codes that expire in minutes
const FILE_RE = /^db-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json\.gz$/;

function backupDir(env = process.env) {
    return path.resolve(env.DB_BACKUP_DIR || path.join(__dirname, "..", "..", "..", "backups"));
}

function keepCount(env = process.env) {
    const n = Number(env.DB_BACKUP_KEEP);
    return Number.isInteger(n) && n >= 1 ? n : 14;
}

async function tableNames(pool) {
    const rows = await pool.query("SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME");
    return rows.map((r) => r.t).filter((t) => !SKIP.has(t));
}

// Dates become ISO strings, binary data base64; numbers and text stay as they are.
function plain(value) {
    if (value instanceof Date) return { $date: value.toISOString() };
    if (Buffer.isBuffer(value)) return { $base64: value.toString("base64") };
    if (typeof value === "bigint") return value.toString();
    return value;
}

async function createBackup(pool, { dir = backupDir(), now = new Date() } = {}) {
    const tables = {};
    for (const table of await tableNames(pool)) {
        const rows = await pool.query(`SELECT * FROM \`${table}\``);
        tables[table] = [...rows].map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, plain(v)])));
    }
    const data = { format: "uowm-auth-db-backup", version: 1, createdAt: now.toISOString(), tables };
    await fs.mkdir(dir, { recursive: true });
    const name = `db-${now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-")}.json.gz`;
    const tmp = path.join(dir, `.${name}.tmp`);
    await fs.writeFile(tmp, await gzip(JSON.stringify(data)));
    await fs.rename(tmp, path.join(dir, name));
    await prune(dir);
    return { name, tables: Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.length])) };
}

// Newest first: [{ name, size, createdAt }].
async function listBackups(dir = backupDir()) {
    let names = [];
    try {
        names = (await fs.readdir(dir)).filter((n) => FILE_RE.test(n));
    } catch (err) {
        if (err.code === "ENOENT") return [];
        throw err;
    }
    const out = [];
    for (const name of names) {
        const stat = await fs.stat(path.join(dir, name));
        out.push({ name, size: stat.size, createdAt: name.slice(3, 23).replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, "T$1:$2:$3Z").replace(/-(\d{2})-(\d{2})T/, "-$1-$2T") });
    }
    return out.sort((a, b) => b.name.localeCompare(a.name));
}

async function prune(dir, keep = keepCount()) {
    const all = await listBackups(dir);
    for (const old of all.slice(keep)) await fs.unlink(path.join(dir, old.name)).catch(() => {});
}

// Path of a backup by name, only if it is one of ours (no path tricks).
function backupPath(name, dir = backupDir()) {
    return FILE_RE.test(String(name)) ? path.join(dir, name) : null;
}

async function readBackup(file) {
    const data = JSON.parse((await gunzip(await fs.readFile(file))).toString("utf8"));
    if (data?.format !== "uowm-auth-db-backup" || typeof data.tables !== "object") throw new Error("not a database backup of this bot");
    return data;
}

function unplain(value) {
    if (value && typeof value === "object" && "$date" in value) return new Date(value.$date);
    if (value && typeof value === "object" && "$base64" in value) return Buffer.from(value.$base64, "base64");
    return value;
}

// Replaces the contents of every table in the backup. Tables must already exist (start the bot
// once on an empty database first). Runs in one transaction per table.
async function restoreBackup(pool, data, log = console.log) {
    const existing = new Set(await tableNames(pool));
    for (const [table, rows] of Object.entries(data.tables)) {
        if (!existing.has(table)) { log(`Skipping ${table}: the table does not exist here.`); continue; }
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(`DELETE FROM \`${table}\``);
            for (let i = 0; i < rows.length; i += 200) {
                const batch = rows.slice(i, i + 200);
                const columns = Object.keys(batch[0] || {});
                if (!columns.length) continue;
                const placeholders = batch.map(() => `(${columns.map(() => "?").join(",")})`).join(",");
                await conn.query(`INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(",")}) VALUES ${placeholders}`, batch.flatMap((r) => columns.map((c) => unplain(r[c]))));
            }
            await conn.commit();
            log(`Restored ${table}: ${rows.length} rows.`);
        } catch (err) {
            await conn.rollback().catch(() => {});
            throw new Error(`${table}: ${err.message}`);
        } finally {
            conn.release();
        }
    }
}

// Once a day, at or after 04:00 Greek time, if there is no backup from that day yet.
function scheduleDailyBackups(pool, { onError = () => {}, onDone = () => {} } = {}) {
    const check = async () => {
        const now = new Date();
        const greek = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
        const part = (t) => greek.find((p) => p.type === t).value;
        if (Number(part("hour")) < 4) return;
        const today = `${part("year")}-${part("month")}-${part("day")}`;
        const latest = (await listBackups().catch(() => []))[0];
        const latestDay = latest ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date(latest.createdAt)) : null;
        if (latestDay === today) return;
        try {
            onDone(await createBackup(pool, { now }));
        } catch (err) {
            onError(err);
        }
    };
    const timer = setInterval(() => check().catch(onError), 30 * 60 * 1000);
    timer.unref?.();
    setTimeout(() => check().catch(onError), 60 * 1000).unref?.();
    return timer;
}

module.exports = { backupDir, keepCount, createBackup, listBackups, backupPath, readBackup, restoreBackup, scheduleDailyBackups, prune };
