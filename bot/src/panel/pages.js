// Server-rendered HTML for the panel. Every dynamic value goes through escapeHtml.

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const CSS = `
:root { --bg:#1e1f22; --card:#2b2d31; --line:#3f4147; --text:#dbdee1; --muted:#949ba4; --white:#f2f3f5;
  --teal:#4fb8ba; --orange:#f4a11c; --crimson:#e0245e; --blurple:#5865f2; }
* { box-sizing:border-box; }
html,body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 "Segoe UI",system-ui,-apple-system,Roboto,"Noto Sans",sans-serif; }
a { color:var(--teal); }
.wrap { max-width:1180px; margin:0 auto; padding:24px 20px 40px; }
.shell { display:grid; grid-template-columns:200px minmax(0,1fr); gap:28px; align-items:start; }
.side { position:sticky; top:16px; display:flex; flex-direction:column; gap:18px; }
.nav-group { display:flex; flex-direction:column; gap:2px; }
.nav-title { font-size:11.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); padding:0 10px 4px; }
.side a, .mobile-nav a { padding:7px 10px; border-radius:8px; color:var(--text); text-decoration:none; font-weight:500; font-size:14.5px; }
.side a:hover, .mobile-nav a:hover { background:rgba(255,255,255,.04); color:var(--white); text-decoration:none; }
.side a.on, .mobile-nav a.on { background:var(--card); color:var(--white); font-weight:700; box-shadow:inset 3px 0 0 var(--teal); }
.mobile-nav { display:none; margin:-6px 0 14px; }
.mobile-nav summary { cursor:pointer; list-style:none; background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 14px; font-weight:700; color:var(--white); }
.mobile-nav summary::-webkit-details-marker { display:none; }
.mobile-nav summary::after { content:"▾"; float:right; color:var(--muted); }
.mobile-nav[open] summary::after { content:"▴"; }
.mobile-nav nav { display:grid; gap:12px; background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px; margin-top:6px; }
@media (max-width:860px) { .shell { display:block; } .side { display:none; } .mobile-nav { display:block; } }
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
.chart-wrap { overflow-x:auto; }
.activity-chart { width:100%; height:auto; display:block; border-radius:10px; touch-action:pan-y; cursor:crosshair; }
a:hover { text-decoration:underline; }
button:hover, .button:hover { filter:brightness(1.12); text-decoration:none; }
:focus-visible { outline:2px solid var(--teal); outline-offset:2px; }
.card { overflow-x:auto; }
.note { border-radius:10px; padding:10px 14px; margin:0 0 18px; font-size:14px; background:rgba(79,184,186,.12); border:1px solid rgba(79,184,186,.4); }
.recent { list-style:none; margin:0; padding:0; }
.recent li { display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-top:1px solid var(--line); font-size:14px; }
.recent li:first-child { border-top:0; }
.recent .when { color:var(--muted); white-space:nowrap; }
footer.foot { margin-top:36px; padding-top:16px; border-top:1px solid var(--line); color:var(--muted); font-size:12.5px; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.actions { flex-wrap:wrap; align-items:center; }
.wrap.wide { max-width:1400px; }
.editor-grid { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); gap:16px; align-items:start; }
.editor-grid .preview-card { position:sticky; top:12px; max-height:calc(100vh - 110px); overflow:auto; }
textarea.wrap-text { white-space:pre-wrap; overflow-wrap:anywhere; min-height:560px; font-size:14px; line-height:1.6; }
.count.over { color:var(--crimson); font-weight:600; }
input.filter, .toolbar input[type=search] { width:100%; background:var(--bg); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:7px 10px; font:inherit; margin-bottom:8px; }
.toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:end; margin-bottom:6px; }
.toolbar label { display:flex; flex-direction:column; gap:4px; font-size:13px; color:var(--muted); flex:1; min-width:180px; }
.toolbar select { min-width:150px; }
.person { display:flex; align-items:center; gap:10px; }
.person img { width:28px; height:28px; border-radius:50%; flex-shrink:0; }
.person .sub { color:var(--muted); font-size:12.5px; }
.danger { background:transparent; color:#ff8fa8; border:1px solid rgba(224,36,94,.55); padding:6px 12px; font-size:13px; }
.pager { display:flex; gap:8px; justify-content:flex-end; align-items:center; margin-top:12px; font-size:14px; }
.tag.off { color:var(--orange); border-color:rgba(244,161,28,.5); }
.rule { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:16px; }
.rule h3 { margin:0 0 6px; font-size:16px; color:var(--white); display:flex; gap:8px; align-items:center; }
.rule .meta { color:var(--muted); font-size:13px; margin-bottom:8px; }
.rule .chips code { white-space:nowrap; }
.rule-actions { display:flex; gap:8px; margin-top:10px; }
.form-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:14px; }
.form-grid label.block { display:flex; flex-direction:column; gap:5px; font-size:13px; color:var(--muted); }
.form-grid textarea { min-height:150px; white-space:pre-wrap; }
.form-grid input[type=text], .form-grid input[type=number] { width:100%; }
.match { border-radius:10px; padding:10px 14px; margin-top:10px; font-size:14px; }
.match.yes { background:rgba(79,184,186,.12); border:1px solid rgba(79,184,186,.4); }
.match.no { background:rgba(244,161,28,.10); border:1px solid rgba(244,161,28,.4); }
@media (max-width:760px) { .rule, .form-grid { grid-template-columns:1fr; } }
.dembed { position:relative; background:#2b2d31; border-radius:4px; padding:12px 16px 14px 18px; max-width:520px; overflow:hidden; }
.dembed .bar { position:absolute; left:0; top:0; width:4px; height:100%; }
.dembed .t { font-weight:700; color:#f2f3f5; margin-bottom:6px; }
.dembed .f { font-size:12px; color:#b5bac1; margin-top:10px; display:flex; align-items:center; gap:8px; }
.dembed .f img { width:20px; height:20px; border-radius:50%; }
.block-group { display:flex; flex-direction:column; gap:12px; }
.form-grid label.block select, .form-grid label.block input[type=text] { margin-top:2px; }
.dmsg { background:#313338; border-radius:8px; padding:14px; }
.dbuttons { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; max-width:560px; }
.dbtn { display:inline-flex; align-items:center; gap:6px; border-radius:4px; padding:6px 14px; font-size:14px; font-weight:500; color:#fff; }
.dbtn.primary { background:#5865f2; } .dbtn.secondary { background:#4e5058; } .dbtn.success { background:#248046; } .dbtn.danger { background:#da373c; }
.dbtn img { width:18px; height:18px; }
.btn-rows { width:100%; border-collapse:collapse; font-size:14px; }
.btn-rows th { text-align:left; color:var(--muted); font-weight:600; padding:6px; }
.btn-rows td { padding:4px 6px; vertical-align:top; }
.btn-rows input[type=text], .btn-rows input[type=number], .btn-rows select { width:100%; background:var(--bg); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:7px 8px; font:inherit; }
.btn-rows td.pos { width:64px; }
input[type=color] { width:64px; height:36px; padding:2px; background:var(--bg); border:1px solid var(--line); border-radius:8px; }
.status { font-size:13px; color:var(--muted); }
.status b { color:var(--teal); }
.tag.on { color:var(--teal); border-color:rgba(79,184,186,.5); }
details.card summary { cursor:pointer; }
details.card[open] summary { margin-bottom:10px; }
.form-grid.single { grid-template-columns:1fr; }
.form-grid textarea.short { min-height:110px; }
.card-scroll { overflow-x:auto; margin:8px 0; }
.btn-rows input[name=btn_emoji_text] { margin-top:4px; }
.preview-inline .h1, .preview-inline .h2, .preview-inline .h3 { color:#f2f3f5; font-weight:700; }
.preview-inline .blank { height:10px; }
.greet { margin:-4px 0 18px; }
.greet h1 { margin:0 0 2px; font-size:24px; color:var(--white); }
.greet p { margin:0; }
.kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-bottom:16px; }
.kpi { display:flex; flex-direction:column; gap:2px; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 16px; color:var(--text); text-decoration:none; transition:border-color .15s; }
.kpi:hover { border-color:var(--teal); text-decoration:none; }
.kpi b { font-size:28px; color:var(--white); line-height:1.15; }
.kpi .label { font-weight:600; }
.kpi .sub { color:var(--muted); font-size:13px; }
.home-grid { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(0,1fr); gap:16px; align-items:start; }
.home-grid > div { min-width:0; }
.spark { width:100%; height:64px; display:block; margin:4px 0 12px; }
.spark-head { display:flex; justify-content:space-between; font-size:14px; font-weight:600; }
.spark-axis { display:flex; justify-content:space-between; color:var(--muted); font-size:12px; margin-top:-6px; }
.recent li .person { min-width:0; }
.quick-search { display:flex; gap:8px; margin-bottom:10px; }
.quick-search input { flex:1; min-width:0; background:var(--bg); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:8px 10px; font:inherit; }
.quick { list-style:none; margin:0; padding:0; }
.quick li { border-top:1px solid var(--line); }
.quick li:first-child { border-top:0; }
.quick a { display:flex; justify-content:space-between; align-items:center; padding:9px 2px; color:var(--text); text-decoration:none; font-size:14px; font-weight:600; }
.quick a::after { content:"›"; color:var(--muted); font-size:18px; }
.quick a:hover { color:var(--white); }
.stacked .recent li { flex-direction:column; gap:2px; }
.stacked .recent .when { font-size:12.5px; }
.facts { list-style:none; margin:0; padding:0; }
.facts li { display:flex; justify-content:space-between; gap:12px; padding:7px 0; border-top:1px solid var(--line); font-size:14px; }
.facts li:first-child { border-top:0; }
.facts li span:last-child { text-align:right; }
@media (max-width:900px) { .home-grid { grid-template-columns:1fr; } .kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:640px) {
  .recent li { flex-direction:column; gap:2px; }
  .recent .when { white-space:normal; font-size:12.5px; }
  .person .sub { overflow-wrap:anywhere; }
  .kpi b { font-size:22px; }
  .facts li { flex-direction:column; gap:2px; }
  .facts li span:last-child { text-align:left; }
}
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
  .card { padding:16px 14px; }
  textarea { white-space:pre-wrap; min-height:260px; }
  .chart, .activity-chart { min-width:640px; }
  .wide-only { display:none; }
  .grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .stat b { font-size:20px; }
}
@media (max-width:860px) { .two { grid-template-columns:1fr; } }
@media (max-width:980px) { .editor-grid { grid-template-columns:1fr; } .editor-grid .preview-card { position:static; max-height:none; } }
`;

