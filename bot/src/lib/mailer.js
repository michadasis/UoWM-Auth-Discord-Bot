const nodemailer = require("nodemailer");

// send({ to, subject, text }) -> Promise<void>
function createMailer(config, { logger = console } = {}) {
    if (config.transport === "console") {
        logger.warn("EMAIL_TRANSPORT=console: verification codes are printed to the log. Local testing only.");
        return {
            async send({ to, subject, text }) {
                logger.log(`[DEV EMAIL] to=${to} subject="${subject}"\n${text}`);
            },
        };
    }

    const transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        requireTLS: !config.smtp.secure,
        auth: { user: config.smtp.user, pass: config.smtp.pass },
    });

    return {
        async send({ to, subject, text }) {
            await transporter.sendMail({ from: config.from, to, subject, text });
        },
    };
}

module.exports = { createMailer };
