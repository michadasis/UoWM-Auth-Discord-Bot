// Server-rendered HTML for the panel. Every dynamic value goes through escapeHtml.

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const CSS = `
:root { --bg:#1e1f22; --card:#2b2d31; --line:#3f4147; --text:#dbdee1; --muted:#949ba4; --white:#f2f3f5;
  --teal:#4fb8ba; --orange:#f4a11c; --crimson:#e0245e; --blurple:#5865f2; }
* { box-sizing:border-box; }
html,body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 "Segoe UI",system-ui,-apple-system,Roboto,"Noto Sans",sans-serif; }
a { color:var(--teal); }
.wrap { max-width:880px; margin:0 auto; padding:32px 20px 48px; }
.top { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:28px; }
.brand { display:flex; align-items:center; gap:10px; font-weight:800; font-size:18px; color:var(--white); }
.brand .dots { display:flex; gap:5px; }
.brand .dots i { width:10px; height:10px; transform:rotate(45deg); display:block; }
.d1 { background:var(--crimson); } .d2 { background:#bdb8b6; } .d3 { background:var(--teal); } .d4 { background:var(--orange); }
.brand.centered { justify-content:center; margin-bottom:18px; }
.inline { margin:0; }
.user { display:flex; align-items:center; gap:10px; }
.user img { width:32px; height:32px; border-radius:50%; }
.card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:20px 22px; margin-bottom:16px; }
.card h2 { margin:0 0 12px; font-size:16px; color:var(--white); }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; }
.stat { background:var(--bg); border:1px solid var(--line); border-radius:10px; padding:12px 14px; }
.stat b { display:block; font-size:24px; color:var(--white); }
.stat span { color:var(--muted); font-size:13px; }
.muted { color:var(--muted); }
button, .button { font:inherit; font-weight:600; border:0; border-radius:8px; padding:9px 16px; cursor:pointer; text-decoration:none; display:inline-block; }
.primary { background:var(--blurple); color:#fff; }
.ghost { background:transparent; color:var(--text); border:1px solid var(--line); }
.center { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
.box { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:32px 30px; max-width:420px; width:100%; text-align:center; }
.box h1 { margin:0 0 8px; font-size:22px; color:var(--white); }
.box p { margin:0 0 20px; }
nav.tabs { display:flex; gap:6px; margin:-12px 0 22px; }
nav.tabs a { padding:7px 14px; border-radius:8px; color:var(--muted); text-decoration:none; font-weight:600; }
nav.tabs a.on { background:var(--card); color:var(--white); border:1px solid var(--line); }
.field { display:grid; grid-template-columns:220px 1fr; gap:6px 18px; padding:14px 0; border-top:1px solid var(--line); }
.field:first-of-type { border-top:0; }
.field label.name { color:var(--white); font-weight:600; }
.field .help { color:var(--muted); font-size:13px; }
.field .source { font-size:12px; color:var(--muted); margin-top:4px; }
.field .source b { color:var(--teal); font-weight:600; }
textarea.small { min-height:110px; }
select, input[type=text], input[type=number] { width:100%; background:var(--bg); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:8px 10px; font:inherit; }
.checks { display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:4px 12px; max-height:220px; overflow:auto; background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:8px 10px; }
.checks label, .envbox { display:flex; gap:8px; align-items:center; font-size:14px; }
.envbox { margin-top:6px; color:var(--muted); font-size:13px; }
.banner { border-radius:10px; padding:12px 16px; margin-bottom:16px; }
.banner.ok { background:rgba(79,184,186,.12); border:1px solid rgba(79,184,186,.4); }
.banner.err { background:rgba(224,36,94,.12); border:1px solid rgba(224,36,94,.45); }
.banner ul { margin:6px 0 0; padding-left:18px; }
.actions { display:flex; justify-content:flex-end; gap:10px; margin-top:6px; }
textarea { white-space:pre; overflow-wrap:normal; overflow-x:auto; width:100%; min-height:320px; resize:vertical; background:var(--bg); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:12px; font:13.5px/1.55 ui-monospace,"Cascadia Mono",Menlo,Consolas,monospace; }
.two { display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start; }
.chips { display:flex; flex-wrap:wrap; gap:8px 14px; margin:8px 0 12px; font-size:14px; }
.chips code, .preview code, .card code { background:var(--bg); border:1px solid var(--line); border-radius:4px; padding:1px 5px; font-size:12.5px; }
.preview { background:#313338; border-radius:8px; padding:14px 16px; color:#dbdee1; line-height:1.375; overflow-wrap:anywhere; }
.preview .h1 { font-size:24px; font-weight:700; color:#f2f3f5; margin:8px 0 4px; }
.preview .h2 { font-size:20px; font-weight:700; color:#f2f3f5; margin:8px 0 4px; }
.preview .h3 { font-size:16px; font-weight:700; color:#f2f3f5; margin:8px 0 4px; }
.preview .subtext { font-size:12px; color:#949ba4; }
.preview .blank { height:10px; }
.preview ol, .preview ul { margin:2px 0; padding-left:26px; }
.preview .mention { background:rgba(88,101,242,.3); color:#c9cdfb; border-radius:3px; padding:0 2px; font-weight:500; }
.count { font-size:13px; color:var(--muted); margin-top:6px; }
table.list { width:100%; border-collapse:collapse; font-size:14px; }
table.list th, table.list td { text-align:left; padding:7px 8px; border-top:1px solid var(--line); }
table.list th { color:var(--muted); font-weight:600; border-top:0; }
.chip { white-space:nowrap; }
table.list td.date { white-space:nowrap; }
.tag { white-space:nowrap; font-size:12px; border-radius:6px; padding:1px 7px; background:var(--bg); border:1px solid var(--line); color:var(--muted); }
.controls { display:flex; flex-wrap:wrap; gap:12px; align-items:end; }
.controls label { display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--muted); }
.controls select { min-width:180px; }
progress { width:100%; min-width:80px; height:8px; appearance:none; border:0; border-radius:4px; background:var(--bg); overflow:hidden; }
progress::-webkit-progress-bar { background:var(--bg); border-radius:4px; }
progress::-webkit-progress-value { background:var(--teal); border-radius:4px; }
progress::-moz-progress-bar { background:var(--teal); border-radius:4px; }
table.list td.num { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
table.list td.bar { width:30%; }
.chart { width:100%; border-radius:10px; display:block; }
a:hover { text-decoration:underline; }
button:hover, .button:hover { filter:brightness(1.12); text-decoration:none; }
:focus-visible { outline:2px solid var(--teal); outline-offset:2px; }
nav.tabs { overflow-x:auto; scrollbar-width:none; }
nav.tabs a { white-space:nowrap; }
nav.tabs a:hover { color:var(--white); text-decoration:none; }
.card { overflow-x:auto; }
.note { border-radius:10px; padding:10px 14px; margin:0 0 18px; font-size:14px; background:rgba(79,184,186,.12); border:1px solid rgba(79,184,186,.4); }
.recent { list-style:none; margin:0; padding:0; }
.recent li { display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-top:1px solid var(--line); font-size:14px; }
.recent li:first-child { border-top:0; }
.recent .when { color:var(--muted); white-space:nowrap; }
footer.foot { margin-top:36px; padding-top:16px; border-top:1px solid var(--line); color:var(--muted); font-size:12.5px; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.actions { flex-wrap:wrap; align-items:center; }
.actions.sticky { position:sticky; bottom:0; z-index:5; margin:16px -4px 0; padding:12px 4px; background:linear-gradient(to top, var(--bg) 70%, rgba(30,31,34,0)); }
.confirm { display:flex; gap:8px; align-items:center; margin-right:auto; color:var(--muted); font-size:14px; }
.health { list-style:none; margin:0; padding:0; }
.health li { display:flex; gap:10px; align-items:flex-start; padding:9px 0; border-top:1px solid var(--line); font-size:14px; }
.health li:first-child { border-top:0; }
.dot { width:10px; height:10px; border-radius:50%; margin-top:6px; flex-shrink:0; }
.dot.ok { background:var(--teal); } .dot.warn { background:var(--orange); } .dot.err { background:var(--crimson); }
.health a { margin-left:auto; white-space:nowrap; font-size:13px; }
.card .more { display:inline-block; margin-top:10px; font-size:14px; }
.area { font-weight:600; color:var(--white); }
@media (max-width:640px) {
  .field { grid-template-columns:1fr; }
  .wrap { padding:16px 12px 32px; }
  .top { margin-bottom:18px; }
  .brand { font-size:15px; gap:8px; }
  .brand .dots i { width:8px; height:8px; }
  .user { gap:8px; }
  .user span { display:none; }
  .user img { width:28px; height:28px; }
  .user button { padding:7px 12px; }
  nav.tabs { flex-wrap:wrap; gap:4px; margin:-6px 0 16px; }
  nav.tabs a { padding:6px 10px; font-size:14px; }
  .card { padding:16px 14px; }
  textarea { white-space:pre-wrap; min-height:260px; }
  .chart { min-width:640px; }
  .wide-only { display:none; }
  .grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .stat b { font-size:20px; }
}
@media (max-width:860px) { .two { grid-template-columns:1fr; } }
`;