const { CLIENT_JS } = require("./clientScript");
const JS_VERSION = require("crypto").createHash("sha256").update(CLIENT_JS).digest("hex").slice(0, 10);

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
<script src="/panel.js?v=${JS_VERSION}" defer></script>
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

const footer = () => `<footer class="foot"><span>Πληροφορική UoWM · Πίνακας διαχείρισης του bot</span><span>Ανεπίσημη υπηρεσία από φοιτητές</span></footer></div></div>`;

// Navigation, grouped. Every page opens the shell with header() and closes it with footer().
const NAV = [
    ["Επισκόπηση", [["/", "Αρχική"], ["/stats", "Στατιστικά"], ["/history", "Ιστορικό"]]],
    ["Μέλη", [["/members", "Μέλη"], ["/guests", "Προσωρινές άδειες"]]],
    ["Μηνύματα", [["/verify-text", "Μήνυμα επαλήθευσης"], ["/welcome", "Καλωσόρισμα"], ["/role-menus", "Κουμπιά ρόλων"], ["/replies", "Απαντήσεις"]]],
    ["Ρυθμίσεις", [["/settings", "Ρόλοι και κανάλια"], ["/periods", "Περίοδοι"], ["/faculty", "Καθηγητές"]]],
];

function navHtml(active) {
    return NAV.map(([group, links]) => `<div class="nav-group"><div class="nav-title">${group}</div>${links.map(([href, label]) => `<a href="${href}"${href === active ? ' class="on" aria-current="page"' : ""}>${label}</a>`).join("")}</div>`).join("");
}

