// Semester roles (Α to Η Εξάμηνο) are self-assigned through Dyno in #epilogh-eksamhnou.
// Discord permissions cannot express "semester role AND verified", so the bot enforces it:
// a member who holds a semester role without an allowed role (by default only Φοιτητής) loses it.

function parseIds(value) {
    return (value || "").split(",").map((id) => id.trim()).filter(Boolean);
}

function semesterConfig(env = process.env) {
    const semesterRoleIds = parseIds(env.SEMESTER_ROLE_IDS);
    const allowed = parseIds(env.SEMESTER_ALLOWED_ROLE_IDS);
    return {
        semesterRoleIds,
        allowedRoleIds: allowed.length ? allowed : parseIds(env.STUDENT_ROLE_ID),
    };
}

// memberRoleIds: iterable of role IDs the member has (after any pending removals).
function semesterRolesToStrip(memberRoleIds, { semesterRoleIds, allowedRoleIds }) {
    const roles = new Set(memberRoleIds);
    if (allowedRoleIds.some((id) => roles.has(id))) return [];
    return semesterRoleIds.filter((id) => roles.has(id));
}

module.exports = { parseIds, semesterConfig, semesterRolesToStrip };