// Changes whenever the CSS changes, so browsers never keep an old cached stylesheet.
const CSS_VERSION = require("crypto").createHash("sha256").update(CSS).digest("hex").slice(0, 10);

const dots = '<span class="dots"><i class="d1"></i><i class="d2"></i><i class="d3"></i><i class="d4"></i></span>';

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1e1f22"/><g transform="rotate(45 32 32)"><rect x="17" y="17" width="13" height="13" fill="#e0245e"/><rect x="34" y="17" width="13" height="13" fill="#4fb8ba"/><rect x="17" y="34" width="13" height="13" fill="#bdb8b6"/><rect x="34" y="34" width="13" height="13" fill="#f4a11c"/></g></svg>`;

function layout(title, body) {
    return `<!doctype html>
<html lang="el">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} · Πληροφορική UoWM</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/panel.css?v=${CSS_VERSION}">
</head>
<body>${body}</body>
</html>`;
}

function messagePage(title, text, action = '<a class="button primary" href="/login">Σύνδεση</a>') {
    return layout(title, `<div class="center"><div class="box">
<div class="brand centered">${dots} Πληροφορική UoWM</div>
<h1>${escapeHtml(title)}</h1>
<p class="muted">${escapeHtml(text)}</p>
${action}
</div></div>`);
}

