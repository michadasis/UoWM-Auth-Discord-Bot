# Πληροφορική UoWM Discord Bot

Verification bot for the Discord server of the Department of Informatics, University of Western Macedonia (UoWM).
Members prove they own an institutional `@uowm.gr` mailbox with a one-time code, entirely inside Discord,
and receive the matching role:

```
/auth email:cs01234@uowm.gr   ->  6-digit code arrives by email
[Εισαγωγή κωδικού] or /code 123456  ->  role Φοιτητής
```

No web server, domain or TLS certificate is needed: the bot and a MariaDB database are all there is.

This project is an adaptation of the [IEE Discord Bot](https://github.com/IEE-Team-Atlas/IEE-Discord-Bot)
by IEE-Team-Atlas (Department of Information and Electronic Engineering, International Hellenic University),
released under the MIT License. Copyright (c) 2024 IEE-Team-Atlas. The original license is kept in [LICENSE](./LICENSE).
Many thanks to the original authors.

This is an unofficial, student-run service. It is not operated by the University of Western Macedonia.

## Contents

- [How verification works](#how-verification-works)
- [Commands](#commands)
- [Discord setup](#discord-setup)
- [Channel and role layout](#channel-and-role-layout)
- [Configuration](#configuration)
- [Sending email](#sending-email)
- [Faculty list](#faculty-list)
- [Running](#running)
- [Tests](#tests)
- [Data protection](#data-protection)
- [UoWM single sign-on (future)](#uowm-single-sign-on-future)
- [Changes from the original project](#changes-from-the-original-project)
- [License](#license)

## How verification works

1. A new member only sees #verify and runs `/auth email:cs01234@uowm.gr` (the username alone also works).
2. The bot checks the address:
   - `cs` followed by 4 to 6 digits: Department of Informatics student.
   - an address on the [faculty list](#faculty-list): teaching staff.
   - anything else (other departments such as `psy01234`, other domains, unknown addresses): rejected, no email is sent.
3. The bot emails a 6-digit code to that address and replies privately with an **Εισαγωγή κωδικού** button.
4. The member presses the button and types the code, or runs `/code 123456`.
5. The bot gives the role right away: **Φοιτητής** for students, **Καθηγητής** for faculty, and replies in Greek.

Discord already proves who ran the command; the code proves that person controls the mailbox.
Nobody is ever asked for their university password.

Rules:

- A code is valid for 10 minutes, works once, and only for the Discord account that requested it.
- 5 wrong codes cancel it. Asking for a new code does not reset the count. Only the newest code works.
- A new code at most once per minute, 5 emails per Discord user per hour, 3 emails per mailbox per hour.
- One university account can be linked to at most one Discord account (UNIQUE key on a keyed hash of the
  student number or faculty username). A second attempt is rejected, the admins are alerted and the owner of the
  existing link gets a security DM.

## Commands

| Command | Who | What |
|---|---|---|
| `/auth email` | everyone | Sends a verification code to the given `@uowm.gr` address. |
| `/code code` | everyone | Enters the code (same as the button under the `/auth` reply). |
| `/unverify` | everyone | Deletes your data and removes Φοιτητής/Καθηγητής and semester roles. |
| `/stats` | everyone | Uptime and number of verified members per affiliation. |
| `/force-unverify user [reason]` | admins, moderators | Same as `/unverify` for another member, logged. |
| `/verify-status user` | admins, moderators | Verified or not, affiliation, date, guest status, pending code. |
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
The bot refuses to start with missing or invalid email settings and prints what is wrong.

| Variable | Description |
|---|---|
| `DISCORD_TOKEN`, `GUILD_ID` | Bot token and server ID. |
| `STUDENT_ROLE_ID`, `PROFESSOR_ROLE_ID`, `GUEST_ROLE_ID` | Φοιτητής, Καθηγητής, Guest. |
| `ADMIN_ROLE_ID`, `MODERATOR_ROLE_ID` | May run admin commands, pinged on professor verifications and alerts. |
| `ADMIN_CHANNEL_ID`, `GUEST_CHANNEL_ID` | Private log channels. |
| `SEMESTER_ROLE_IDS`, `SEMESTER_ALLOWED_ROLE_IDS` | Comma-separated. See [Dyno and semester roles](#dyno-and-semester-roles). |
| `BOT_STATUS` | Custom status under the bot's name. Default `Γράψε /auth για επιβεβαίωση`. |
| `UNI_ID_HASH_SECRET` | Key for hashing identifiers and codes, 32+ characters. Do not change after launch. |
| `EMAIL_TRANSPORT` | `smtp`, or `console` to print codes to the bot log instead of sending them (testing only). |
| `EMAIL_FROM` | Sender, e.g. `"Πληροφορική UoWM Discord <sender@gmail.com>"`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Outgoing mail server. |
| `EMAIL_DOMAIN` | Default `uowm.gr`. |
| `EMAIL_STUDENT_PATTERN` | Regex for student usernames. Default `^cs(\d{4,6})$`. The first group is the student number, used for uniqueness. Keep it in single quotes in `.env`. |
| `EMAIL_OTHER_STUDENT_PATTERN` | Usernames that look like students of other departments, for a clearer rejection message. |
| `FACULTY_EMAILS_FILE` | Faculty list. Set by Compose to `/bot/data/faculty-emails.txt`. |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MariaDB. Compose sets `DB_HOST=db`; the root password is random and unused. |

## Sending email

Any SMTP account you control works. The simplest is a dedicated Gmail account:

1. Create a new Gmail account for the bot (not a personal one) and turn on 2-Step Verification.
2. Create an [app password](https://support.google.com/accounts/answer/185833).
3. Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER` to the account and `SMTP_PASS` to the app password.

A transactional email service (Brevo, Mailgun, Amazon SES and similar) with a sender on your own domain and SPF/DKIM
is delivered more reliably. UoWM mailboxes run on Microsoft 365, so the first codes may land in Junk; the bot's
replies already tell members to check there.

## Faculty list

Teaching staff verify with their own address and get Καθηγητής if it is listed in `data/faculty-emails.txt`:

```sh
cp data/faculty-emails.example.txt data/faculty-emails.txt
```

One address per line, `#` starts a comment. Source for the department:
https://cs.uowm.gr/en/home-page/members-of-the-staff/. The file is read on every `/auth`, so edits apply without a
restart. It is gitignored so staff addresses are not republished in the repository. Staff not on the list can be
given the role manually.

## Running

With Docker (recommended):

```sh
cp .env.example .env                                   # fill it in
cp data/faculty-emails.example.txt data/faculty-emails.txt   # then add the real addresses
docker compose up -d --build
docker compose logs -f bot
```

Then run `/post-verify-info` in #verify.

For a first test on a test server, set `EMAIL_TRANSPORT=console`: codes are printed in `docker compose logs bot`
instead of being emailed.

Without Docker (needs Node.js 22 and a MariaDB with `db/setup.sql` applied):

```sh
cd bot && npm install
# export the variables from .env, plus DB_HOST and FACULTY_EMAILS_FILE=../data/faculty-emails.txt
npm start
```

The host only needs outbound internet access (Discord and SMTP); nothing has to be reachable from outside.
Back up the `mariadb-data` volume and keep `UNI_ID_HASH_SECRET` safe. Without it the existing hashes cannot be
matched, and the "one university account per Discord account" rule stops working for existing members.

## Tests

```sh
cd bot && npm test
```

The tests run the real verification and linking code with an in-memory repository that mirrors the database
constraints, a fake mailer and a fake Discord. They cover: Informatics student, faculty from the list, outsider,
other department, other domain, expired code, reused code, concurrent submissions, a code used by another Discord
user, one university account on two Discord users, already verified account, wrong codes and cancellation,
attempts not reset by resending, only the newest code valid, resend cooldown, rate limits per mailbox and per user,
no plain code or address stored, SMTP failure, member not in the server, guest cleanup, rollback when the role cannot
be added, address and faculty list parsing, configuration validation and the semester role guard.

The MariaDB queries themselves are not covered by automated tests. Test once end to end on a test server.

## Data protection

Stored per verified member, and nothing else:

| Column | Content |
|---|---|
| `discord_user_id` | Discord user ID |
| `uni_id_hash` | Keyed HMAC-SHA256 of the student number or faculty username, keyed with `UNI_ID_HASH_SECRET` |
| `affiliation` | student or faculty |
| `verified_at` | date of verification |

- Names, email addresses, usernames and student numbers are never stored in plain form, and codes never at all.
- A pending code (`email_challenges`) holds the Discord user ID, the identifier hash, the affiliation and an HMAC of
  the code, for at most 10 minutes.
- `email_send_log` holds the Discord user ID, the identifier hash and the time of each code email, for rate limiting,
  and is purged after 24 hours.
- `/unverify` deletes the member's row. Leaving the server deletes it automatically.
- Admin log messages mention only the Discord user and the affiliation.

The Greek notice for #verify is in `docs/verify-channel.md`.

## UoWM single sign-on (future)

UoWM's SSO (sso.uowm.gr) supports OpenID Connect, which would verify affiliation directly instead of by address
pattern. It needs registration with UoWM IT (`docs/uowm-registration-request.md`, submitted through
https://helpdesk.uowm.gr) and a small web service for the login callback. A complete implementation with that web
service, a mock identity provider and tests is kept at the git tag
[`sso-web-version`](https://github.com/michadasis/UoWM-Auth-Discord-Bot/tree/sso-web-version) and can be brought back if the registration is approved.

## Changes from the original project

- IHU OAuth replaced with email code verification inside Discord; the web service is no longer needed.
- New schema with a UNIQUE key on the hashed university identifier. The plain identifier and registration year are no longer stored.
- New commands `/code`, `/unverify`, `/force-unverify`, `/verify-status` and `/post-verify-info`. `/deauth` was replaced by `/unverify`.
- Removed IHU-specific commands and assets: `/professors`, `/zoom`, `/contact`, `/map`, logos and banner.
- Semester role guard for the Dyno self-roles, and data deletion when a member leaves.
- Fixed upstream bugs: moderator commands required both admin and moderator roles; verifying a guest removed
  the professor role instead of the guest role; "Remove Guest Role" removed the role from the moderator instead
  of the target; guest commands could reply twice after an error.
- Dependencies updated (patched mariadb connector). The container runs as a non-root user and MariaDB has no fixed root password.

## License

MIT. See [LICENSE](./LICENSE). The original copyright notice of IEE-Team-Atlas is retained.
