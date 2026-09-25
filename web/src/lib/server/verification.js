// Core verification flow, independent of SvelteKit so it can be tested directly.
//
//   bot /auth  -> inserts auth_states row (hash of random token, discord_user_id, 10 min expiry)
//   GET /login?s=<token>   -> startLogin: checks the state, stores PKCE verifier + nonce,
//                             redirects to the official login page
//   GET /callback?code&state -> completeLogin: same-browser check, single-use claim,
//                             code exchange + ID token validation, policy, link + role

import { classify } from './affiliation.js';
import { hashStateToken, hashUniversityId, safeEqual } from './crypto.js';
import { embedFor } from '../messages.js';

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function stateProblem(state, now) {
    if (!state) return 'invalid_link';
    if (state.usedAt !== null) return 'used';
    if (state.expiresAt <= now) return 'expired';
    return null;
}

export function createVerificationService({ config, repo, provider, discord, now = Date.now, logger = console }) {
    const { discord: roles } = config;

    async function startLogin(token) {
        if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return { code: 'invalid_link' };
        const stateHash = hashStateToken(token);

        let state = await repo.getState(stateHash);
        const problem = stateProblem(state, now());
        if (problem) return { code: problem };

        if (!state.codeVerifier) {
            const checks = provider.newChecks();
            // If two tabs race, the first write wins and both use the stored values.
            await repo.setStateChecks(stateHash, checks.codeVerifier, checks.nonce);
            state = await repo.getState(stateHash);
            if (!state?.codeVerifier) return { code: 'invalid_link' };
        }

        const redirectUrl = await provider.authorizationUrl({ state: token, nonce: state.nonce, codeVerifier: state.codeVerifier });
        return { code: 'redirect', redirectUrl: redirectUrl.toString() };
    }

    // callbackUrl: URL built from PUBLIC_BASE_URL + /callback + the received query string.
    // cookieToken: the token stored in the browser cookie by /login.
    async function completeLogin({ callbackUrl, cookieToken }) {
        const token = callbackUrl.searchParams.get('state');
        if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return { code: 'invalid_link' };
        if (!safeEqual(token, cookieToken)) return { code: 'session_mismatch' };

        const stateHash = hashStateToken(token);
        const state = await repo.getState(stateHash);
        const problem = stateProblem(state, now()) ?? (state.codeVerifier ? null : 'invalid_link');
        if (problem) return { code: problem };

        // Single use: exactly one callback can claim the state, even under concurrency.
        if (!(await repo.claimState(stateHash, now()))) {
            return { code: stateProblem(await repo.getState(stateHash), now()) ?? 'used' };
        }

        const result = await verifyAndLink(callbackUrl, token, state);
        await notifyResult(state.discordUserId, result);
        return result;
    }

    async function verifyAndLink(callbackUrl, token, state) {
        let identity;
        try {
            identity = await provider.exchange(callbackUrl, { state: token, nonce: state.nonce, codeVerifier: state.codeVerifier });
        } catch (err) {
            logger.warn(`OIDC exchange failed: ${err.code ?? ''} ${err.message}`);
            return { code: 'provider_error' };
        }
        if (!identity.claims.sub) return { code: 'provider_error' };

        const decision = classify(identity.claims, config.policy);
        if (!decision.ok) return { code: decision.reason };

        const uniIdHash = hashUniversityId(config.uniIdHashSecret, identity.issuer, identity.claims.sub);
        return linkAccount(state.discordUserId, uniIdHash, decision.affiliation);
    }

    async function linkAccount(discordUserId, uniIdHash, affiliation) {
        const existing = await repo.findUserByDiscordId(discordUserId);
        if (existing) return { code: existing.uniIdHash === uniIdHash ? 'already_verified' : 'discord_already_linked' };

        const member = await discord.getMember(discordUserId);
        if (!member) return { code: 'not_in_guild' };

        if ((await repo.insertUser({ discordUserId, uniIdHash, affiliation })) === 'duplicate') {
            const owner = await repo.findUserByUniHash(uniIdHash);
            if (!owner || owner.discordUserId === discordUserId) return { code: 'already_verified' };
            await reportSecondAccount(discordUserId, owner.discordUserId);
            return { code: 'uni_account_in_use' };
        }

        const isStudent = affiliation === 'student';
        const roleId = isStudent ? roles.studentRoleId : roles.professorRoleId;
        try {
            await discord.addRole(discordUserId, roleId, 'University account verified');
        } catch (err) {
            logger.error(`Adding role failed for ${discordUserId}, rolling back: ${err.message}`);
            await repo.deleteUser(discordUserId);
            return { code: 'error' };
        }

        await clearGuestStatus(discordUserId, member);

        const label = { student: 'φοιτητής', faculty: 'καθηγητής (μέλος ΔΕΠ)', staff: 'προσωπικό' }[affiliation];
        const ping = isStudent ? '' : adminPing();
        await discord.sendChannelMessage(roles.adminChannelId, {
            content: ping || undefined,
            embeds: [{ color: 0x0d86e3, title: 'Νέα επιβεβαίωση', description: `Ο χρήστης <@${discordUserId}> επιβεβαιώθηκε ως ${label}.` }],
            allowed_mentions: { parse: [], roles: ping ? [roles.adminRoleId, roles.moderatorRoleId].filter(Boolean) : [] },
        });

        return { code: isStudent ? 'verified_student' : 'verified_professor', affiliation };
    }

    async function clearGuestStatus(discordUserId, member) {
        if (roles.guestRoleId && member.roles.includes(roles.guestRoleId)) {
            try {
                await discord.removeRole(discordUserId, roles.guestRoleId, 'Guest verified with university account');
            } catch (err) {
                logger.warn(`Could not remove guest role from ${discordUserId}: ${err.message}`);
            }
        }
        const guest = await repo.getGuest(discordUserId);
        if (guest) {
            await discord.deleteMessage(roles.guestChannelId, guest.msgId);
            await repo.deleteGuest(discordUserId);
        }
    }

    async function reportSecondAccount(attemptingUserId, ownerUserId) {
        const ping = adminPing();
        await discord.sendChannelMessage(roles.adminChannelId, {
            content: ping || undefined,
            embeds: [{
                color: 0xed4245,
                title: 'Προσπάθεια σύνδεσης δεύτερου λογαριασμού',
                description: `Ο χρήστης <@${attemptingUserId}> προσπάθησε να επιβεβαιωθεί με ιδρυματικό λογαριασμό που είναι ήδη συνδεδεμένος με τον χρήστη <@${ownerUserId}>.`,
            }],
            allowed_mentions: { parse: [], roles: [roles.adminRoleId, roles.moderatorRoleId].filter(Boolean) },
        });
        await discord.sendDM(ownerUserId, {
            color: 0xed4245,
            title: 'Ειδοποίηση ασφαλείας',
            description:
                'Κάποιος προσπάθησε να συνδέσει τον ιδρυματικό σας λογαριασμό με άλλον λογαριασμό Discord. Η προσπάθεια απορρίφθηκε.\n\n' +
                'Αν δεν ήσασταν εσείς, αλλάξτε άμεσα τον κωδικό σας στο https://account.uowm.gr και ενημερώστε τους διαχειριστές του διακομιστή.',
        });
    }

    function adminPing() {
        return [roles.adminRoleId, roles.moderatorRoleId].filter(Boolean).map((id) => `<@&${id}>`).join(' ');
    }

    // linkAccount and notifyResult are shared with the email code flow (emailVerification.js).
    async function notifyResult(discordUserId, result) {
        await discord.sendDM(discordUserId, embedFor(result.code));
    }

    return { startLogin, completeLogin, linkAccount, notifyResult };
}