const LOGIN_NOTES = {
    out: "Αποσυνδεθήκατε.",
    cancelled: "Η σύνδεση ακυρώθηκε.",
    expired: "Η σύνδεσή σας έληξε. Συνδεθείτε ξανά.",
};

const loginPage = (note) => messagePage(
    "Πίνακας διαχείρισης",
    "Μόνο για Admins και Moderators του server. Συνδεθείτε με τον λογαριασμό σας στο Discord.",
    `${LOGIN_NOTES[note] ? `<div class="note">${escapeHtml(LOGIN_NOTES[note])}</div>` : ""}<a class="button primary" href="/auth/start">Σύνδεση με Discord</a>`,
);

const forbiddenPage = () => messagePage(
    "Δεν υπάρχει πρόσβαση",
    "Ο πίνακας είναι μόνο για μέλη του server με ρόλο Admin ή Moderator.",
    '<a class="button ghost" href="/login">Πίσω</a>',
);

const errorPage = () => messagePage("Κάτι πήγε στραβά", "Δοκιμάστε ξανά σε λίγο.", '<a class="button ghost" href="/">Αρχική</a>');
const notFoundPage = () => messagePage("Δεν βρέθηκε", "Η σελίδα δεν υπάρχει.", '<a class="button ghost" href="/">Αρχική</a>');

