// Longer texts edited from the admin panel, stored in the database. Each one overrides a file in
// the repo (the verify info in privacyNotice.js, the periods in data/periods.json); removing the
// override brings the file back. Kept in memory, loaded on startup and updated on every save.

const KEYS = ["verify_info", "periods"];
const cache = new Map();
const listeners = [];

async function ensureTextsSchema(pool) {
    await pool.query(`CREATE TABLE IF NOT EXISTS texts (
        text_key VARCHAR(64) NOT NULL,
        content MEDIUMTEXT NOT NULL,
        updated_by VARCHAR(20) NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (text_key)
    )`);
}

async function loadTexts(pool) {
    await ensureTextsSchema(pool);
    cache.clear();
    for (const row of await pool.query("SELECT text_key, content FROM texts")) {
        if (KEYS.includes(row.text_key)) cache.set(row.text_key, row.content);
    }
}

// The stored override, or null when the file in the repo applies.
const getText = (key) => cache.get(key) ?? null;

async function setText(pool, key, content, userId) {
    if (!KEYS.includes(key)) throw new Error(`unknown text ${key}`);
    if (content === null) {
        await pool.query("DELETE FROM texts WHERE text_key = ?", [key]);
        cache.delete(key);
    } else {
        await pool.query(
            `INSERT INTO texts (text_key, content, updated_by) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE content = VALUES(content), updated_by = VALUES(updated_by)`,
            [key, content, userId],
        );
        cache.set(key, content);
    }
    for (const listener of listeners) {
        try {
            await listener(key);
        } catch (err) {
            console.error(`Texts listener failed for ${key}: ${err.message}`);
        }
    }
}

const onTextChange = (fn) => listeners.push(fn);

module.exports = { loadTexts, getText, setText, onTextChange, ensureTextsSchema };
