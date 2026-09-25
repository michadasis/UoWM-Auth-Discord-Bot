// Email code verification: proves control of an institutional mailbox without any password.
//
//   bot /auth -> auth_states row (same single-use, 10-minute link as the SSO flow)
//   GET /login?s=<token>  -> begin: checks the state; the route stores the token in a cookie
//   POST /email ?/send    -> sendCode: policy on the address, rate limits, emails a 6-digit code
//   POST /email ?/verify  -> verifyCode: max 5 attempts per link, then single-use claim and link
//
// Stored per pending link: keyed hash of the identity, affiliation, HMAC of the code. Never the
// address or the code itself.

import { randomInt, createHmac } from 'node:crypto';
import { hashStateToken, hashUniversityId, safeEqual } from './crypto.js';
import { classifyAddress, maskAddress } from './emailPolicy.js';
import { TOKEN_PATTERN, stateProblem } from './verification.js';

export const EMAIL_LIMITS = {
    maxAttempts: 5,
    resendCooldownMs: 60 * 1000,
    windowMs: 60 * 60 * 1000,
    maxSendsPerUser: 5,
    maxSendsPerTarget: 3,
};

const IDENTITY_NAMESPACE = 'uowm-email';

export function createEmailVerificationService({ config, repo, mailer, loadFacultyLocals, linker, now = Date.now, logger = console }) {
    const emailConfig = config.email;

    function codeHash(stateHash, code) {
        return createHmac('sha256', config.uniIdHashSecret).update(`${stateHash}\n${code}`).digest('hex');
    }

    async function loadState(token) {
        if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return { problem: 'invalid_link' };
        const stateHash = hashStateToken(token);
        const state = await repo.getState(stateHash);
        const problem = stateProblem(state, now());
        return problem ? { problem } : { stateHash, state };
    }

    async function begin(token) {
        const { problem, state } = await loadState(token);
        if (problem) return { code: problem };
        return { code: state.emailCodeHash ? 'code_pending' : 'address_needed' };
    }

    async function sendCode(token, input) {
        const { problem, stateHash, state } = await loadState(token);
        if (problem) return { code: problem };

        const decision = classifyAddress(input, emailConfig, await loadFacultyLocals());
        if (!decision.ok) return { code: decision.reason };

        const t = now();
        if (state.emailSentAt !== null && t - state.emailSentAt < EMAIL_LIMITS.resendCooldownMs) {
            return { code: 'resend_too_soon' };
        }
        if (state.emailAttempts >= EMAIL_LIMITS.maxAttempts) return { code: 'too_many_attempts' };

        const uniIdHash = hashUniversityId(config.uniIdHashSecret, IDENTITY_NAMESPACE, decision.identityKey);
        const recent = await repo.countEmailSends({ discordUserId: state.discordUserId, targetHash: uniIdHash, since: t - EMAIL_LIMITS.windowMs });
        if (recent.byUser >= EMAIL_LIMITS.maxSendsPerUser || recent.byTarget >= EMAIL_LIMITS.maxSendsPerTarget) {
            return { code: 'rate_limited' };
        }

        const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
        await repo.setEmailChallenge(stateHash, {
            uniIdHash,
            affiliation: decision.affiliation,
            codeHash: codeHash(stateHash, code),
            sentAt: t,
        });
        await repo.logEmailSend({ discordUserId: state.discordUserId, targetHash: uniIdHash, sentAt: t });

        try {
            await mailer.send({
                to: `${decision.local}@${emailConfig.domain}`,
                subject: `Κωδικός επιβεβαίωσης: ${code}`,
                text: [
                    'Καλησπέρα,',
                    '',
                    `Ο κωδικός επιβεβαίωσης για τον διακομιστή Discord «Πληροφορική UoWM» είναι: ${code}`,
                    '',
                    'Ο κωδικός ισχύει μέχρι να λήξει ο σύνδεσμος που λάβατε στο Discord (10 λεπτά).',
                    'Αν δεν ζητήσατε εσείς αυτόν τον κωδικό, αγνοήστε αυτό το μήνυμα. Κανείς δεν μπορεί να συνδεθεί χωρίς πρόσβαση στο email σας.',
                    '',
                    'Πληροφορική UoWM Discord (ανεπίσημη υπηρεσία φοιτητών)',
                ].join('\n'),
            });
        } catch (err) {
            logger.error(`Sending verification email failed: ${err.message}`);
            return { code: 'email_send_failed' };
        }

        return { code: 'code_sent', maskedAddress: maskAddress(decision.local, emailConfig.domain) };
    }

    async function verifyCode(token, input) {
        const { problem, stateHash, state } = await loadState(token);
        if (problem) return { code: problem };
        if (!state.emailCodeHash) return { code: 'address_needed' };
        if (state.emailAttempts >= EMAIL_LIMITS.maxAttempts) return { code: 'too_many_attempts' };

        const code = typeof input === 'string' ? input.replace(/\s/g, '') : '';
        if (!/^\d{6}$/.test(code) || !safeEqual(codeHash(stateHash, code), state.emailCodeHash)) {
            const attempts = await repo.incrementEmailAttempts(stateHash);
            if (attempts >= EMAIL_LIMITS.maxAttempts) {
                await repo.claimState(stateHash, now()); // burn the link
                return { code: 'too_many_attempts' };
            }
            return { code: 'wrong_code', attemptsLeft: EMAIL_LIMITS.maxAttempts - attempts };
        }

        if (!(await repo.claimState(stateHash, now()))) {
            return { code: stateProblem(await repo.getState(stateHash), now()) ?? 'used' };
        }

        let result;
        try {
            result = await linker.linkAccount(state.discordUserId, state.emailUniIdHash, state.emailAffiliation);
        } catch (err) {
            logger.error(`Linking after email verification failed: ${err.message}`);
            result = { code: 'error' };
        }
        await linker.notifyResult(state.discordUserId, result);
        return result;
    }

    return { begin, sendCode, verifyCode };
}