function header(user, csrf, active) {
    const current = NAV.flatMap(([, links]) => links).find(([href]) => href === active)?.[1] ?? "Μενού";
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
<details class="mobile-nav"><summary>${escapeHtml(current)}</summary><nav>${navHtml(active)}</nav></details>
<div class="shell"><nav class="side" aria-label="Πλοήγηση">${navHtml(active)}</nav><div class="content">`;
}

const AFF_LABELS = { student: "Φοιτητής", faculty: "Καθηγητής", staff: "Προσωπικό" };

function avatarFor(p) {
    return p.avatar ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png?size=64` : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(p.id) >> 22n) % 6n)}.png`;
}

const personCell = (p) => `<div class="person"><img src="${escapeHtml(avatarFor(p))}" alt="" loading="lazy"><div><div>${escapeHtml(p.name)}</div><div class="sub">${p.username ? `@${escapeHtml(p.username)} · ` : ""}${escapeHtml(p.id)}</div></div></div>`;

const hiddenCsrf = (csrf) => `<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">`;

// view: { items, total, q, aff, page, pages, counts, done }
function membersPage({ user, csrf, view }) {
    const affOptions = [["", "Όλοι"], ["student", "Φοιτητές"], ["faculty", "Καθηγητές"], ["staff", "Προσωπικό"]]
        .map(([v, l]) => `<option value="${v}"${v === view.aff ? " selected" : ""}>${l}${v && view.counts[v] !== undefined ? ` (${view.counts[v]})` : ""}</option>`).join("");
    const link = (page) => `/members?${new URLSearchParams({ ...(view.q ? { q: view.q } : {}), ...(view.aff ? { aff: view.aff } : {}), page })}`;
    const rows = view.items.map((m) => `<tr>
<td>${personCell(m)}</td>
<td>${escapeHtml(AFF_LABELS[m.affiliation] ?? m.affiliation)}${m.inServer ? "" : ' <span class="tag off">εκτός server</span>'}</td>
<td class="date">${escapeHtml(m.verifiedAt)}</td>
<td class="num"><form method="post" action="/members/unverify" class="inline" data-confirm="Να αφαιρεθεί η επαλήθευση του ${escapeHtml(m.name)}; Θα χάσει τους ρόλους του και θα πρέπει να ξανακάνει /auth.">${hiddenCsrf(csrf)}<input type="hidden" name="id" value="${escapeHtml(m.id)}"><button class="danger" type="submit">Αφαίρεση</button></form></td>
</tr>`).join("");
    return layout("Μέλη", `<div class="wrap">
${header(user, csrf, "/members")}
${view.done ? `<div class="banner ok">${escapeHtml(view.done)}</div>` : ""}
<div class="card">
  <form class="toolbar" method="get" action="/members">
    <label>Αναζήτηση<input type="search" name="q" value="${escapeHtml(view.q)}" placeholder="Όνομα, username ή ID"></label>
    <label>Ιδιότητα<select name="aff">${affOptions}</select></label>
    <button class="primary" type="submit">Αναζήτηση</button>
  </form>
  <p class="count">${view.total} επαληθευμένα μέλη${view.q || view.aff ? " με αυτά τα κριτήρια" : ""}</p>
  ${rows ? `<table class="list"><tr><th>Μέλος</th><th>Ιδιότητα</th><th>Επαλήθευση</th><th></th></tr>${rows}</table>` : '<p class="muted">Κανένα μέλος.</p>'}
  ${view.pages > 1 ? `<div class="pager">${view.page > 1 ? `<a class="button ghost" href="${escapeHtml(link(view.page - 1))}">Προηγούμενη</a>` : ""}<span class="muted">Σελίδα ${view.page} από ${view.pages}</span>${view.page < view.pages ? `<a class="button ghost" href="${escapeHtml(link(view.page + 1))}">Επόμενη</a>` : ""}</div>` : ""}
</div>
<p class="muted">Η αφαίρεση σβήνει τα δεδομένα του μέλους και αφαιρεί τους ρόλους επαλήθευσης και εξαμήνων, όπως το /force-unverify. Καταγράφεται στο admin log.</p>
${footer()}
</div>`);
}

// guests: [{ id, name, username, avatar, inServer, reason, givenBy }]
function guestsPage({ user, csrf, guests, errors = [], done = null, form = {} }) {
    const rows = guests.map((g) => `<tr>
<td>${personCell(g)}${g.inServer ? "" : ' <span class="tag off">εκτός server</span>'}</td>
<td>${escapeHtml(g.reason || "")}</td>
<td>${escapeHtml(g.givenBy || "")}</td>
<td class="num"><form method="post" action="/guests/remove" class="inline" data-confirm="Να αφαιρεθεί η προσωρινή άδεια του ${escapeHtml(g.name)};">${hiddenCsrf(csrf)}<input type="hidden" name="id" value="${escapeHtml(g.id)}"><button class="danger" type="submit">Αφαίρεση</button></form></td>
</tr>`).join("");
    return layout("Προσωρινές άδειες", `<div class="wrap">
${header(user, csrf, "/guests")}
${banner({ errors })}${done ? `<div class="banner ok">${escapeHtml(done)}</div>` : ""}
<div class="card">
  <h2>Νέα προσωρινή άδεια</h2>
  <form class="toolbar" method="post" action="/guests/give">
    ${hiddenCsrf(csrf)}
    <label>Μέλος<input type="search" name="who" value="${escapeHtml(form.who || "")}" placeholder="Username, όνομα ή ID" required></label>
    <label>Αιτιολογία<input type="search" name="reason" value="${escapeHtml(form.reason || "")}" placeholder="π.χ. μεταγραφή, δεν έχει ακόμα email" maxlength="300" required></label>
    <button class="primary" type="submit">Δώσε άδεια</button>
  </form>
  <p class="count">Το μέλος παίρνει τον ρόλο Προσωρινή άδεια και ένα μήνυμα που του λέει να κάνει /auth μόλις αποκτήσει ιδρυματικό email.</p>
</div>
<div class="card">
  <h2>Ενεργές προσωρινές άδειες (${guests.length})</h2>
  ${rows ? `<table class="list"><tr><th>Μέλος</th><th>Αιτιολογία</th><th>Από</th><th></th></tr>${rows}</table>` : '<p class="muted">Καμία.</p>'}
</div>
${footer()}
</div>`);
}