function avatarUrl(user) {
    return user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
        : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;
}

const footer = () => `<footer class="foot"><span>Πληροφορική UoWM · Πίνακας διαχείρισης του bot</span><span>Ανεπίσημη υπηρεσία από φοιτητές</span></footer>`;

const TABS = [["/", "Αρχική"], ["/stats", "Στατιστικά"], ["/settings", "Ρυθμίσεις"], ["/verify-text", "Μήνυμα επαλήθευσης"], ["/periods", "Περίοδοι"], ["/faculty", "Καθηγητές"]];

function header(user, csrf, active) {
    const tabs = TABS.map(([href, label]) => `<a href="${href}"${href === active ? ' class="on"' : ""}>${label}</a>`).join("");
    return `<div class="top">
  <div class="brand">${dots} Πληροφορική UoWM</div>
  <div class="user">
    <img src="${escapeHtml(avatarUrl(user))}" alt="">
    <span>${escapeHtml(user.globalName || user.username)}</span>
    <form class="inline" method="post" action="/logout">
      <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
      <button class="ghost" type="submit">Αποσύνδεση</button>
    </form>
  </div>
</div>
<nav class="tabs">${tabs}</nav>`;
}

// [{ area, summary, who, when }] as a list.
const recentList = (items) => `<ul class="recent">${items.map((r) => `<li><span><span class="area">${escapeHtml(r.area)}</span> ${escapeHtml(r.summary)} <span class="muted">· ${escapeHtml(r.who)}</span></span><span class="when">${escapeHtml(r.when)}</span></li>`).join("")}</ul>`;

function historyPage({ user, csrf, entries }) {
    return layout("Ιστορικό", `<div class="wrap">
${header(user, csrf, "/")}
<div class="card">
  <h2>Ιστορικό αλλαγών</h2>
  ${entries.length ? recentList(entries) : '<p class="muted">Καμία αλλαγή ακόμα.</p>'}
  <p class="count">Οι 100 πιο πρόσφατες αλλαγές από τον πίνακα.</p>
</div>
${footer()}
</div>`);
}

// user: { id, username, globalName, avatar }. info: numbers for the overview.
// recent: [{ what, who, when }] latest panel changes.
function dashboardPage({ user, csrf, info, recent = [], health = [] }) {
    const stat = (value, label) => `<div class="stat"><b>${escapeHtml(typeof value === "number" ? value.toLocaleString("el-GR") : value)}</b><span>${escapeHtml(label)}</span></div>`;
    return layout("Πίνακας", `<div class="wrap">
${header(user, csrf, "/")}
<div class="card">
  <h2>Κατάσταση</h2>
  <ul class="health">${health.map((c) => `<li><span class="dot ${escapeHtml(c.status)}"></span><span>${escapeHtml(c.text)}</span>${c.href ? `<a href="${escapeHtml(c.href)}">Διόρθωση</a>` : ""}</li>`).join("")}</ul>
</div>
<div class="card">
  <h2>Μέλη</h2>
  <div class="grid">
    ${stat(info.students, "Φοιτητές")}
    ${stat(info.faculty, "Καθηγητές")}
    ${stat(info.staff, "Προσωπικό")}
    ${stat(info.guests, "Προσωρινή άδεια")}
    ${stat(info.verified, "Σύνολο επαληθευμένων")}
  </div>
</div>
<div class="card">
  <h2>Bot</h2>
  <div class="grid">
    ${stat(info.guildMembers, `Μέλη στο ${info.guildName}`)}
    ${stat(`${info.ping} ms`, "Ping")}
    ${stat(info.onlineSince, "Σε λειτουργία από")}
  </div>
</div>
<div class="card">
  <h2>Πρόσφατες αλλαγές από τον πίνακα</h2>
  ${recent.length
        ? `${recentList(recent)}<a class="more" href="/history">Όλο το ιστορικό</a>`
        : '<p class="muted">Καμία αλλαγή ακόμα. Ό,τι αλλάζει από τις ρυθμίσεις και τα κείμενα εμφανίζεται εδώ.</p>'}
</div>
${footer()}
</div>`);
}

