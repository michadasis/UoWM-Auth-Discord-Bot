const pool = require("./database");
const { semesterConfig, semesterRolesToStrip } = require("./semesterRoles");

async function getVerification(discordUserId) {
    const rows = await pool.query(
        "SELECT affiliation, verified_at FROM users WHERE discord_user_id = ?",
        [discordUserId],
    );
    return rows[0] ?? null;
}

// Deletes all stored data for a user and removes the roles that depend on verification.
// Returns the removed record, or null if the user was not verified.
async function removeVerification(guild, discordUserId, reason) {
    const record = await getVerification(discordUserId);
    await pool.query("DELETE FROM users WHERE discord_user_id = ?", [discordUserId]);
    await pool.query("DELETE FROM auth_states WHERE discord_user_id = ?", [discordUserId]);

    const member = guild ? await guild.members.fetch(discordUserId).catch(() => null) : null;
    if (member) {
        const verifiedRoles = [process.env.STUDENT_ROLE_ID, process.env.PROFESSOR_ROLE_ID];
        const remaining = [...member.roles.cache.keys()].filter((id) => !verifiedRoles.includes(id));
        const toRemove = [
            ...verifiedRoles.filter((id) => member.roles.cache.has(id)),
            ...semesterRolesToStrip(remaining, semesterConfig()),
        ];
        if (toRemove.length) await member.roles.remove(toRemove, reason);
    }
    return record;
}

const AFFILIATION_LABELS = {
    student: "Φοιτητής",
    faculty: "Καθηγητής (μέλος ΔΕΠ)",
    staff: "Προσωπικό (ρόλος Καθηγητής)",
};

module.exports = { getVerification, removeVerification, AFFILIATION_LABELS };