// rules: [{ id, name, triggers, reply, deleteAfter, enabled, previewHtml }]
// edit: rule being edited (or a new one), test: { text, rule, previewHtml } or null.
function repliesPage({ user, csrf, rules, edit = null, errors = [], done = null, test = null }) {
    const after = (secs) => (secs > 0 ? `Σβήνεται μετά από ${secs} δευτ.` : "Δεν σβήνεται");
    const cards = rules.map((r) => `<div class="card"><div class="rule">
  <div>
    <h3>${escapeHtml(r.name)} ${r.enabled ? "" : '<span class="tag off">ανενεργή</span>'}</h3>
    <div class="meta">${escapeHtml(after(r.deleteAfter))} · απαντά μία φορά ανά 2 λεπτά σε κάθε μέλος</div>
    <div class="chips">${r.triggers.split(/\r?\n/).filter((t) => t.trim()).map((t) => `<code>${escapeHtml(t.trim())}</code>`).join("")}</div>
    <div class="rule-actions">
      <a class="button ghost" href="/replies?edit=${r.id}">Επεξεργασία</a>
      <form method="post" action="/replies/delete" class="inline" data-confirm="Να διαγραφεί η απάντηση «${escapeHtml(r.name)}»;">${hiddenCsrf(csrf)}<input type="hidden" name="id" value="${r.id}"><button class="danger" type="submit">Διαγραφή</button></form>
    </div>
  </div>
  <div class="preview">${r.previewHtml}</div>
</div></div>`).join("");

    const e = edit || { id: "", name: "", triggers: "", reply: "", deleteAfter: 20, enabled: true };
    const form = `<div class="card" id="form">
  <h2>${e.id ? `Επεξεργασία: ${escapeHtml(e.name)}` : "Νέα αυτόματη απάντηση"}</h2>
  <form method="post" action="/replies/save" data-unsaved>
    ${hiddenCsrf(csrf)}<input type="hidden" name="id" value="${escapeHtml(e.id)}">
    <div class="form-grid">
      <label class="block">Όνομα<input type="text" name="name" maxlength="100" value="${escapeHtml(e.name)}" placeholder="π.χ. Παλιά θέματα" required></label>
      <label class="block">Διαγραφή της απάντησης μετά από (δευτερόλεπτα, 0 = ποτέ)<input type="number" name="deleteAfter" min="0" max="3600" value="${escapeHtml(e.deleteAfter)}"></label>
      <label class="block">Πότε απαντά: μία φράση ανά γραμμή
        <textarea name="triggers" spellcheck="false" placeholder="παλια θεματ&#10;θεματα εξετασ">${escapeHtml(e.triggers)}</textarea>
        <span class="count">Ταιριάζει όταν όλες οι λέξεις μιας γραμμής υπάρχουν στο μήνυμα, με οποιαδήποτε σειρά. Γράψτε την αρχή κάθε λέξης: «θεματ» πιάνει θέμα, θέματα, θεμάτων. Κεφαλαία, τόνοι και greeklish δεν παίζουν ρόλο.</span>
      </label>
      <label class="block">Τι απαντά
        <textarea name="reply" spellcheck="true" lang="el" data-live-preview="/replies/preview" data-preview-target="#reply-preview">${escapeHtml(e.reply)}</textarea>
        <span class="count">Markdown του Discord. Το <code>{εξάμηνα}</code> γίνεται link στο κανάλι επιλογής εξαμήνων.</span>
        <span class="count">Προεπισκόπηση:</span>
        <div class="preview" id="reply-preview">${e.previewHtml || ""}</div>
      </label>
    </div>
    <label class="envbox"><input type="checkbox" name="enabled" value="1"${e.enabled ? " checked" : ""}> Ενεργή</label>
    <div class="actions">${e.id ? '<a class="button ghost" href="/replies">Ακύρωση</a>' : ""}<button class="primary" type="submit">Αποθήκευση</button></div>
  </form>
</div>`;

    const tester = `<div class="card">
  <h2>Δοκιμή</h2>
  <form class="toolbar" method="get" action="/replies">
    <label>Γράψτε ένα μήνυμα όπως θα το έγραφε ένα μέλος<input type="search" name="test" value="${escapeHtml(test?.text ?? "")}" placeholder="π.χ. πού είναι τα παλιά θέματα;"></label>
    <button class="ghost" type="submit">Δοκιμή</button>
  </form>
  ${test ? (test.rule
        ? `<div class="match yes">Ταιριάζει με την απάντηση <b>${escapeHtml(test.rule.name)}</b>. Το bot θα απαντούσε:</div><div class="preview">${test.previewHtml}</div>`
        : '<div class="match no">Δεν ταιριάζει με καμία ενεργή απάντηση.</div>') : ""}
</div>`;

    return layout("Αυτόματες απαντήσεις", `<div class="wrap">
${header(user, csrf, "/replies")}
${banner({ errors })}${done ? `<div class="banner ok">${escapeHtml(done)}</div>` : ""}
<p class="muted">Όταν κάποιος γράψει κάτι που ταιριάζει, το bot του απαντά και σβήνει την απάντηση μετά από λίγο, για να μη γεμίζουν τα κανάλια.</p>
${tester}
${cards || '<div class="card"><p class="muted">Καμία αυτόματη απάντηση ακόμα.</p></div>'}
${form}
${footer()}
</div>`);
}

