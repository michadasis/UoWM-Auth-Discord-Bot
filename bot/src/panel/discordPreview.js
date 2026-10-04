// Approximate Discord rendering of a message, for the preview in the panel. Covers what the verify
// info uses: headings, subtext, lists, bold, italics, underline, inline code, and role, channel and
// @everyone mentions (shown with their current names).

const { escapeHtml } = require("./pages");

function inline(text, { roles, channels, users }) {
    const tokens = [];
    const keep = (html) => `\u0000${tokens.push(html) - 1}\u0000`;
    let s = text
        .replace(/<@&([\w-]+)>/g, (_, id) => keep(`<span class="mention">@${escapeHtml(roles.get(id) ?? "άγνωστος ρόλος")}</span>`))
        .replace(/<@!?([\w-]+)>/g, (_, id) => keep(`<span class="mention">@${escapeHtml(users?.get(id) ?? "χρήστης")}</span>`))
        .replace(/<#([\w-]+)>/g, (_, id) => keep(`<span class="mention">#${escapeHtml(channels.get(id) ?? "άγνωστο κανάλι")}</span>`))
        .replace(/@(everyone|here)\b/g, (_, who) => keep(`<span class="mention">@${who}</span>`))
        .replace(/`([^`\n]+)`/g, (_, code) => keep(`<code>${escapeHtml(code)}</code>`));
    s = escapeHtml(s)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/__(.+?)__/g, "<u>$1</u>")
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[Number(i)]);
}

// names: { roles: Map(id -> name), channels: Map(id -> name) }
function renderDiscord(text, names) {
    const out = [];
    let list = null; // "ol" | "ul"
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const line of text.split("\n")) {
        let m;
        if ((m = line.match(/^(#{1,3}) (.+)$/))) {
            close();
            out.push(`<div class="h${m[1].length}">${inline(m[2], names)}</div>`);
        } else if ((m = line.match(/^-# (.+)$/))) {
            close();
            out.push(`<div class="subtext">${inline(m[1], names)}</div>`);
        } else if ((m = line.match(/^\d+\. (.+)$/))) {
            if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; }
            out.push(`<li>${inline(m[1], names)}</li>`);
        } else if ((m = line.match(/^[-*] (.+)$/))) {
            if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; }
            out.push(`<li>${inline(m[1], names)}</li>`);
        } else if (!line.trim()) {
            close();
            out.push('<div class="blank"></div>');
        } else {
            close();
            out.push(`<div>${inline(line, names)}</div>`);
        }
    }
    close();
    return out.join("");
}

module.exports = { renderDiscord };