const GROUPS = [
    ["roles", "Ρόλοι επαλήθευσης"],
    ["semesters", "Εξάμηνα"],
    ["staff", "Διαχείριση"],
    ["channels", "Κανάλια"],
    ["bot", "Bot"],
];

// settings: from lib/settings listSettings. roles: [{ id, name, color }]. channels: [{ id, name, category }].
function settingsPage({ user, csrf, settings, roles, channels, errors = [], saved = false }) {
    const roleName = (id) => roles.find((r) => r.id === id)?.name;
    const channelName = (id) => channels.find((c) => c.id === id)?.name;
    const describe = (s, value) => {
        if (!value) return "κενό";
        if (s.type === "role") return `@${roleName(value) ?? value}`;
        if (s.type === "channel") return `#${channelName(value) ?? value}`;
        if (s.type === "roles") return value.split(",").map((id) => `@${roleName(id) ?? id}`).join(", ");
        if (s.type === "lines") return value.split("\n").join(" / ");
        return value;
    };
    const source = (s) => s.source === "panel"
        ? `Από τον πίνακα. Στο .env: ${escapeHtml(describe(s, s.envValue))}`
        : s.source === "env" ? "Από το .env" : "Δεν έχει οριστεί";
    const envBox = (s) => s.source === "panel"
        ? `<label class="envbox"><input type="checkbox" name="${s.key}__env" value="1"> Επαναφορά στην τιμή του .env</label>`
        : "";
    const roleOption = (r, selected) => `<option value="${escapeHtml(r.id)}"${selected ? " selected" : ""}>@${escapeHtml(r.name)}</option>`;

    function input(s) {
        if (s.type === "role") {
            return `<select id="f-${s.key}" name="${s.key}"><option value="">(κανένας)</option>${roles.map((r) => roleOption(r, r.id === s.value)).join("")}</select>`;
        }
        if (s.type === "roles") {
            const chosen = new Set(String(s.value || "").split(",").filter(Boolean));
            return `<div class="checks">${roles.map((r) => `<label><input type="checkbox" name="${s.key}" value="${escapeHtml(r.id)}"${chosen.has(r.id) ? " checked" : ""}>@${escapeHtml(r.name)}</label>`).join("")}</div>`;
        }
        if (s.type === "channel") {
            return `<select id="f-${s.key}" name="${s.key}"><option value="">(κανένα)</option>${channels.map((c) => `<option value="${escapeHtml(c.id)}"${c.id === s.value ? " selected" : ""}>#${escapeHtml(c.name)}${c.category ? ` (${escapeHtml(c.category)})` : ""}</option>`).join("")}</select>`;
        }
        if (s.type === "lines") {
            return `<textarea class="small" id="f-${s.key}" name="${s.key}" rows="5" spellcheck="false">${escapeHtml(s.value)}</textarea>`;
        }
        if (s.type === "number") {
            return `<input type="number" id="f-${s.key}" name="${s.key}" min="${s.min}" max="${s.max}" step="1" value="${escapeHtml(s.value)}">`;
        }
        return `<input type="text" id="f-${s.key}" name="${s.key}" maxlength="${s.maxLength ?? 200}" value="${escapeHtml(s.value)}">`;
    }

    const cards = GROUPS.map(([group, title]) => {
        const fields = settings.filter((s) => s.group === group).map((s) => `<div class="field">
  <div><label class="name" for="f-${s.key}">${escapeHtml(s.label)}</label><div class="help">${escapeHtml(s.help)}</div></div>
  <div>${input(s)}${envBox(s)}<div class="source">${source(s)}</div></div>
</div>`).join("");
        return `<div class="card"><h2>${escapeHtml(title)}</h2>${fields}</div>`;
    }).join("");

    const banner = errors.length
        ? `<div class="banner err"><b>Δεν αποθηκεύτηκε τίποτα:</b><ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul></div>`
        : saved ? '<div class="banner ok">Οι αλλαγές αποθηκεύτηκαν και ισχύουν ήδη.</div>' : "";

    return layout("Ρυθμίσεις", `<div class="wrap">
${header(user, csrf, "/settings")}
${banner}
<form method="post" action="/settings">
<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
${cards}
<p class="muted">Ό,τι αλλάξετε εδώ υπερισχύει του .env. Αλλαγές σε ρόλους που αναφέρονται στο μήνυμα του #επαλήθευση το ξαναστέλνουν (με ping).</p>
<div class="actions sticky"><a class="button ghost" href="/settings">Ακύρωση</a><button class="primary" type="submit">Αποθήκευση</button></div>
</form>
${footer()}
</div>`);
}