// The menu as Discord would show it. menu.descriptionHtml: rendered markdown.
// ids: optional element ids, so the editor's script can update the preview while typing.
function discordMenuPreview(menu, roleName, ids = null) {
    const emojiHtml = (e) => {
        const m = String(e || "").match(/^<a?:[\w~]+:(\d{17,20})>$/);
        if (m) return `<img src="https://cdn.discordapp.com/emojis/${m[1]}.png?size=32" alt="">`;
        return e ? `<span>${escapeHtml(e)}</span>` : "";
    };
    const buttons = menu.buttons.map((b) => `<span class="dbtn ${escapeHtml(b.style || "primary")}">${emojiHtml(b.emoji)}${escapeHtml(b.label || roleName(b.roleId) || "Ρόλος")}</span>`).join("");
    return `<div class="dmsg"><div class="dembed"><svg class="bar" viewBox="0 0 4 10" preserveAspectRatio="none"><rect width="4" height="10" fill="${escapeHtml(menu.color || "#F4A11C")}"/></svg>
<div class="t"${ids ? ` id="${ids}-title"` : ""}${menu.title ? "" : " hidden"}>${escapeHtml(menu.title)}</div><div class="preview-inline"${ids ? ` id="${ids}-desc"` : ""}>${menu.descriptionHtml || ""}</div><div class="f"${menu.footer ? "" : " hidden"}>${menu.footerIconSrc ? `<img src="${escapeHtml(menu.footerIconSrc)}" alt="">` : ""}<span${ids ? ` id="${ids}-footer"` : ""}>${escapeHtml(menu.footer)}</span></div></div>
<div class="dbuttons">${buttons || '<span class="muted">Κανένα κουμπί.</span>'}</div></div>`;
}

// menus: [{ ...menu, descriptionHtml, channelName }]; options: { roles, channels, emojis }
function roleMenusPage({ user, csrf, menus, edit = null, options, errors = [], done = null }) {
    const roleName = (id) => options.roles.find((r) => r.id === id)?.name;
    const list = menus.map((m) => `<div class="card"><div class="rule">
  <div>
    <h3>${escapeHtml(m.name)}</h3>
    <div class="status">${m.messageId ? `Δημοσιευμένο στο <b>#${escapeHtml(m.channelName || m.channelId)}</b>` : "Πρόχειρο, δεν έχει δημοσιευτεί"} · ${m.buttons.length} κουμπιά</div>
    <div class="rule-actions"><a class="button ghost" href="/role-menus?edit=${m.id}#form">Επεξεργασία</a></div>
  </div>
  <div>${discordMenuPreview(m, roleName)}</div>
</div></div>`).join("");

    let form = "";
    if (edit) {
        const e = edit;
        const channelOpts = options.channels.map((c) => `<option value="${escapeHtml(c.id)}"${c.id === e.channelId ? " selected" : ""}>#${escapeHtml(c.name)}${c.category ? ` (${escapeHtml(c.category)})` : ""}</option>`).join("");
        const rows = [...e.buttons, ...Array.from({ length: 3 }, () => ({ roleId: "", label: "", emoji: "", style: "primary" }))].map((b, i) => {
            const roleOpts = options.roles.map((r) => `<option value="${escapeHtml(r.id)}"${r.id === b.roleId ? " selected" : ""}>@${escapeHtml(r.name)}</option>`).join("");
            const isServerEmoji = options.emojis.some((em) => em.code === b.emoji);
            const emojiOpts = options.emojis.map((em) => `<option value="${escapeHtml(em.code)}"${em.code === b.emoji ? " selected" : ""}>:${escapeHtml(em.name)}:</option>`).join("");
            const styleOpts = [["primary", "Μπλε"], ["secondary", "Γκρι"], ["success", "Πράσινο"], ["danger", "Κόκκινο"]].map(([v, l]) => `<option value="${v}"${v === (b.style || "primary") ? " selected" : ""}>${l}</option>`).join("");
            return `<tr>
<td class="pos"><input type="number" name="btn_pos" value="${i + 1}" min="1" max="99" aria-label="Σειρά"></td>
<td><select name="btn_role" aria-label="Ρόλος"><option value="">(κανένας, το κουμπί αγνοείται)</option>${roleOpts}</select></td>
<td><input type="text" name="btn_label" maxlength="80" value="${escapeHtml(b.label || "")}" placeholder="Όνομα ρόλου" aria-label="Κείμενο"></td>
<td><select name="btn_emoji" aria-label="Emoji του server"><option value="">(κανένα)</option>${emojiOpts}</select><input type="text" name="btn_emoji_text" maxlength="16" value="${escapeHtml(isServerEmoji ? "" : b.emoji || "")}" placeholder="ή emoji, π.χ. 🔹" aria-label="Unicode emoji"></td>
<td><select name="btn_style" aria-label="Χρώμα">${styleOpts}</select></td>
</tr>`;
        }).join("");
        form = `<div class="card" id="form">
  <h2>${e.id ? `Επεξεργασία: ${escapeHtml(e.name)}` : "Νέο μήνυμα με κουμπιά"}</h2>
  <form method="post" action="/role-menus/save" data-unsaved>
    ${hiddenCsrf(csrf)}<input type="hidden" name="id" value="${escapeHtml(e.id || "")}">
    <div class="form-grid">
      <label class="block">Όνομα (μόνο για τον πίνακα)<input type="text" name="name" maxlength="100" value="${escapeHtml(e.name)}" required></label>
      <label class="block">Κανάλι<select name="channelId"><option value="">(διάλεξε κανάλι)</option>${channelOpts}</select></label>
      <label class="block">Τίτλος<input type="text" name="title" maxlength="256" value="${escapeHtml(e.title)}" data-live-text="#edit-title"></label>
      <label class="block">Χρώμα<input type="color" name="color" value="${escapeHtml(e.color || "#F4A11C")}"></label>
      <label class="block">Κείμενο (markdown του Discord)<textarea name="description" maxlength="4000" data-live-preview="/role-menus/preview" data-preview-target="#edit-desc">${escapeHtml(e.description)}</textarea></label>
      <div class="block-group">
        <label class="block">Footer<input type="text" name="footer" maxlength="2048" value="${escapeHtml(e.footer)}" data-live-text="#edit-footer"></label>
        <label class="block">Εικόνα footer
          <select name="footerIconMode">
            <option value=""${!e.footerIcon ? " selected" : ""}>Καμία</option>
            <option value="server"${e.footerIcon === "server" ? " selected" : ""}>Το icon του server</option>
            <option value="url"${e.footerIcon && e.footerIcon !== "server" ? " selected" : ""}>Από διεύθυνση (URL)</option>
          </select>
          <input type="text" name="footerIconUrl" maxlength="500" value="${escapeHtml(e.footerIcon && e.footerIcon !== "server" ? e.footerIcon : "")}" placeholder="https://... (μόνο για «Από διεύθυνση»)">
        </label>
      </div>
    </div>
    <h2>Προεπισκόπηση</h2>
    <div class="count">Ο τίτλος, το κείμενο και το footer αλλάζουν καθώς γράφετε. Τα κουμπιά, το χρώμα και η εικόνα ενημερώνονται με την αποθήκευση.</div>
    ${discordMenuPreview(e, roleName, "edit")}
    <h2>Κουμπιά</h2>
    <div class="count">Έως 25. Κάθε κουμπί δίνει τον ρόλο του, ή τον αφαιρεί αν το μέλος τον έχει ήδη. Η σειρά ορίζεται από τον αριθμό αριστερά. Αν χρειάζεστε περισσότερες κενές γραμμές, αποθηκεύστε και θα εμφανιστούν νέες.</div>
    <div class="card-scroll"><table class="btn-rows"><tr><th>#</th><th>Ρόλος</th><th>Κείμενο</th><th>Emoji</th><th>Χρώμα</th></tr>${rows}</table></div>
    <div class="actions sticky">
      ${e.id ? '<a class="button ghost" href="/role-menus">Ακύρωση</a>' : ""}
      <button class="ghost" type="submit" name="action" value="save">Αποθήκευση</button>
      <button class="primary" type="submit" name="action" value="publish">${e.messageId ? "Αποθήκευση και ενημέρωση στο Discord" : "Αποθήκευση και δημοσίευση"}</button>
    </div>
  </form>
  ${e.id ? `<form method="post" action="/role-menus/delete" class="inline" data-confirm="Να διαγραφεί το «${escapeHtml(e.name)}»; Θα σβηστεί και το μήνυμα από το Discord. Οι ρόλοι των μελών δεν αλλάζουν.">${hiddenCsrf(csrf)}<input type="hidden" name="id" value="${escapeHtml(e.id)}"><button class="danger" type="submit">Διαγραφή</button></form>` : ""}
</div>`;
    }

    return layout("Κουμπιά ρόλων", `<div class="wrap">
${header(user, csrf, "/role-menus")}
${banner({ errors })}${done ? `<div class="banner ok">${escapeHtml(done)}</div>` : ""}
<p class="muted">Μηνύματα με κουμπιά που δίνουν ή αφαιρούν ρόλους, π.χ. τα εξάμηνα. Κάθε πάτημα κοιτάει αν το μέλος έχει ήδη τον ρόλο, οπότε δουλεύουν και οι ρόλοι που δόθηκαν παλιότερα από το Dyno. Τα εξάμηνα τα παίρνουν μόνο όσοι επιτρέπεται (Ρυθμίσεις > Εξάμηνα).</p>
${list || '<div class="card"><p class="muted">Κανένα μήνυμα ακόμα.</p></div>'}
${edit ? "" : '<p><a class="button primary" href="/role-menus?edit=new#form">Νέο μήνυμα με κουμπιά</a></p>'}
${form}
${footer()}
</div>`);
}

