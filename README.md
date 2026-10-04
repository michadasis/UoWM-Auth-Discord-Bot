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
- [Message statistics](#message-statistics)
- [Admin panel](#admin-panel)
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
   - `aff` followed by digits (e.g. `aff00543`: staff, contractors, temporary teaching staff): university staff,
     if `STAFF_ROLE_ID` is set. These accounts are university-wide, so they get their own role instead of Καθηγητής.
   - anything else (other departments such as `psy01234`, other domains, unknown addresses): rejected, no email is sent.
3. The bot emails a 6-digit code to that address and replies privately with an **Εισαγωγή κωδικού** button.
4. The member presses the button and types the code, or runs `/code 123456`.
5. The bot gives the role right away: **Φοιτητής** for students, **Καθηγητής** for faculty, **Προσωπικό** (or whatever
   you name the `STAFF_ROLE_ID` role) for `aff` accounts, and replies in Greek.

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
| `/stats members` | everyone | Verified students, faculty and staff, guests with temporary access, and bot uptime. |
| `/stats activity [year] [channel]` | everyone | Messages in a calendar year (default: the current one), per period and top channels, with a chart of messages per day. With `channel`, only that channel (a thread counts as its parent). Members only see numbers for channels they can view; hidden channels are left out of the top channels. A Λήψη CSV button under the reply sends a CSV with one row per day (date, period, messages). |
| `/force-unverify user [reason]` | admins, moderators | Same as `/unverify` for another member, logged. |
| `/verify-status user` | admins, moderators | Verified or not, affiliation, date, guest status, pending code. |
| `/post-verify-info` | admins, moderators | Posts the instructions and the privacy notice in the current channel, pinging everyone and the roles. The bot remembers the message and, within a minute of `privacyNotice.js` changing (also after restarts), posts it again with the pings and deletes the old one. Discord does not notify for edits, so a new message is the only way to ping on every update. Running it again moves the message. If the `/post-verified-stats` message is in the same channel, it is posted again right after, so it stays below the instructions. |
| `/stats-backfill` | admins | One-off count of the message history from before live counting began. |
| `/post-verified-stats` | admins, moderators | Posts the `/stats members` numbers in the current channel and keeps the message updated every 5 minutes, also after restarts. Running it again moves the message. |
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
   Προσωπικό (if used) and all semester roles (Α to Η Εξάμηνο). Discord only lets a bot assign or remove roles below its own highest role.
   Keep the admin and moderator roles above the bot role.
6. Enable Developer Mode in Discord (User Settings, Advanced) to copy role and channel IDs into `.env`.

## Channel and role layout

Roles:

| Role | Given by | Access |
|---|---|---|
| @everyone | | #verify only |
| Φοιτητής | bot | general channels, #epilogh-eksamhnou |
| Καθηγητής | bot | general channels only |
| Προσωπικό | bot | general channels only (optional, `STAFF_ROLE_ID`) |
| Guest | moderators | general channels (optionally semesters, see below) |
| Α to Η Εξάμηνο | Dyno (self-role) | the matching semester/course channels |

Channel permissions:

| Channel or category | @everyone | Φοιτητής | Καθηγητής | Guest | Semester role |
|---|---|---|---|---|---|
| #verify | View, Use Application Commands; deny Send Messages | optional | optional | optional | |
| General category | deny View | View | View (also Προσωπικό) | View | |
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
| `STAFF_ROLE_ID` | Role for `aff` accounts not on the faculty list, e.g. Προσωπικό. Empty: `aff` accounts are rejected. |
| `ADMIN_ROLE_ID`, `MODERATOR_ROLE_ID` | May run admin commands, pinged on professor verifications and alerts. |
| `ADMIN_CHANNEL_ID`, `GUEST_CHANNEL_ID` | Private log channels. |
| `SEMESTER_ROLE_IDS`, `SEMESTER_ALLOWED_ROLE_IDS` | Comma-separated. See [Dyno and semester roles](#dyno-and-semester-roles). |
| `BOT_STATUS` | Custom status under the bot's name. Default `Γράψε /auth για επαλήθευση`. |
| `UNI_ID_HASH_SECRET` | Key for hashing identifiers and codes, 32+ characters. Do not change after launch. |
| `EMAIL_TRANSPORT` | `smtp`, or `console` to print codes to the bot log instead of sending them (testing only). |
| `EMAIL_FROM` | Sender, e.g. `"Πληροφορική UoWM Discord <sender@gmail.com>"`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Outgoing mail server. |
| `EMAIL_DOMAIN` | Default `uowm.gr`. |
| `EMAIL_STUDENT_PATTERN` | Regex for student usernames. Default `^cs(\d{4,6})$`. The first group is the student number, used for uniqueness. Keep it in single quotes in `.env`. |
| `EMAIL_STAFF_PATTERN` | Regex for staff/affiliate usernames. Default `^aff(\d{3,7})$`. |
| `EMAIL_OTHER_STUDENT_PATTERN` | Usernames that look like students of other departments, for a clearer rejection message. |
| `FACULTY_EMAILS_FILE` | Faculty list. Set by Compose to `/bot/data/faculty-emails.txt`. |
| `PERIODS_FILE` | Periods for message statistics. Set by Compose to `/bot/data/periods.json`. |
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

## Welcome message

When someone joins, the bot posts in `WELCOME_CHANNEL_ID` (replacing Dyno's welcomer):
"Καλώς ήρθες @μέλος, κάνε την επαλήθευση για να έχεις πρόσβαση: #επαλήθευση." Only the new member
is pinged; bots are not welcomed. The channel, the text (`WELCOME_MESSAGE`, with `{μέλος}` and
`{επαλήθευση}`) and the verify channel (`VERIFY_CHANNEL_ID`) are set in the admin panel
(Ρυθμίσεις > Καλωσόρισμα and Κανάλια). Without a welcome channel there is no welcome.

## Role buttons

Messages with buttons that give or take a role (for example the semesters), made in the admin
panel (Κουμπιά ρόλων) and posted by the bot, replacing Dyno's reaction roles. Each message has a
title, text, colour, footer, footer image (the server icon or an https URL) and up to 25 buttons, each with a role, label, emoji (server or
Unicode) and colour, with a Discord-style preview. "Αποθήκευση και δημοσίευση" posts it in the
chosen channel; later edits update the same message in place, and moving it to another channel
replaces it there.

A click looks at the roles the member has right now: if they have the role it is removed,
otherwise it is added, so roles given earlier by Dyno or by hand behave the same. The reply is
visible only to them. Semester roles are only given to members allowed to have them
(`SEMESTER_ALLOWED_ROLE_IDS`, by default Φοιτητής); others are told to verify first. A button can
only give one of its own menu's roles, and the panel refuses `@everyone`, bot-managed roles and
roles above the bot's. On a fresh install a draft of the semester message is created from
`SEMESTER_ROLE_IDS`, in Α-Η order, using the `sem_a`...`sem_h` server emojis when they exist.

To switch from Dyno: publish the semester message in the semester channel, then delete Dyno's
message and its reaction-role setup. Members keep their roles.

## Automatic replies

When a message matches a rule, the bot replies to it and deletes its reply after the rule's delay
(0 keeps it), so the answer reaches the person without filling the channel. Each member gets a
given rule's reply at most once every 2 minutes. Rules are managed in the admin panel
(Απαντήσεις): a name, the triggers, the reply and the delay, with a box to test a message
against them. A fresh install starts with one rule that points people asking for old exam papers
to the pinned messages and the semester channel.

A trigger is a phrase on its own line; it matches when every word of it starts a word of the
message, in any order. Capitals, accents and greeklish do not matter (`lib/textMatch.js`), so
`παλια θεματ` matches both "Πού είναι τα παλιά θέματα;" and "pou einai ta palia 8emata". In a
reply, `{εξάμηνα}` becomes a link to `SEMESTER_CHANNEL_ID`.

Reading what messages say needs the privileged **Message Content Intent**, enabled in the
developer portal (Bot page) before starting this version; without it Discord refuses the login.

## Semester ping

When a member gets a role that lets them pick semesters (Φοιτητής after verification, or the guest
role if `SEMESTER_ALLOWED_ROLE_IDS` includes it) and has no semester yet, the bot mentions them in
`SEMESTER_CHANNEL_ID` so they know where to go next. The message is deleted as soon as they pick a
semester, or after `SEMESTER_PING_SECONDS` (default 5) at the latest, so the channel stays empty.
Pending pings survive restarts. Both settings can be changed in the admin panel. A very short
delay makes it a "ghost ping": Discord removes the notification badge together with the message.

## Message statistics

The bot counts messages per day (Greek time) and channel, for `/stats activity`. It stores only the counts: no authors and no
content, and it does not read message content at all. Bots, webhooks (such as the exam schedule watcher) and system
messages are not counted, and thread messages count towards their parent channel.

Periods are defined in `data/periods.json` and applied when `/stats activity` runs, so fixing a date re-buckets the existing
counts:

```sh
cp data/periods.example.json data/periods.json
```

Each entry has a `name` and one of the following, all inclusive:

| Form | Example | Meaning |
|---|---|---|
| `"start"`, `"end"` as `MM-DD` | `"start": "09-28", "end": "01-08"` | Repeats every year. An end before the start runs into the next year. The academic year is added to the name, e.g. `Χειμερινό εξάμηνο 2026-2027`. |
| `"easter": { "from", "to" }` | `"easter": { "from": -6, "to": 7 }` | Days relative to Orthodox Easter Sunday, every year. Easter moves by up to five weeks, so fixed dates would be wrong. |
| `"start"`, `"end"` as `YYYY-MM-DD` | `"start": "2026-11-02", "end": "2026-11-06"` | A one-off period, name used as is. |

The example file follows the department's academic calendar (winter 2026-2027, spring 2025-2026), which stays
roughly the same every year, so the file rarely needs edits. Academic years run from September: a period starting in
September or later belongs to that year and the next, anything earlier to the previous year and that one. Periods
may overlap: a day inside both the winter semester and the Christmas break counts as Christmas, the period that
started last. In `/stats activity` every day counts towards exactly one period, so the per-period numbers add up to
the year's total; days outside every period are listed as Εκτός περιόδων. The file is read on every `/stats activity`, so edits apply without a restart.

`/stats activity` also attaches a bar chart of messages per day. Bars are coloured by the name of their period:
names with Διακοπές, Διάλειμμα or Καλοκαίρι are breaks, names with Εξεταστική are exam sessions, anything else is a
semester. The chart is drawn as SVG and rendered to PNG with `@resvg/resvg-js`, which ships prebuilt binaries (no
build tools needed), using the bundled Noto Sans in `bot/assets/fonts` (SIL Open Font License, `OFL.txt`). If the
chart cannot be drawn, the numbers are sent without it.

Live counting starts the first time the bot runs with this feature. To include older messages, an admin runs
`/stats-backfill` once. It reads every channel and public thread the bot can see, counts the messages from before
live counting began, and writes the result in one transaction, so an interrupted run saves nothing and can be run
again. It refuses to run a second time after it has completed, to avoid double counting. The bot needs View Channel
and Read Message History in the channels it should count. Messages sent while the bot was offline are not counted.

## Admin panel

An optional web panel runs inside the bot process on its own HTTPS port, sharing the Discord client
and the database. It is off unless `PANEL_PORT` is set. It covers login, an overview page, statistics,
settings and texts.

- **Login:** "Login with Discord" (OAuth2, scope `identify` only). Only the server owner, members
  with Administrator, and members with the Admin or Moderator role get in. The role is checked
  against the live server on every request (cached for a minute), so removing it removes access.
- **Sessions:** signed `__Host-` cookies (HttpOnly, Secure, SameSite=Lax), valid for 12 hours. The
  OAuth `state` is bound to a separate short-lived signed cookie.
- **Protection:** CSRF token plus same-origin check on every POST, strict Content-Security-Policy,
  HSTS, no framing, `no-store` caching, and a rate limit on the login routes.
- **Settings (phase 2):** roles (Φοιτητής, Καθηγητής, Προσωπικό, Προσωρινή άδεια, Admin, Moderator),
  semester roles, log channels and the bot status, picked from the live server. The status takes
  one line per status, shown in turn every `BOT_STATUS_INTERVAL` minutes (default 5); a line
  starting with Playing, Watching, Listening to or Competing in becomes that kind of activity, any
  other line is a custom status. A saved value is
  stored in the `settings` table and overrides `.env`; it applies at once, without a restart, and
  "Επαναφορά στην τιμή του .env" removes the override. The form refuses `@everyone`, bot-managed
  roles, roles above the bot that it has to assign, and channels where the bot cannot post; one
  invalid field saves nothing. Every change is written to the admin log with who made it. Secrets
  stay in `.env` only.
- **Texts (phase 3):**
  - *Μήνυμα επαλήθευσης:* edit the #verify message with a Discord-style preview. Roles are written
    as placeholders (`{Φοιτητής}`, `{Καθηγητής}`, `{Προσωπικό}`, `{Προσωρινή άδεια}`, `{Admin}`,
    `{Moderator}`), so the text follows role changes in the settings. Saving reposts the message
    right away if the text changed (with pings). Checked for unknown placeholders and Discord's
    2000-character limit. Stored in the `texts` table; "Επαναφορά στο αρχείο" goes back to
    `privacyNotice.js`.
  - *Περίοδοι:* one line per period, `name | start | end`, with `MM-DD` (every year),
    `easter-6 | easter+7` (around Orthodox Easter) or `YYYY-MM-DD` (once), and a table of the
    current academic year. Stored in the `texts` table, overriding `data/periods.json`, so git
    pulls never conflict with it.
  - *Καθηγητές:* edit `data/faculty-emails.txt` directly (it is not in git); every line is checked
    to be an address of the institutional domain, and the file is written atomically.
  Every save is written to the admin log with who made it.
- **Statistics (phase 4):** the `/stats activity` numbers on a page, for any year since the server
  was created and for the whole server or one channel: totals, average per day, messages per
  period, the most active channels, the daily chart (inline SVG; the "σήμερα" marker follows the cursor and shows that day's count, and `/stats/chart.png` downloads it as an image) and the CSV download
  (`/stats/activity.csv`). Like the command, it only lists channels the logged-in member can see.
- **Navigation:** a sidebar grouped into Επισκόπηση, Μέλη, Μηνύματα and Ρυθμίσεις (a menu button on
  phones). Forms warn before leaving with unsaved changes, and the verify message, welcome, role
  buttons and automatic replies preview as you type.
- **Καλωσόρισμα:** its own page for the welcome channel and text, with a preview.
- **Καθηγητές:** a table with each address, the name from its comment, and whether it has been used
  to verify (only yes or no, never which Discord account), with search, add and remove; the whole
  file can still be edited as text.
- **Code layout:** `panel/server.js` holds login, sessions and the shared helpers; every area of
  the panel has its own file in `panel/routes/`.
- **Layout:** works on phones (single column, wrapping tabs, scrollable chart and tables) and
  desktops. Long forms keep their buttons at the bottom of the screen.
- **Home page:** a greeting with how many issues need attention, four tiles (verified members and
  how many joined this week, messages today and in the last 7 days, server members and the share
  verified, active guests), bar charts of messages and verifications over the last 30 days, the
  latest verifications, quick links, bot facts and the latest panel changes.
- **Home page checks:** the bot's Manage Roles permission and role position, roles that no longer
  exist, missing log and semester channels, whether `/post-verify-info` has been run, and the HTTPS
  certificate's expiry (warning from 21 days before), each with a link to the fix where there is one.
- **History:** every save and reset from the panel is kept in the `panel_log` table (who, what,
  when, old and new values for settings). The home page shows the latest and `/history` the last 100.
- **Μέλη:** every verified member with name, username, affiliation and date, searchable (accents
  ignored) and filterable, 50 per page, with a button that removes the verification like
  `/force-unverify` (record, verification and semester roles). Members who left are marked.
- **Προσωρινές άδειες:** give the guest role by username, display name or ID (ambiguous names are
  refused with the matches listed), with a reason; list and remove active ones. Same behaviour as
  the Give/Remove Guest Role commands, which now share `lib/guests.js`.
- **Client script:** `/panel.js` (allowed by the CSP as `script-src 'self'`) adds confirmation
  dialogs before removals, a filter box above long role lists, and a live preview while typing
  the verify message. Every page still works without it.
- **Ping confirmation:** saving a changed verify message requires ticking "Θα ξανασταλεί με ping σε
  όλους", since it reposts with pings.
- **TLS:** the bot serves HTTPS itself with `PANEL_CERT_FILE` and `PANEL_KEY_FILE` (certificate with
  its chain, and key). It reloads them within an hour when the files change, so a renewed
  certificate needs no restart.

Setup:

1. Point a DNS name at the host and get a certificate for it (e.g. a wildcard certificate).
2. In the Developer Portal, application > OAuth2: add the redirect `<PANEL_URL>/auth/callback` and
   copy the Client Secret into `DISCORD_CLIENT_SECRET`.
3. Fill in the panel block of `.env` (see `.env.example`), with a new random `PANEL_SESSION_SECRET`.
4. With Docker, also publish the port in `docker-compose.yml` (e.g. `ports: ["25569:25569"]`).

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
| `affiliation` | student, faculty or staff |
| `verified_at` | date of verification |

- Names, email addresses, usernames and student numbers are never stored in plain form, and codes never at all.
- A pending code (`email_challenges`) holds the Discord user ID, the identifier hash, the affiliation and an HMAC of
  the code, for at most 10 minutes.
- `email_send_log` holds the Discord user ID, the identifier hash and the time of each code email, for rate limiting,
  and is purged after 24 hours.
- `/unverify` deletes the member's row. Leaving the server deletes it automatically.
- Admin log messages mention only the Discord user and the affiliation.
- `message_counts` holds only the number of messages per day and channel, with no link to any member.

The Greek notice for #verify is posted by `/post-verify-info` (text in `bot/src/lib/privacyNotice.js`).

## UoWM single sign-on (future)

UoWM's SSO (sso.uowm.gr) supports OpenID Connect, which would verify affiliation directly instead of by address
pattern. It needs registration with UoWM IT (a request submitted through
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
