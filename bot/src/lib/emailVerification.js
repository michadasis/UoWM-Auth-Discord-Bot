// Email code verification, entirely inside Discord:
//
//   /auth email:cs01234@uowm.gr -> requestCode: policy, rate limits, emails a 6-digit code
//   button/modal or /code 123456 -> submitCode: max 5 attempts, single use, then link + role
//
// Discord already authenticates who runs the command; the code proves control of the mailbox.
// Stored while pending: keyed hash of the identity, affiliation, HMAC of the code. Never the
// address or the code itself.

const crypto = require("crypto");
const { classifyAddress, maskAddress } = require("./emailPolicy");

const LIMITS = {
    codeTtlMs: 10 * 60 * 1000,
    maxAttempts: 5,
    resendCooldownMs: 60 * 1000,
    windowMs: 60 * 60 * 1000,
    maxSendsPerUser: 5,
    maxSendsPerTarget: 3,
};

const IDENTITY_NAMESPACE = "uowm-email";

function hmac(secret, value) {
    return crypto.createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function createEmailVerification({ config, repo, mailer, loadFacultyLocals, linker, now = Date.now, logger = console }) {
    const identityHash = (identityKey) => hmac(config.uniIdHashSecret, `${IDENTITY_NAMESPACE}\n${identityKey}`);
    const codeHash = (discordUserId, uniIdHash, code) => hmac(config.uniIdHashSecret, `${discordUserId}\n${uniIdHash}\n${code}`);

    async function requestCode(discordUserId, input) {
        if (await repo.findUserByDiscordId(discordUserId)) return { code: "discord_verified" };

        const decision = classifyAddress(input, config, await loadFacultyLocals());
        if (!decision.ok) return { code: decision.reason };

        const t = now();
        const pending = await repo.getChallenge(discordUserId);
        const active = pending && pending.expiresAt > t ? pending : null;
        if (active && t - active.sentAt < LIMITS.resendCooldownMs) return { code: "resend_too_soon" };

        const uniIdHash = identityHash(decision.identityKey);
        const recent = await repo.countEmailSends({ discordUserId, targetHash: uniIdHash, since: t - LIMITS.windowMs });
        if (recent.byUser >= LIMITS.maxSendsPerUser || recent.byTarget >= LIMITS.maxSendsPerTarget) return { code: "rate_limited" };

        const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
        await repo.saveChallenge({
            discordUserId,
            uniIdHash,
            affiliation: decision.affiliation,
            codeHash: codeHash(discordUserId, uniIdHash, code),
            // Asking for a new code does not reset wrong attempts.
            attempts: active ? active.attempts : 0,
            sentAt: t,
            expiresAt: t + LIMITS.codeTtlMs,
        });
        await repo.logEmailSend({ discordUserId, targetHash: uniIdHash, sentAt: t });

        try {
            await mailer.send({
                to: `${decision.local}@${config.domain}`,
                subject: `Κωδικός επιβεβαίωσης: ${code}`,
                text: [
                    "Καλησπέρα,",
                    "",
                    `Ο κωδικός επιβεβαίωσης για τον διακομιστή Discord «Πληροφορική UoWM» είναι: ${code}`,
                    "",
                    "Γράψτε τον στο Discord (κουμπί «Εισαγωγή κωδικού» ή εντολή /code). Ισχύει για 10 λεπτά.",
                    "Αν δεν ζητήσατε εσείς αυτόν τον κωδικό, αγνοήστε αυτό το μήνυμα. Κανείς δεν μπορεί να τον χρησιμοποιήσει χωρίς πρόσβαση στο email σας.",
                    "",
                    "Πληροφορική UoWM Discord (ανεπίσημη υπηρεσία φοιτητών)",
                ].join("\n"),
            });
        } catch (err) {
            logger.error(`Sending verification email failed: ${err.message}`);
            return { code: "email_send_failed" };
        }

        return { code: "code_sent", maskedAddress: maskAddress(decision.local, config.domain) };
    }

    async function submitCode(discordUserId, input) {
        const challenge = await repo.getChallenge(discordUserId);
        if (!challenge) return { code: "no_pending_code" };
        if (challenge.expiresAt <= now()) {
            await repo.deleteChallenge(discordUserId);
            return { code: "expired_code" };
        }

        const code = typeof input === "string" ? input.replace(/\s/g, "") : "";
        const expected = codeHash(discordUserId, challenge.uniIdHash, code);
        if (!/^\d{6}$/.test(code) || !safeEqual(expected, challenge.codeHash)) {
            const attempts = await repo.incrementAttempts(discordUserId);
            if (attempts >= LIMITS.maxAttempts) {
                await repo.deleteChallenge(discordUserId);
                return { code: "too_many_attempts" };
            }
            return { code: "wrong_code", attemptsLeft: LIMITS.maxAttempts - attempts };
        }

        // Single use: only one submission can consume this code, even concurrently.
        if (!(await repo.deleteChallenge(discordUserId, challenge.codeHash))) return { code: "no_pending_code" };

        try {
            return await linker.linkAccount(discordUserId, challenge.uniIdHash, challenge.affiliation);
        } catch (err) {
            logger.error(`Linking after email verification failed: ${err.message}`);
            return { code: "error" };
        }
    }

    return { requestCode, submitCode };
}

module.exports = { createEmailVerification, LIMITS };