function banner({ errors = [], saved = false, savedText = "Αποθηκεύτηκε." }) {
    if (errors.length) return `<div class="banner err"><b>Δεν αποθηκεύτηκε τίποτα:</b><ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul></div>`;
    return saved ? `<div class="banner ok">${escapeHtml(savedText)}</div>` : "";
}

const sourceNote = (fromPanel, fileName) => fromPanel
    ? `Ισχύει η έκδοση του πίνακα. Το <code>${escapeHtml(fileName)}</code> αγνοείται μέχρι να κάνετε επαναφορά.`
    : `Ισχύει το <code>${escapeHtml(fileName)}</code> από το repo. Με την αποθήκευση, η έκδοση του πίνακα θα το αντικαταστήσει.`;

// template: text in the editor. previewHtml: rendered preview. placeholders: [name, roleName].
function verifyTextPage({ user, csrf, template, previewHtml, length, maxLength, fromPanel, placeholders, errors, saved, previewed }) {
    const chips = placeholders.map(([name, role]) => `<span class="chip"><code>{${escapeHtml(name)}}</code> → ${escapeHtml(role ? `@${role}` : "δεν έχει οριστεί")}</span>`).join("");
    return layout("Μήνυμα επαλήθευσης", `<div class="wrap">
${header(user, csrf, "/verify-text")}
${banner({ errors, saved, savedText: "Αποθηκεύτηκε. Το μήνυμα στο #επαλήθευση θα ξανασταλεί με ping, αν άλλαξε." })}
<form method="post" action="/verify-text">
<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
<div class="two">
  <div class="card">
    <h2>Κείμενο</h2>
    <div class="muted">Markdown του Discord. Για ρόλους γράψτε:</div>
    <div class="chips">${chips}</div>
    <textarea name="template" spellcheck="false">${escapeHtml(template)}</textarea>
    <div class="count">${length} / ${maxLength} χαρακτήρες${previewed ? " · προεπισκόπηση, δεν έχει αποθηκευτεί" : ""}</div>
  </div>
  <div class="card">
    <h2>Προεπισκόπηση</h2>
    <div class="preview">${previewHtml}</div>
  </div>
</div>
<p class="muted">${sourceNote(fromPanel, "bot/src/lib/privacyNotice.js")} Κάθε αποθήκευση που αλλάζει το κείμενο ξαναστέλνει το μήνυμα με ping σε όλους.</p>
<div class="actions sticky">
  ${fromPanel ? '<button class="ghost" type="submit" name="action" value="reset">Επαναφορά στο αρχείο</button>' : ""}
  <label class="confirm"><input type="checkbox" name="confirm" value="1"> Θα ξανασταλεί με ping σε όλους</label>
  <button class="ghost" type="submit" name="action" value="preview">Προεπισκόπηση</button>
  <button class="primary" type="submit" name="action" value="save">Αποθήκευση</button>
</div>
</form>
${footer()}
</div>`);
}

