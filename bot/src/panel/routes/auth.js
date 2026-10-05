// Static files, Discord login and logout.

const pages = require("../pages");
const session = require("../session");
const oauth = require("../discordOAuth");
const access = require("../access");
const { send, redirect, readForm, sameOrigin } = require("../http");
const { setMeta } = require("../../lib/messageStats");
const panelLog = require("../../lib/panelLog");
const { PermissionFlagsBits } = require("discord.js");

module.exports = function authRoutes(ctx) {
    const { pool, config, fetchUser, origin, redirectUri, loginLimit, guild, staffRoles, currentUser, withUser, checkedForm } = ctx;

    return {
        "GET /panel.css": async (req, res) => send(res, 200, pages.CSS, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=3600" }),

        "GET /panel.js": async (req, res) => send(res, 200, pages.CLIENT_JS, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" }),

        "GET /favicon.svg": async (req, res) => send(res, 200, pages.FAVICON_SVG, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" }),

        "GET /login": async (req, res, ip, url) => {
            const who = await currentUser(req);
            if (who.state === "ok") return redirect(res, "/");
            return send(res, 200, pages.loginPage(url.searchParams.get("n")));
        },

        "GET /auth/start": async (req, res, ip) => {
            if (!loginLimit(ip)) return send(res, 429, pages.messagePage("Πολλές προσπάθειες", "Δοκιμάστε ξανά σε λίγα λεπτά."));
            const state = session.randomToken();
            const stateCookie = session.cookie(session.STATE_COOKIE, session.sign(config.sessionSecret, { state, exp: Date.now() + session.STATE_TTL_MS }), session.STATE_TTL_MS);
            return redirect(res, oauth.authorizeUrl({ clientId: config.clientId, redirectUri, state }), [stateCookie]);
        },

        "GET /auth/callback": async (req, res, ip, url) => {
            if (!loginLimit(ip)) return send(res, 429, pages.messagePage("Πολλές προσπάθειες", "Δοκιμάστε ξανά σε λίγα λεπτά."));
            const clearState = session.clearCookie(session.STATE_COOKIE);
            if (url.searchParams.get("error")) return redirect(res, "/login?n=cancelled", [clearState]);

            const cookies = session.parseCookies(req.headers.cookie);
            const saved = session.verify(config.sessionSecret, cookies[session.STATE_COOKIE]);
            const state = url.searchParams.get("state");
            const code = url.searchParams.get("code");
            if (!saved || !state || !code || !session.safeEqual(saved.state, state)) {
                return send(res, 400, pages.messagePage("Η σύνδεση έληξε", "Ξεκινήστε τη σύνδεση από την αρχή."), { "Set-Cookie": [clearState] });
            }

            const user = await fetchUser({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri, code });
            access.forget(user.id);
            const member = await access.fetchMember(await guild(), user.id);
            if (!access.canUsePanel(member, staffRoles())) {
                console.log(`Panel: refused login for ${user.id}`);
                return send(res, 403, pages.forbiddenPage(), { "Set-Cookie": [clearState] });
            }

            console.log(`Panel: ${member.user.tag} (${user.id}) logged in`);
            const value = session.sign(config.sessionSecret, { uid: user.id, csrf: session.randomToken(), iat: Date.now(), exp: Date.now() + session.SESSION_TTL_MS });
            return redirect(res, "/", [clearState, session.cookie(session.SESSION_COOKIE, value, session.SESSION_TTL_MS)]);
        },

        "POST /logout": async (req, res) => {
            const cookies = session.parseCookies(req.headers.cookie);
            const data = session.verify(config.sessionSecret, cookies[session.SESSION_COOKIE]);
            const form = await readForm(req);
            if (!data || !sameOrigin(req, origin) || !session.safeEqual(form.get("csrf") || "", data.csrf)) {
                return send(res, 403, pages.messagePage("Μη έγκυρο αίτημα", "Ανανεώστε τη σελίδα και δοκιμάστε ξανά.", '<a class="button ghost" href="/">Αρχική</a>'));
            }
            return redirect(res, "/login?n=out", [session.clearCookie(session.SESSION_COOKIE)]);
        },

        // Ends every session of this member, on every device.
        "POST /logout/all": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/");
            if (!form) return;
            await setMeta(pool, `panel_logout:${who.user.id}`, String(Date.now()));
            await panelLog.addEntry(pool, who.user.id, "Πρόσβαση", "Αποσύνδεση από όλες τις συσκευές");
            return redirect(res, "/login?n=out", [session.clearCookie(session.SESSION_COOKIE)]);
        }),

        // Ends every session of every member. Only for the owner and Administrators.
        "POST /logout/everyone": async (req, res) => withUser(req, res, async (who) => {
            const form = await checkedForm(req, res, who, "/");
            if (!form) return;
            const m = who.member;
            if (m.id !== m.guild.ownerId && !m.permissions?.has(PermissionFlagsBits.Administrator)) {
                return send(res, 403, pages.messagePage("Δεν επιτρέπεται", "Μόνο ο owner και όσοι έχουν Administrator μπορούν να αποσυνδέσουν όλους.", '<a class="button ghost" href="/">Αρχική</a>'));
            }
            await setMeta(pool, "panel_logout_all", String(Date.now()));
            await panelLog.addEntry(pool, who.user.id, "Πρόσβαση", "Αποσύνδεση όλων από τον πίνακα");
            return redirect(res, "/login?n=out", [session.clearCookie(session.SESSION_COOKIE)]);
        }),
    };
};