// defs: WELCOME_* settings (source, envValue). values: what the form shows.
function welcomePage({ user, csrf, defs, values, channels, previewHtml, errors = [], saved = false }) {
    const def = (key) => defs.find((d) => d.key === key);
    const resetBox = (key) => def(key)?.source === "panel" ? `<label class="envbox"><input type="checkbox" name="${key}__env" value="1"> Επαναφορά στην τιμή του .env</label>` : "";
    const channelOpts = channels.map((c) => `<option value="${escapeHtml(c.id)}"${c.id === values.WELCOME_CHANNEL_ID ? " selected" : ""}>#${escapeHtml(c.name)}${c.category ? ` (${escapeHtml(c.category)})` : ""}</option>`).join("");
    return layout("Καλωσόρισμα", `<div class="wrap">
${header(user, csrf, "/welcome")}
${banner({ errors, saved, savedText: "Αποθηκεύτηκε. Ισχύει από το επόμενο νέο μέλος." })}
<p class="muted">Όταν μπαίνει κάποιος στον server, το bot τον καλωσορίζει στο κανάλι που θα διαλέξετε. Το mention ειδοποιεί μόνο το νέο μέλος. Αν το κανάλι μείνει κενό, δεν στέλνεται καλωσόρισμα.</p>
<form method="post" action="/welcome" data-unsaved>
${hiddenCsrf(csrf)}
<div class="editor-grid">
  <div class="card">
    <h2>Ρυθμίσεις</h2>
    <div class="form-grid single">
      <label class="block">Κανάλι καλωσορίσματος<select name="WELCOME_CHANNEL_ID"><option value="">(κανένα, χωρίς καλωσόρισμα)</option>${channelOpts}</select>${resetBox("WELCOME_CHANNEL_ID")}</label>
      <label class="block">Μήνυμα
        <textarea name="WELCOME_MESSAGE" maxlength="500" class="short" data-live-preview="/welcome/preview" data-preview-target="#welcome-preview" placeholder="Κενό: Καλώς ήρθες {μέλος}, κάνε την επαλήθευση για να έχεις πρόσβαση: {επαλήθευση}.">${escapeHtml(values.WELCOME_MESSAGE || "")}</textarea>
        <span class="count">Κενό: το προεπιλεγμένο κείμενο. <code>{μέλος}</code> γίνεται mention του νέου μέλους και <code>{επαλήθευση}</code> link στο κανάλι επαλήθευσης (Ρόλοι και κανάλια).</span>
        ${resetBox("WELCOME_MESSAGE")}
      </label>
    </div>
  </div>
  <div class="card">
    <h2>Προεπισκόπηση</h2>
    <div class="preview" id="welcome-preview">${previewHtml}</div>
  </div>
</div>
<div class="actions sticky"><a class="button ghost" href="/welcome">Ακύρωση</a><button class="primary" type="submit">Αποθήκευση</button></div>
</form>
${footer()}
</div>`);
}

