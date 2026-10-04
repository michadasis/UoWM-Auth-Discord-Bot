// Settings that can be changed from the admin panel. They override the values in .env: on
// startup and on every change the stored value is written into process.env, so the rest of the
// bot keeps reading process.env as before. Removing an override brings back the .env value.
// Secrets (token, SMTP password, hashing secret) are never settings.

const DEFINITIONS = [
    { key: "STUDENT_ROLE_ID", type: "role", group: "roles", label: "Φοιτητής", help: "Δίνεται στους επαληθευμένους φοιτητές.", assigned: true },
    { key: "PROFESSOR_ROLE_ID", type: "role", group: "roles", label: "Καθηγητής", help: "Δίνεται στους διδάσκοντες της λίστας καθηγητών.", assigned: true },
    { key: "STAFF_ROLE_ID", type: "role", group: "roles", label: "Προσωπικό", help: "Δίνεται στους λογαριασμούς προσωπικού.", assigned: true },
    { key: "GUEST_ROLE_ID", type: "role", group: "roles", label: "Προσωρινή άδεια", help: "Δίνεται με /give-guest-role.", assigned: true },
    { key: "ADMIN_ROLE_ID", type: "role", group: "staff", label: "Admin", help: "Πρόσβαση στις εντολές διαχείρισης και στον πίνακα." },
    { key: "MODERATOR_ROLE_ID", type: "role", group: "staff", label: "Moderator", help: "Πρόσβαση στις εντολές διαχείρισης και στον πίνακα." },
    { key: "SEMESTER_ROLE_IDS", type: "roles", group: "semesters", label: "Ρόλοι εξαμήνων", help: "Οι ρόλοι Α έως Η Εξάμηνο.", assigned: true },
    { key: "SEMESTER_ALLOWED_ROLE_IDS", type: "roles", group: "semesters", label: "Ποιοι μπορούν να έχουν εξάμηνα", help: "Κανένας επιλεγμένος σημαίνει μόνο ο ρόλος Φοιτητής." },
    { key: "SEMESTER_CHANNEL_ID", type: "channel", group: "semesters", label: "Κανάλι επιλογής εξαμήνων", help: "Εδώ γίνεται ping όσων μόλις επαληθεύτηκαν. Κενό: χωρίς ping." },
    { key: "SEMESTER_PING_SECONDS", type: "number", group: "semesters", label: "Διαγραφή του ping μετά από", help: "Δευτερόλεπτα, αν δεν διαλέξουν εξάμηνο νωρίτερα. Προεπιλογή 5.", min: 1, max: 86400 },
    { key: "ADMIN_CHANNEL_ID", type: "channel", group: "channels", label: "Κανάλι καταγραφής", help: "Ιδιωτικό κανάλι για Admins και Moderators." },
    { key: "GUEST_CHANNEL_ID", type: "channel", group: "channels", label: "Κανάλι προσωρινών αδειών", help: "Καταγραφή των προσωρινών αδειών." },
    { key: "VERIFY_CHANNEL_ID", type: "channel", group: "channels", label: "Κανάλι επαλήθευσης", help: "Όπου γίνεται το /auth. Χρησιμοποιείται στα links προς την επαλήθευση." },
    { key: "WELCOME_CHANNEL_ID", type: "channel", group: "welcome", label: "Κανάλι καλωσορίσματος", help: "Εδώ καλωσορίζεται κάθε νέο μέλος. Κενό: χωρίς καλωσόρισμα." },
    { key: "WELCOME_MESSAGE", type: "text", group: "welcome", label: "Μήνυμα καλωσορίσματος", help: "{μέλος} γίνεται mention του νέου μέλους και {επαλήθευση} link στο κανάλι επαλήθευσης. Κενό: το προεπιλεγμένο.", maxLength: 500 },
    { key: "BOT_STATUS", type: "lines", group: "bot", label: "Κατάσταση bot", help: "Μία ανά γραμμή, εμφανίζονται με τη σειρά. Ξεκινήστε με Playing, Watching, Listening to ή Competing in για τον αντίστοιχο τύπο. Αλλιώς εμφανίζεται ως έχει.", maxLength: 128, maxLines: 20 },
    { key: "BOT_STATUS_INTERVAL", type: "number", group: "bot", label: "Αλλαγή κατάστασης κάθε", help: "Λεπτά, όταν υπάρχουν πολλές καταστάσεις. Προεπιλογή 5.", min: 1, max: 1440 },
];
const BY_KEY = new Map(DEFINITIONS.map((d) => [d.key, d]));

const envDefaults = {}; // the .env values, captured before any override
let snapshotTaken = false;
const listeners = [];

function snapshot(env) {
    if (snapshotTaken) return;
    for (const { key } of DEFINITIONS) envDefaults[key] = env[key] ?? "";
    snapshotTaken = true;
}

async function ensureSettingsSchema(pool) {
    await pool.query(`CREATE TABLE IF NOT EXISTS settings (
        setting_key VARCHAR(64) NOT NULL,
        setting_value TEXT NOT NULL,
        updated_by VARCHAR(20) NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (setting_key)
    )`);
}

// Loads the stored overrides into process.env. Call before the bot logs in.
async function applyStored(pool, env = process.env) {
    snapshot(env);
    await ensureSettingsSchema(pool);
    const rows = await pool.query("SELECT setting_key, setting_value FROM settings");
    for (const { setting_key: key, setting_value: value } of rows) {
        if (BY_KEY.has(key)) env[key] = value;
    }
}

// All settings with their current value and where it comes from ("panel", "env" or "none").
async function listSettings(pool, env = process.env) {
    snapshot(env);
    const stored = new Map((await pool.query("SELECT setting_key, setting_value, updated_by FROM settings")).map((r) => [r.setting_key, r]));
    return DEFINITIONS.map((def) => {
        const row = stored.get(def.key);
        return {
            ...def,
            value: row ? row.setting_value : envDefaults[def.key],
            envValue: envDefaults[def.key],
            source: row ? "panel" : envDefaults[def.key] ? "env" : "none",
            updatedBy: row?.updated_by ?? null,
        };
    });
}

// Stores an override (value) or removes it (null), updates process.env and notifies listeners.
async function setSetting(pool, key, value, userId, env = process.env) {
    if (!BY_KEY.has(key)) throw new Error(`unknown setting ${key}`);
    snapshot(env);
    if (value === null) {
        await pool.query("DELETE FROM settings WHERE setting_key = ?", [key]);
        env[key] = envDefaults[key];
    } else {
        await pool.query(
            `INSERT INTO settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
            [key, value, userId],
        );
        env[key] = value;
    }
    for (const listener of listeners) {
        try {
            await listener(key, env[key]);
        } catch (err) {
            console.error(`Settings listener failed for ${key}: ${err.message}`);
        }
    }
}

// fn(key, newValue) runs after every change, e.g. to rebuild something that cached a value.
const onChange = (fn) => listeners.push(fn);

const parseIds = (value) => String(value || "").split(",").map((id) => id.trim()).filter(Boolean);

module.exports = { DEFINITIONS, ensureSettingsSchema, applyStored, listSettings, setSetting, onChange, parseIds, envDefaults };