// rows: [{ name, start, end, type }] for the current academic year.
function periodsPage({ user, csrf, lines, rows, fromPanel, errors, saved, previewed }) {
    const table = rows.length
        ? `<table class="list"><tr><th>Περίοδος</th><th>Από</th><th>Έως</th><th class="wide-only"></th></tr>${rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td class="date">${escapeHtml(r.start)}</td><td class="date">${escapeHtml(r.end)}</td><td class="wide-only"><span class="tag">${escapeHtml(r.type)}</span></td></tr>`).join("")}</table>`
        : '<p class="muted">Καμία περίοδος.</p>';
    return layout("Περίοδοι", `<div class="wrap">
${header(user, csrf, "/periods")}
${banner({ errors, saved, savedText: "Αποθηκεύτηκε. Ισχύει ήδη στο /stats activity." })}
<form method="post" action="/periods">
<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
<div class="two">
  <div class="card">
    <h2>Περίοδοι</h2>
    <div class="muted">Μία ανά γραμμή: <code>όνομα | αρχή | τέλος</code></div>
    <div class="chips"><span class="chip"><code>09-28 | 01-08</code> κάθε χρόνο</span><span class="chip"><code>easter-6 | easter+7</code> γύρω από το Πάσχα</span><span class="chip"><code>2026-11-02 | 2026-11-06</code> μία φορά</span></div>
    <textarea name="lines" spellcheck="false">${escapeHtml(lines)}</textarea>
    ${previewed ? '<div class="count">Προεπισκόπηση, δεν έχει αποθηκευτεί</div>' : ""}
  </div>
  <div class="card">
    <h2>Φετινό ακαδημαϊκό έτος</h2>
    ${table}
  </div>
</div>
<p class="muted">${sourceNote(fromPanel, "data/periods.json")} Οι ημέρες μετρούν στην πιο συγκεκριμένη περίοδο (π.χ. τα Χριστούγεννα μέσα στο χειμερινό). Τα χρώματα του γραφήματος βγαίνουν από τα ονόματα: Διακοπές, Διάλειμμα, Καλοκαίρι, Εξεταστική.</p>
<div class="actions sticky">
  ${fromPanel ? '<button class="ghost" type="submit" name="action" value="reset">Επαναφορά στο αρχείο</button>' : ""}
  <button class="ghost" type="submit" name="action" value="preview">Προεπισκόπηση</button>
  <button class="primary" type="submit" name="action" value="save">Αποθήκευση</button>
</div>
</form>
${footer()}
</div>`);
}

function facultyPage({ user, csrf, text, count, domain, errors, saved }) {
    return layout("Καθηγητές", `<div class="wrap">
${header(user, csrf, "/faculty")}
${banner({ errors, saved, savedText: "Αποθηκεύτηκε. Ισχύει από την επόμενη επαλήθευση." })}
<form method="post" action="/faculty">
<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
<div class="card">
  <h2>Λίστα καθηγητών</h2>
  <div class="muted">Μία διεύθυνση @${escapeHtml(domain)} ανά γραμμή. Όποιος επαληθεύεται από αυτές παίρνει τον ρόλο Καθηγητής. Οι γραμμές που αρχίζουν με # αγνοούνται.</div>
  <textarea name="text" spellcheck="false">${escapeHtml(text)}</textarea>
  <div class="count">${count} διευθύνσεις</div>
