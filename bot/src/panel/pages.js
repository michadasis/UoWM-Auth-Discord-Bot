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
select, input[type=text] { width:100%; background:var(--bg); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:8px 10px; font:inherit; }
.checks { display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:4px 12px; max-height:220px; overflow:auto; background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:8px 10px; }
.checks label, .envbox { display:flex; gap:8px; align-items:center; font-size:14px; }
.envbox { margin-top:6px; color:var(--muted); font-size:13px; }
.banner { border-radius:10px; padding:12px 16px; margin-bottom:16px; }
.banner.ok { background:rgba(79,184,186,.12); border:1px solid rgba(79,184,186,.4); }
.banner.err { background:rgba(224,36,94,.12); border:1px solid rgba(224,36,94,.45); }
.banner ul { margin:6px 0 0; padding-left:18px; }
.actions { display:flex; justify-content:flex-end; gap:10px; margin-top:6px; }
@media (max-width:640px) { .field { grid-template-columns:1fr; } }
`;

const dots = '<span class="dots"><i class="d1"></i><i class="d2"></i><i class="d3"></i><i class="d4"></i></span>';

function layout(title, body) {
    return `<!doctype html>
<html lang="el">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} · Πληροφορική UoWM</title>
<link rel="stylesheet" href="/panel.css">
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

const loginPage = () => messagePage(
    "Πίνακας διαχείρισης",
    "Μόνο για Admins και Moderators του server. Συνδεθείτε με τον λογαριασμό σας στο Discord.",
    '<a class="button primary" href="/auth/start">Σύνδεση με Discord</a>',
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

const TABS = [["/", "Αρχική"], ["/settings", "Ρυθμίσεις"]];

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

// user: { id, username, globalName, avatar }. info: numbers for the overview.
function dashboardPage({ user, csrf, info }) {
    const stat = (value, label) => `<div class="stat"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;
    return layout("Πίνακας", `<div class="wrap">
${header(user, csrf, "/")}
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
<p class="muted">Τα κείμενα και τα στατιστικά θα προστεθούν στις επόμενες φάσεις.</p>
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
            return `<select name="${s.key}"><option value="">(κανένας)</option>${roles.map((r) => roleOption(r, r.id === s.value)).join("")}</select>`;
        }
        if (s.type === "roles") {
            const chosen = new Set(String(s.value || "").split(",").filter(Boolean));
            return `<div class="checks">${roles.map((r) => `<label><input type="checkbox" name="${s.key}" value="${escapeHtml(r.id)}"${chosen.has(r.id) ? " checked" : ""}>@${escapeHtml(r.name)}</label>`).join("")}</div>`;
        }
        if (s.type === "channel") {
            return `<select name="${s.key}"><option value="">(κανένα)</option>${channels.map((c) => `<option value="${escapeHtml(c.id)}"${c.id === s.value ? " selected" : ""}>#${escapeHtml(c.name)}${c.category ? ` (${escapeHtml(c.category)})` : ""}</option>`).join("")}</select>`;
        }
        return `<input type="text" name="${s.key}" maxlength="${s.maxLength ?? 200}" value="${escapeHtml(s.value)}">`;
    }

    const cards = GROUPS.map(([group, title]) => {
        const fields = settings.filter((s) => s.group === group).map((s) => `<div class="field">
  <div><label class="name">${escapeHtml(s.label)}</label><div class="help">${escapeHtml(s.help)}</div></div>
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
<div class="actions"><a class="button ghost" href="/settings">Ακύρωση</a><button class="primary" type="submit">Αποθήκευση</button></div>
</form>
</div>`);
}

module.exports = { CSS, escapeHtml, loginPage, forbiddenPage, errorPage, notFoundPage, dashboardPage, settingsPage, messagePage };
