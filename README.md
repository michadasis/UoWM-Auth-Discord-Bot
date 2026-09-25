# Πληροφορική UoWM Discord Bot

Verification bot for the Discord server of the Department of Informatics, University of Western Macedonia (UoWM).
Members link their Discord account to their UoWM institutional account through the official UoWM single sign-on
(sso.uowm.gr, OpenID Connect) and receive the matching role.

This project is an adaptation of the [IEE Discord Bot](https://github.com/IEE-Team-Atlas/IEE-Discord-Bot)
by IEE-Team-Atlas (Department of Information and Electronic Engineering, International Hellenic University),
released under the MIT License. Copyright (c) 2024 IEE-Team-Atlas. The original license is kept in [LICENSE](./LICENSE).
Many thanks to the original authors.

This is an unofficial, student-run service. It is not operated by the University of Western Macedonia.

## Contents

- [How verification works](#how-verification-works)
- [Architecture](#architecture)
- [Commands](#commands)
- [Discord setup](#discord-setup)
- [Channel and role layout](#channel-and-role-layout)
- [Configuration](#configuration)
- [Local development with the mock provider](#local-development-with-the-mock-provider)
- [Tests](#tests)
- [Deployment](#deployment)
- [Switching to the real UoWM provider](#switching-to-the-real-uowm-provider)
- [Data protection](#data-protection)
- [Changes from the original project](#changes-from-the-original-project)
- [License](#license)

## How verification works

1. A new member only sees #verify and runs `/auth`.
2. The bot replies (ephemeral) with a personal link `https://<PUBLIC_BASE_URL>/login?s=<token>`.
   The token is random, bound to the Discord user ID, single use and valid for 10 minutes.
   The database only stores its SHA-256 hash.
3. `/login` checks the token, stores a PKCE verifier and nonce, sets a same-browser cookie and redirects to the
   official UoWM login page. Users type their password only there, never in Discord and never on a page we host.
4. UoWM redirects back to `/callback`. The web service checks the cookie, claims the token atomically (single use),
   exchanges the code server-side and validates the ID token (signature, issuer, audience, expiry, nonce) with
   [openid-client](https://github.com/panva/openid-client). Tokens are discarded right after.
5. The eligibility policy (`web/src/lib/server/affiliation.js`) reads the affiliation claims:
   - `faculty`, `staff` or `employee` of uowm.gr: role **Καθηγητής**
   - `student` of uowm.gr **and** in the Department of Informatics: role **Φοιτητής**
   - anything else (affiliate, alum, other institution, other department): rejected
6. The user sees the result in Greek on the web page and in a Discord DM.

One university account can be linked to at most one Discord account (UNIQUE key on a keyed hash of the identifier).
A second attempt is rejected, the admins are alerted and the owner of the existing link gets a security DM.

## Architecture

| Directory | What it is |
|---|---|
| `bot/` | discord.js + CommandKit. Slash commands, role sync events, cleanup jobs. |
| `web/` | SvelteKit (adapter-node). `/login`, `/callback`, result page. Talks to Discord over REST. |
| `db/` | MariaDB schema (`setup.sql`), applied on first start of an empty volume. |
| `mock-idp/` | Zero-dependency mock OpenID Connect provider with test users. Development and tests only. |
| `docs/` | #verify channel text, registration request to the UoWM NOC. |

The bot and the web service never call each other. They share the database and the bot token.

The authentication provider is pluggable (`web/src/lib/server/provider/`). `AUTH_PROVIDER=uowm` uses the real
UoWM SSO, `AUTH_PROVIDER=mock` uses the mock server. Both go through the same OpenID Connect code.

## Commands

| Command | Who | What |
|---|---|---|
| `/auth` | everyone | Personal login link (single use, 10 minutes). |
| `/unverify` | everyone | Deletes your data and removes Φοιτητής/Καθηγητής and semester roles. |
| `/stats` | everyone | Uptime and number of verified members per affiliation. |
| `/force-unverify user [reason]` | admins, moderators | Same as `/unverify` for another member, logged. |
| `/verify-status user` | admins, moderators | Verified or not, affiliation, date, guest status, pending link. |
| `/post-verify-info` | admins, moderators | Posts the instructions and the privacy notice in the current channel. |
| Give Guest Role (user context menu) | admins, moderators | Guest role with a logged reason, e.g. first-year students without an account yet. |
| Remove Guest Role (user context menu) | admins, moderators | Removes the guest role and its log entry. |

Admin commands are hidden from members without Manage Roles and additionally require the admin or moderator role.

## Discord setup

1. Create an application at https://discord.com/developers/applications and add a bot.
2. Copy the bot token into `DISCORD_TOKEN`. Never share it or commit it.
3. Under Bot, enable **Server Members Intent** (privileged). The bot does not need Message Content Intent or Presence Intent.
4. Invite the bot with the scopes `bot` and `applications.commands` and these permissions:
   - Manage Roles
   - View Channels
   - Send Messages
   - Embed Links
   - Read Message History

   Invite URL (permissions integer 268520448):
   `https://discord.com/oauth2/authorize?client_id=<APPLICATION_ID>&scope=bot+applications.commands&permissions=268520448`
5. In Server Settings, Roles, drag the bot's role **above** every role it manages: Φοιτητής, Καθηγητής, Guest and
   all semester roles (Α to Η Εξάμηνο). Discord only lets a bot assign or remove roles below its own highest role.
   Keep the admin and moderator roles above the bot role.
6. Enable Developer Mode in Discord (User Settings, Advanced) to copy role and channel IDs into `.env`.

## Channel and role layout

Roles:

| Role | Given by | Access |
|---|---|---|
| @everyone | | #verify only |
| Φοιτητής | bot | general channels, #epilogh-eksamhnou |
| Καθηγητής | bot | general channels only |
| Guest | moderators | general channels (optionally semesters, see below) |
| Α to Η Εξάμηνο | Dyno (self-role) | the matching semester/course channels |

Channel permissions:

| Channel or category | @everyone | Φοιτητής | Καθηγητής | Guest | Semester role |
|---|---|---|---|---|---|
| #verify | View, Use Application Commands; deny Send Messages | optional | optional | optional | |
| General category | deny View | View | View | View | |
| #epilogh-eksamhnou | deny View | View, Read History, Add Reactions | | optional | |
| Semester category (one per semester) | deny View | | | | View (only its own) |
| Admin and guest log channels | deny View | | | | |

Admin and moderator roles and the bot need View and Send Messages in the two log channels.

### Dyno and semester roles

Nothing changes for Dyno: members still pick semesters with Dyno's reaction roles in #epilogh-eksamhnou.

- Only Φοιτητής can see #epilogh-eksamhnou, so only verified students can pick semesters.
- Dyno's role must also be above the semester roles, and Dyno needs View, Read History and Add Reactions in that channel.
- Discord permissions cannot express "semester role AND verified". The bot therefore removes semester roles from
  any member who does not hold an allowed role (default: Φοιτητής). This covers `/unverify`, `/force-unverify`,
  members who got a semester role by any other path, and changes made while the bot was offline (sweep on start).
- Set `SEMESTER_ROLE_IDS` to the Α to Η role IDs. To let guests pick semesters as well, set
  `SEMESTER_ALLOWED_ROLE_IDS=<STUDENT_ROLE_ID>,<GUEST_ROLE_ID>` and give Guest View in #epilogh-eksamhnou.
- Do not configure Dyno autoroles that assign Φοιτητής or Καθηγητής.

## Configuration

Copy `.env.example` to `.env` and fill it in. All secrets live in environment variables.

| Variable | Used by | Description |
|---|---|---|
| `PUBLIC_BASE_URL` | bot, web | Public origin of the web service, no trailing slash. https in production. Redirect URI is `PUBLIC_BASE_URL/callback`. |
| `WEB_PORT` | compose | Host port for the web service (bound to 127.0.0.1). Default 3000. |
| `PUBLIC_DISCORD_INVITE` | web | Optional invite link on the landing page. |
| `AUTH_PROVIDER` | web | `mock` or `uowm`. |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | web, mock | Client credentials issued by the UoWM NOC (any values for mock). |
| `OIDC_ISSUER` | web | Default `https://sso.uowm.gr/oidc`. |
| `OIDC_SCOPES` | web | Default `openid extendedProfile`. Confirm with the NOC. |
| `OIDC_FETCH_USERINFO` | web | Also call the userinfo endpoint. Default `true`. |
| `MOCK_ISSUER`, `MOCK_INTERNAL_ORIGIN` | web, mock | Mock provider URL as seen by the browser and by the web container. |
| `UNI_ID_HASH_SECRET` | web | Key for hashing university identifiers, 32+ characters. Do not change after launch. |
| `EXPECTED_HOME_ORG` | web | Default `uowm.gr`. `off` only if the provider releases neither `eduPersonScopedAffiliation` nor `schacHomeOrganization`. |
| `STUDENT_DEPARTMENT_FILTER` | web | `on` (default) or `off`. |
| `STUDENT_DEPARTMENT_CLAIM`, `STUDENT_DEPARTMENT_PATTERN` | web | Claim and case-insensitive regex identifying Department of Informatics students. Required when the filter is on. |
| `DISCORD_TOKEN`, `GUILD_ID` | bot, web | Bot token and server ID. |
| `STUDENT_ROLE_ID`, `PROFESSOR_ROLE_ID`, `GUEST_ROLE_ID` | bot, web | Φοιτητής, Καθηγητής, Guest. |
| `ADMIN_ROLE_ID`, `MODERATOR_ROLE_ID` | bot, web | May run admin commands, pinged on professor verifications and alerts. |
| `ADMIN_CHANNEL_ID`, `GUEST_CHANNEL_ID` | bot, web | Private log channels. |
| `SEMESTER_ROLE_IDS`, `SEMESTER_ALLOWED_ROLE_IDS` | bot | Comma-separated. See [Dyno and semester roles](#dyno-and-semester-roles). |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | all | MariaDB credentials. The root password is random and unused. |

The web service refuses to start with an incomplete or unsafe configuration (for example `uowm` without https,
or the department filter on without a claim) and prints what is missing.

## Local development with the mock provider

The mock provider (`mock-idp/`) implements discovery, authorization code with PKCE, RS256-signed ID tokens,
userinfo and JWKS. Its "login page" is a list of test users with no passwords, and a red banner saying it is not the
university. Test users are defined in `mock-idp/users.json`:

| Test user | Expected result |
|---|---|
| `student` | Φοιτητής |
| `student-other-dept` | rejected, other department |
| `faculty` | Καθηγητής |
| `staff` | Καθηγητής |
| `outsider` | rejected, not a student or staff member |
| `foreign-student` | rejected, other institution |

With Docker:

```sh
cp .env.example .env        # keep AUTH_PROVIDER=mock, fill in the Discord values of a TEST server
docker compose --profile mock up --build
```

Then run `/auth` in the test server and open the link. The web service is on http://localhost:3000 and the mock
provider on http://localhost:4000.

Without Docker (a local MariaDB is still needed for the full flow):

```sh
cd mock-idp && MOCK_ISSUER=http://localhost:4000 OIDC_CLIENT_ID=... OIDC_CLIENT_SECRET=... PUBLIC_BASE_URL=http://localhost:3000 node server.js
cd web && npm install && npm run dev -- --port 3000      # with the variables from .env exported
cd bot && npm install && npm start
```

## Tests

```sh
cd web && npm test
cd bot && npm test
```

The web tests run the real OpenID Connect client against the mock provider, with an in-memory repository that
mirrors the database constraints and a fake Discord API. They cover: student, faculty, staff, outsider,
other institution, other department, expired link (before login and during login), reused link (at `/login` and
replayed callback), concurrent callbacks, one university account on two Discord users, a Discord account already
linked, callback from a different browser, tampered state, cancelled login, member not in the server, guest cleanup,
rollback when the role cannot be added, the eligibility policy and configuration validation.

The bot tests cover the semester role guard and the state hash format shared with the web service.

The MariaDB repository itself is not covered by automated tests. Test it once end to end with the mock profile.

## Deployment

1. A Linux host with Docker Engine and the Compose plugin, and a domain name for the web service.
2. Put a TLS-terminating reverse proxy in front of the web service, which listens on 127.0.0.1:3000.
   Example with Caddy (`/etc/caddy/Caddyfile`):

   ```
   verify.example.org {
       reverse_proxy 127.0.0.1:3000
   }
   ```

3. Create `.env` from `.env.example` with production values and strong random secrets.
   `PUBLIC_BASE_URL` must be the https origin served by the proxy.
4. `docker compose up -d --build` (without the mock profile).
5. Run `/post-verify-info` in #verify.
6. Back up the `mariadb-data` volume and keep `UNI_ID_HASH_SECRET` safe. Without it the existing hashes cannot be
   matched, and the "one university account per Discord account" rule stops working for existing members.

`db/setup.sql` only runs when the database volume is empty. This schema is not compatible with the original
IEE bot schema, so start with a fresh volume.

## Switching to the real UoWM provider

1. Send the registration request in `docs/uowm-registration-request.md` to the UoWM NOC.
2. From the reply, set `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and, if needed, `OIDC_SCOPES`.
3. Set `STUDENT_DEPARTMENT_CLAIM` and `STUDENT_DEPARTMENT_PATTERN` to the attribute and value the NOC gives for
   the Department of Informatics. The values in `.env.example` only match the mock users.
4. Set `AUTH_PROVIDER=uowm`, restart, and verify with your own account first.

UoWM's discovery document also advertises a password grant and dynamic client registration. This project uses
neither: users authenticate only on the official login page, and the client is registered by the NOC.

## Data protection

Stored per verified member, and nothing else:

| Column | Content |
|---|---|
| `discord_user_id` | Discord user ID |
| `uni_id_hash` | HMAC-SHA256 of the issuer and subject identifier, keyed with `UNI_ID_HASH_SECRET` |
| `affiliation` | student, faculty or staff |
| `verified_at` | date of verification |

- Names, emails, usernames, registration numbers and OAuth tokens are never stored.
- Pending login links (`auth_states`) hold only a hash of the link token, the Discord user ID and the PKCE values,
  and are purged an hour after expiry.
- `/unverify` deletes the member's row. Leaving the server deletes it automatically.
- Admin log messages mention only the Discord user and the affiliation.

The Greek notice for #verify is in `docs/verify-channel.md`.

## Changes from the original project

- IHU OAuth provider replaced with a pluggable provider: OpenID Connect for the UoWM SSO, plus a mock.
- Login links are single use, expire after 10 minutes, are bound to the browser that opened them, and are stored hashed.
- New schema with a UNIQUE key on the hashed university identifier. The plain identifier and registration year are no longer stored.
- New commands `/unverify`, `/force-unverify`, `/verify-status` and `/post-verify-info`. `/deauth` was replaced by `/unverify`.
- Removed IHU-specific commands and assets: `/professors`, `/zoom`, `/contact`, `/map`, logos and banner.
- Semester role guard for the Dyno self-roles, and data deletion when a member leaves.
- Fixed upstream bugs: moderator commands required both admin and moderator roles; verifying a guest removed
  the professor role instead of the guest role; "Remove Guest Role" removed the role from the moderator instead
  of the target; guest commands could reply twice after an error.
- Dependencies updated (Svelte 5, patched mariadb connector). Containers run as a non-root user, MariaDB has no fixed
  root password and the web port is bound to localhost.

## License

MIT. See [LICENSE](./LICENSE). The original copyright notice of IEE-Team-Atlas is retained.
