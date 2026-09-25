// Wires the real dependencies once, on first use.

const pool = require("./database");
const { loadEmailConfig } = require("./config");
const { createRepository } = require("./repository");
const { createMailer } = require("./mailer");
const { loadFacultyLocals } = require("./emailPolicy");
const { createLinker } = require("./linker");
const { createDiscordAdapter } = require("./discordAdapter");
const { createEmailVerification } = require("./emailVerification");

let verification;

function getVerification(client) {
    if (!verification) {
        const config = loadEmailConfig();
        const repo = createRepository(pool);
        verification = createEmailVerification({
            config,
            repo,
            mailer: createMailer(config),
            loadFacultyLocals: () => loadFacultyLocals(config.facultyFile, config.domain),
            linker: createLinker({
                repo,
                discord: createDiscordAdapter(client),
                roles: {
                    studentRoleId: process.env.STUDENT_ROLE_ID,
                    professorRoleId: process.env.PROFESSOR_ROLE_ID,
                    guestRoleId: process.env.GUEST_ROLE_ID,
                    guestChannelId: process.env.GUEST_CHANNEL_ID,
                    adminRoleId: process.env.ADMIN_ROLE_ID,
                    moderatorRoleId: process.env.MODERATOR_ROLE_ID,
                },
            }),
        });
    }
    return verification;
}

module.exports = { getVerification };
