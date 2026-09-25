// Email verification settings from environment variables, validated once at startup.

const path = require("path");

class ConfigError extends Error {}

function loadEmailConfig(env = process.env) {
    const problems = [];
    const required = (name) => {
        const value = (env[name] || "").trim();
        if (!value) problems.push(`${name} is required`);
        return value;
    };
    const regex = (name, fallback) => {
        try {
            return new RegExp(env[name] || fallback, "i");
        } catch (err) {
            problems.push(`${name} is not a valid regular expression: ${err.message}`);
            return null;
        }
    };

    const transport = env.EMAIL_TRANSPORT || "smtp";
    if (!["smtp", "console"].includes(transport)) problems.push('EMAIL_TRANSPORT must be "smtp" or "console"');

    const secret = required("UNI_ID_HASH_SECRET");
    if (secret && secret.length < 32) problems.push("UNI_ID_HASH_SECRET must be at least 32 characters");

    const config = {
        transport,
        smtp: transport === "smtp"
            ? {
                host: required("SMTP_HOST"),
                port: Number(env.SMTP_PORT || 587),
                secure: env.SMTP_SECURE === "true",
                user: required("SMTP_USER"),
                pass: required("SMTP_PASS"),
            }
            : null,
        from: transport === "smtp" ? required("EMAIL_FROM") : env.EMAIL_FROM || "dev@localhost",
        domain: (env.EMAIL_DOMAIN || "uowm.gr").toLowerCase(),
        // The first capture group is the student number; uniqueness is keyed on it.
        studentPattern: regex("EMAIL_STUDENT_PATTERN", "^cs(\\d{4,6})$"),
        // Usernames that look like students of other departments, for a clearer rejection message.
        otherStudentPattern: regex("EMAIL_OTHER_STUDENT_PATTERN", "^[a-z]{2,6}\\d{3,7}$"),
        facultyFile: path.resolve(env.FACULTY_EMAILS_FILE || "data/faculty-emails.txt"),
        uniIdHashSecret: secret,
    };

    if (problems.length) throw new ConfigError(`Invalid configuration:\n - ${problems.join("\n - ")}`);
    return config;
}

module.exports = { loadEmailConfig, ConfigError };
