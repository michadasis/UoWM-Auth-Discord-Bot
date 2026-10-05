// Restores a database backup made by the bot (backups/db-*.json.gz).
//   node scripts/restore-db.js <file>          shows what is in the file
//   node scripts/restore-db.js <file> --yes    replaces the tables with it
// Run it from the bot folder with the same .env as the bot, e.g.
//   node --env-file=../.env scripts/restore-db.js ../backups/db-2026-10-05T04-00-12Z.json.gz --yes
// Stop the bot first. On a new, empty database, start the bot once so it creates the tables.

const path = require("path");
const pool = require("../src/lib/database");
const { readBackup, restoreBackup } = require("../src/lib/dbBackup");

(async () => {
    const [file, flag] = process.argv.slice(2);
    if (!file) {
        console.log("Usage: node scripts/restore-db.js <backup file> [--yes]");
        process.exit(1);
    }
    const data = await readBackup(path.resolve(file));
    console.log(`Backup from ${data.createdAt}:`);
    for (const [table, rows] of Object.entries(data.tables)) console.log(`  ${table}: ${rows.length} rows`);
    if (flag !== "--yes") {
        console.log("\nNothing changed. Run again with --yes to replace these tables in the database.");
        await pool.end();
        return;
    }
    await restoreBackup(pool, data);
    console.log("Done.");
    await pool.end();
})().catch(async (err) => {
    console.error("Restore failed:", err.message);
    await pool.end().catch(() => {});
    process.exit(1);
});