</div>
<p class="muted">Αποθηκεύεται στο <code>data/faculty-emails.txt</code> στον server. Όσοι έχουν ήδη επαληθευτεί κρατούν τον ρόλο τους.</p>
<div class="actions sticky"><a class="button ghost" href="/faculty">Ακύρωση</a><button class="primary" type="submit">Αποθήκευση</button></div>
</form>
${footer()}
</div>`);
}

const nf = (n) => Number(n).toLocaleString("el-GR");

// view: { year, years, channelId, channels, error, empty, total, dayCount, from, to, groups, top, chartUrl, csvUrl }
function statsPage({ user, csrf, view }) {
    const yearOptions = view.years.map((y) => `<option value="${y}"${y === view.year ? " selected" : ""}>${y}</option>`).join("");
    const channelOptions = view.channels.map((c) => `<option value="${escapeHtml(c.id)}"${c.id === view.channelId ? " selected" : ""}>#${escapeHtml(c.name)}${c.category ? ` (${escapeHtml(c.category)})` : ""}</option>`).join("");
    const controls = `<div class="card"><form class="controls" method="get" action="/stats">
  <label>Έτος<select name="year">${yearOptions}</select></label>
  <label>Κανάλι<select name="channel"><option value="">Όλος ο server</option>${channelOptions}</select></label>
  <button class="primary" type="submit">Εμφάνιση</button>
</form></div>`;

    let body;
    if (view.error) {
        body = `<div class="banner err">${escapeHtml(view.error)}</div>`;
    } else if (view.empty) {
        body = `<div class="card"><p class="muted">${escapeHtml(view.empty)}</p></div>`;
    } else {
        const stat = (value, label) => `<div class="stat"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;
        const max = Math.max(1, ...view.groups.map((g) => g.count));
        const periodRows = view.groups.map((g) => `<tr><td>${escapeHtml(g.name)}</td><td class="date">${escapeHtml(g.range)}</td><td class="num">${nf(g.count)}</td><td class="bar wide-only"><progress max="${max}" value="${g.count}"></progress></td></tr>`).join("");
        const topRows = view.top.map((c) => `<tr><td>#${escapeHtml(c.name)}</td><td class="num">${nf(c.count)}</td></tr>`).join("");
        body = `<div class="card">
  <div class="grid">
    ${stat(nf(view.total), "Μηνύματα")}
    ${stat(nf(view.dayCount), "Ημέρες με καταμέτρηση")}
    ${stat(nf(Math.round(view.total / Math.max(1, view.dayCount))), "Μέσος όρος ανά ημέρα")}
  </div>
  <p class="count">${escapeHtml(view.from)} έως ${escapeHtml(view.to)}</p>
</div>
<div class="card"><h2>Ανά ημέρα</h2><img class="chart" src="${escapeHtml(view.chartUrl)}" alt="Γράφημα μηνυμάτων ανά ημέρα"></div>
<div class="two">
  <div class="card"><h2>Ανά περίοδο</h2>${periodRows ? `<table class="list"><tr><th>Περίοδος</th><th>Ημερομηνίες</th><th>Μηνύματα</th><th class="wide-only"></th></tr>${periodRows}</table>` : '<p class="muted">Δεν έχουν οριστεί περίοδοι.</p>'}</div>
  ${view.channelId ? "" : `<div class="card"><h2>Πιο ενεργά κανάλια</h2>${topRows ? `<table class="list"><tr><th>Κανάλι</th><th>Μηνύματα</th></tr>${topRows}</table>` : '<p class="muted">Καμία καταμέτρηση.</p>'}</div>`}
</div>
<div class="actions"><a class="button ghost" href="${escapeHtml(view.csvUrl)}">Λήψη CSV</a></div>`;
    }
    return layout("Στατιστικά", `<div class="wrap">
${header(user, csrf, "/stats")}
${controls}
${body}
${footer()}
</div>`);
}

module.exports = { CSS, FAVICON_SVG, escapeHtml, statsPage, historyPage, loginPage, forbiddenPage, errorPage, notFoundPage, dashboardPage, settingsPage, verifyTextPage, periodsPage, facultyPage, messagePage };
