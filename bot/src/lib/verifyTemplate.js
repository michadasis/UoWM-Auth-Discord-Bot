// The verify info as an editable template. Role mentions are written as placeholders such as
// {Φοιτητής}, so the text keeps working when a role is changed in the settings.

const PLACEHOLDERS = [
    ["Φοιτητής", "STUDENT_ROLE_ID"],
    ["Καθηγητής", "PROFESSOR_ROLE_ID"],
    ["Προσωπικό", "STAFF_ROLE_ID"],
    ["Προσωρινή άδεια", "GUEST_ROLE_ID"],
    ["Admin", "ADMIN_ROLE_ID"],
    ["Moderator", "MODERATOR_ROLE_ID"],
];

const MAX_LENGTH = 2000; // Discord's message limit

// Template -> message: {Φοιτητής} becomes the role mention (or «Φοιτητής» if the role is not set).
function renderTemplate(template, env = process.env) {
    let text = template;
    for (const [name, key] of PLACEHOLDERS) text = text.split(`{${name}}`).join(env[key] ? `<@&${env[key]}>` : `«${name}»`);
    return text;
}

// Message -> template, to open the current text from privacyNotice.js in the editor.
function toTemplate(message, env = process.env) {
    let text = message;
    for (const [name, key] of PLACEHOLDERS) if (env[key]) text = text.split(`<@&${env[key]}>`).join(`{${name}}`);
    return text;
}

// Problems that should block saving.
function checkTemplate(template, env = process.env) {
    const errors = [];
    const text = renderTemplate(template, env);
    if (!template.trim()) errors.push("Το μήνυμα είναι κενό.");
    if (text.length > MAX_LENGTH) errors.push(`Το μήνυμα έχει ${text.length} χαρακτήρες, το όριο του Discord είναι ${MAX_LENGTH}.`);
    const known = new Set(PLACEHOLDERS.map(([name]) => name));
    for (const [, name] of template.matchAll(/\{([^{}\n]{1,40})\}/g)) {
        if (!known.has(name)) errors.push(`Άγνωστο πεδίο {${name}}. Διαθέσιμα: ${[...known].map((n) => `{${n}}`).join(", ")}.`);
    }
    return errors;
}

module.exports = { PLACEHOLDERS, MAX_LENGTH, renderTemplate, toTemplate, checkTemplate };