// [{ area, summary, who, when }] as a list.
const recentList = (items) => `<ul class="recent">${items.map((r) => `<li><span><span class="area">${escapeHtml(r.area)}</span> ${escapeHtml(r.summary)} <span class="muted">· ${escapeHtml(r.who)}</span></span><span class="when">${escapeHtml(r.when)}</span></li>`).join("")}</ul>`;

function historyPage({ user, csrf, entries }) {
    return layout("Ιστορικό", `<div class="wrap">
${header(user, csrf, "/history")}
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
// Small bar chart as inline SVG (no script, no style attributes). points: [{ label, value }].
function sparkBars(points, color, unit) {
    const max = Math.max(1, ...points.map((p) => p.value));
    const w = 300 / points.length;
    const bars = points.map((p, i) => {
        const h = p.value ? Math.max(2, (p.value / max) * 56) : 1;
        return `<rect x="${(i * w + w * 0.15).toFixed(1)}" y="${(60 - h).toFixed(1)}" width="${(w * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${p.value ? color : "#3f4147"}"><title>${escapeHtml(p.label)}: ${p.value} ${unit}</title></rect>`;
    }).join("");
    return `<svg class="spark" viewBox="0 0 300 60" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(unit)} ανά ημέρα">${bars}</svg>`;
}

