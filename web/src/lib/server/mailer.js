import nodemailer from 'nodemailer';

// send({ to, subject, text }) -> Promise<void>
export function createMailer(emailConfig, { logger = console } = {}) {
    if (emailConfig.transport === 'console') {
        return {
            async send({ to, subject, text }) {
                logger.log(`[DEV EMAIL] to=${to} subject="${subject}"\n${text}`);
            },
        };
    }

    const transporter = nodemailer.createTransport({
        host: emailConfig.smtp.host,
        port: emailConfig.smtp.port,
        secure: emailConfig.smtp.secure,
        requireTLS: !emailConfig.smtp.secure,
        auth: { user: emailConfig.smtp.user, pass: emailConfig.smtp.pass },
    });

    return {
        async send({ to, subject, text }) {
            await transporter.sendMail({ from: emailConfig.from, to, subject, text });
        },
    };
}