// user, csrf; info: overview numbers; activity: last 30 days; recent: panel changes; health: checks.
function dashboardPage({ user, csrf, info, activity = null, recent = [], health = [], greeting = "Γεια σου" }) {
    const n = (v) => Number(v).toLocaleString("el-GR");
    const problems = health.filter((c) => c.status !== "ok");
    const share = info.guildMembers ? Math.min(100, Math.round((info.verified / info.guildMembers) * 100)) : 0;
    const kpi = (value, label, sub, href) => `<a class="kpi" href="${href}"><b>${escapeHtml(value)}</b><span class="label">${escapeHtml(label)}</span><span class="sub">${escapeHtml(sub)}</span></a>`;
    const a = activity || { series: [], messagesToday: 0, messages7d: 0, verified7d: 0, latest: [] };
    const latest = a.latest.length
        ? `<ul class="recent">${a.latest.map((m) => `<li>${personCell(m)}<span class="when">${escapeHtml(AFF_LABELS[m.affiliation] ?? m.affiliation)} · ${escapeHtml(m.when)}</span></li>`).join("")}</ul><a class="more" href="/members">Όλα τα μέλη</a>`
        : '<p class="muted">Καμία επαλήθευση ακόμα.</p>';
    const healthList = `<ul class="health">${(problems.length ? problems : health).map((c) => `<li><span class="dot ${escapeHtml(c.status)}"></span><span>${escapeHtml(c.text)}</span>${c.href ? `<a href="${escapeHtml(c.href)}">Διόρθωση</a>` : ""}</li>`).join("")}</ul>`;

    return layout("Πίνακας", `<div class="wrap">
${header(user, csrf, "/")}
<div class="greet">
  <h1>${escapeHtml(greeting)}, ${escapeHtml(user.globalName || user.username)}</h1>
  <p class="muted">${problems.length ? `${problems.length === 1 ? "Ένα θέμα θέλει" : `${problems.length} θέματα θέλουν`} την προσοχή σας.` : "Όλα λειτουργούν κανονικά."}</p>
</div>
<div class="kpis">
  ${kpi(n(info.verified), "Επαληθευμένα μέλη", `+${n(a.verified7d)} τις τελευταίες 7 ημέρες`, "/members")}
  ${kpi(n(a.messagesToday), "Μηνύματα σήμερα", `${n(a.messages7d)} τις τελευταίες 7 ημέρες`, "/stats")}
  ${kpi(n(info.guildMembers), "Μέλη στον server", `${share}% επαληθευμένα`, "/members")}
  ${kpi(n(info.guests), "Προσωρινές άδειες", info.guests ? "ενεργές τώρα" : "καμία ενεργή", "/guests")}
</div>
<div class="home-grid">
  <div>
    <div class="card">
      <h2>Τελευταίες 30 ημέρες</h2>
      <div class="spark-head"><span>Μηνύματα</span><span class="muted">${n(a.series.reduce((s2, d) => s2 + d.messages, 0))}</span></div>
      ${sparkBars(a.series.map((d) => ({ label: d.label, value: d.messages })), "#4fb8ba", "μηνύματα")}
      <div class="spark-head"><span>Επαληθεύσεις</span><span class="muted">${n(a.series.reduce((s2, d) => s2 + d.verified, 0))}</span></div>
      ${sparkBars(a.series.map((d) => ({ label: d.label, value: d.verified })), "#f4a11c", "επαληθεύσεις")}
      <div class="spark-axis"><span>${escapeHtml(a.series[0]?.label ?? "")}</span><span>σήμερα</span></div>
    </div>
    <div class="card">
      <h2>Πρόσφατες επαληθεύσεις</h2>
      ${latest}
    </div>
  </div>
  <div>
    <div class="card">
      <h2>Κατάσταση</h2>
      ${healthList}
    </div>
    <div class="card">
      <h2>Γρήγορες ενέργειες</h2>
      <form class="quick-search" method="get" action="/members"><input type="search" name="q" placeholder="Αναζήτηση μέλους..." aria-label="Αναζήτηση μέλους"><button class="ghost" type="submit">Αναζήτηση</button></form>
      <ul class="quick">
        <li><a href="/guests">Νέα προσωρινή άδεια</a></li>
        <li><a href="/verify-text">Επεξεργασία μηνύματος επαλήθευσης</a></li>
        <li><a href="/stats">Στατιστικά μηνυμάτων</a></li>
        <li><a href="/settings">Ρυθμίσεις ρόλων και καναλιών</a></li>
      </ul>
    </div>
    <div class="card">
      <h2>Bot</h2>
      <ul class="facts">
        <li><span class="muted">Ping</span><span>${escapeHtml(info.ping)} ms</span></li>
        <li><span class="muted">Σε λειτουργία από</span><span>${escapeHtml(info.onlineSince)}</span></li>
        <li><span class="muted">Ανά ιδιότητα</span><span>${n(info.students)} φοιτητές · ${n(info.faculty)} καθηγητές · ${n(info.staff)} προσωπικό</span></li>
      </ul>
    </div>
    <div class="card">
      <h2>Πρόσφατες αλλαγές</h2>
      ${recent.length
        ? `<div class="stacked">${recentList(recent)}</div><a class="more" href="/history">Όλο το ιστορικό</a>`
        : '<p class="muted">Καμία αλλαγή ακόμα.</p>'}
    </div>
  </div>
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
<form method="post" action="/settings" data-unsaved>
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
    return layout("Μήνυμα επαλήθευσης", `<div class="wrap wide">
${header(user, csrf, "/verify-text")}
${banner({ errors, saved, savedText: "Αποθηκεύτηκε. Το μήνυμα στο #επαλήθευση θα ξανασταλεί με ping, αν άλλαξε." })}
<form method="post" action="/verify-text" data-unsaved>
<input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
<div class="editor-grid">
  <div class="card">
    <h2>Κείμενο</h2>
    <div class="muted">Markdown του Discord: <code># τίτλος</code>, <code>**έντονα**</code>, <code>__υπογράμμιση__</code>, <code>1. λίστα</code>, <code>-# μικρά</code>. Για ρόλους γράψτε:</div>
    <div class="chips">${chips}</div>
    <textarea class="wrap-text" name="template" spellcheck="true" lang="el" data-live-preview="/verify-text/preview" data-preview-target="#verify-preview">${escapeHtml(template)}</textarea>
    <div class="count${length > maxLength ? " over" : ""}" data-count>${length} / ${maxLength} χαρακτήρες${previewed ? " · προεπισκόπηση, δεν έχει αποθηκευτεί" : ""}</div>
  </div>
  <div class="card preview-card">
    <h2>Προεπισκόπηση</h2>
    <div class="preview" id="verify-preview">${previewHtml}</div>
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
<form method="post" action="/periods" data-unsaved>
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

// entries: [{ local, email, name, section, verified }] from the file.
function facultyPage({ user, csrf, text, count, domain, entries = [], errors = [], done = null, add = {} }) {
    const verifiedCount = entries.filter((e) => e.verified).length;
    const rows = entries.map((e) => `<tr data-row>
<td>${escapeHtml(e.name || "")}</td>
<td><code>${escapeHtml(e.email)}</code></td>
<td>${e.verified ? '<span class="tag on">επαληθευμένος</span>' : '<span class="muted">όχι ακόμα</span>'}</td>
<td class="num"><form method="post" action="/faculty/remove" class="inline" data-confirm="Να αφαιρεθεί το ${escapeHtml(e.email)}${e.name ? ` (${escapeHtml(e.name)})` : ""} από τη λίστα;">${hiddenCsrf(csrf)}<input type="hidden" name="email" value="${escapeHtml(e.email)}"><button class="danger" type="submit">Αφαίρεση</button></form></td>
</tr>`).join("");
    return layout("Καθηγητές", `<div class="wrap">
${header(user, csrf, "/faculty")}
${banner({ errors })}${done ? `<div class="banner ok">${escapeHtml(done)}</div>` : ""}
<p class="muted">Όποιος επαληθεύεται από μία από αυτές τις διευθύνσεις παίρνει τον ρόλο Καθηγητής. Οι αλλαγές ισχύουν από την επόμενη επαλήθευση. Όσοι έχουν ήδη επαληθευτεί κρατούν τον ρόλο τους.</p>
<div class="card">
  <h2>Προσθήκη</h2>
  <form class="toolbar" method="post" action="/faculty/add">
    ${hiddenCsrf(csrf)}
    <label>Email<input type="search" name="email" value="${escapeHtml(add.email || "")}" placeholder="π.χ. mvavva@${escapeHtml(domain)}" required></label>
    <label>Όνομα<input type="search" name="name" value="${escapeHtml(add.name || "")}" placeholder="π.χ. Βάββα Μαρία" maxlength="100"></label>
    <button class="primary" type="submit">Προσθήκη</button>
  </form>
</div>
<div class="card">
  <h2>Λίστα (${entries.length})</h2>
  <p class="count">${verifiedCount} από ${entries.length} έχουν ήδη επαληθευτεί στον server.</p>
  <input type="search" class="filter" data-filter="#faculty-table" placeholder="Αναζήτηση ονόματος ή email..." aria-label="Αναζήτηση">
  <div class="card-scroll"><table class="list" id="faculty-table"><tr><th>Όνομα</th><th>Email</th><th>Κατάσταση</th><th></th></tr>${rows}</table></div>
</div>
<details class="card"${errors.length && text ? " open" : ""}>
  <summary><b>Επεξεργασία ως κείμενο</b> <span class="muted">για πολλές αλλαγές μαζί</span></summary>
  <form method="post" action="/faculty" data-unsaved>
    ${hiddenCsrf(csrf)}
    <p class="muted">Μία διεύθυνση @${escapeHtml(domain)} ανά γραμμή, με το όνομα σε σχόλιο: <code>mvavva@${escapeHtml(domain)} # Βάββα Μαρία</code>. Οι γραμμές που αρχίζουν με # αγνοούνται.</p>
    <textarea name="text" spellcheck="false">${escapeHtml(text)}</textarea>
    <div class="count">${count} διευθύνσεις</div>
    <div class="actions"><button class="primary" type="submit">Αποθήκευση</button></div>
  </form>
</details>
<p class="muted">Αποθηκεύεται στο <code>data/faculty-emails.txt</code> στον server.</p>
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
<div class="card"><h2>Ανά ημέρα</h2><div class="chart-wrap">${view.chartSvg}</div><p class="count">Περάστε τον κέρσορα πάνω από το γράφημα για να δείτε κάθε ημέρα. <a href="${escapeHtml(view.chartUrl)}" download>Λήψη ως εικόνα</a></p></div>
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

module.exports = { CSS, FAVICON_SVG, CLIENT_JS, repliesPage, roleMenusPage, welcomePage, escapeHtml, statsPage, historyPage, membersPage, guestsPage, loginPage, forbiddenPage, errorPage, notFoundPage, dashboardPage, settingsPage, verifyTextPage, periodsPage, facultyPage, messagePage };
