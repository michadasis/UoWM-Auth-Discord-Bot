// Role buttons ("Κουμπιά ρόλων"): messages with buttons that give or take a role, made in the
// admin panel and posted by the bot. A click toggles the role based on what the member has right
// now on Discord, so roles given earlier by Dyno or by hand work the same way.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require("discord.js");
const { ensureSchema, getMeta, setMeta } = require("./messageStats");
const { semesterConfig } = require("./semesterRoles");

const PREFIX = "rolemenu";
const STYLES = { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger };
const MAX_BUTTONS = 25; // 5 rows of 5

let menus = [];

async function ensureRoleMenus(pool) {
    await pool.query(`CREATE TABLE IF NOT EXISTS role_menus (
        id INT NOT NULL AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        channel_id VARCHAR(20) NULL,
        message_id VARCHAR(20) NULL,
        title VARCHAR(256) NOT NULL DEFAULT '',
        description TEXT NOT NULL,
        color VARCHAR(7) NOT NULL DEFAULT '#F4A11C',
        footer VARCHAR(2048) NOT NULL DEFAULT '',
        buttons TEXT NOT NULL,
        updated_by VARCHAR(20) NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
    )`);
    // Added later: "server" (the server icon), an https URL, or empty.
    // Checked through information_schema, which works on both MariaDB and MySQL.
    const cols = await pool.query("SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role_menus' AND COLUMN_NAME = 'footer_icon'");
    if (cols?.[0] && Number(cols[0].n) === 0) {
        await pool.query("ALTER TABLE role_menus ADD COLUMN footer_icon VARCHAR(512) NOT NULL DEFAULT ''");
    }
}

function toMenu(r) {
    let buttons = [];
    try {
        buttons = JSON.parse(r.buttons || "[]");
    } catch {
        buttons = [];
    }
    return {
        id: Number(r.id), name: r.name, channelId: r.channel_id || null, messageId: r.message_id || null,
        title: r.title || "", description: r.description || "", color: r.color || "#F4A11C", footer: r.footer || "", footerIcon: r.footer_icon || "",
        buttons: Array.isArray(buttons) ? buttons : [],
    };
}

async function loadRoleMenus(pool) {
    await ensureRoleMenus(pool);
    menus = (await pool.query("SELECT * FROM role_menus ORDER BY id")).map(toMenu);
    return menus;
}

const getMenus = () => menus;
const getMenu = (id) => menus.find((m) => m.id === Number(id)) || null;

async function saveMenu(pool, menu, userId) {
    const values = [menu.name, menu.channelId, menu.messageId, menu.title, menu.description, menu.color, menu.footer, menu.footerIcon || "", JSON.stringify(menu.buttons), userId];
    if (menu.id) {
        await pool.query("UPDATE role_menus SET name = ?, channel_id = ?, message_id = ?, title = ?, description = ?, color = ?, footer = ?, footer_icon = ?, buttons = ?, updated_by = ? WHERE id = ?", [...values, menu.id]);
    } else {
        const result = await pool.query("INSERT INTO role_menus (name, channel_id, message_id, title, description, color, footer, footer_icon, buttons, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", values);
        menu.id = Number(result.insertId);
    }
    await loadRoleMenus(pool);
    return getMenu(menu.id);
}

async function deleteMenu(pool, id) {
    await pool.query("DELETE FROM role_menus WHERE id = ?", [id]);
    menus = menus.filter((m) => m.id !== Number(id));
}

// "<:sem_a:123>" or "<a:x:123>" -> { id, name, animated }; anything else is a Unicode emoji.
function parseEmoji(text) {
    const value = String(text || "").trim();
    if (!value) return null;
    const custom = value.match(/^<(a?):([\w~]{1,32}):(\d{17,20})>$/);
    if (custom) return { id: custom[3], name: custom[2], animated: custom[1] === "a" };
    return { unicode: value };
}

// The footer image as a URL: the server icon for "server", the URL itself, or null.
function footerIconUrl(menu, serverIconUrl = null) {
    if (menu.footerIcon === "server") return serverIconUrl;
    return /^https:\/\//.test(menu.footerIcon || "") ? menu.footerIcon : null;
}

// The Discord message for a menu. serverIconUrl: for a footer image set to the server icon.
function buildMessage(menu, { serverIconUrl = null } = {}) {
    const embed = new EmbedBuilder().setColor(menu.color || "#F4A11C");
    if (menu.title) embed.setTitle(menu.title);
    if (menu.description) embed.setDescription(menu.description);
    const icon = footerIconUrl(menu, serverIconUrl);
    if (menu.footer) embed.setFooter(icon ? { text: menu.footer, iconURL: icon } : { text: menu.footer });
    const rows = [];
    menu.buttons.slice(0, MAX_BUTTONS).forEach((b, i) => {
        if (i % 5 === 0) rows.push(new ActionRowBuilder());
        const button = new ButtonBuilder()
            .setCustomId(`${PREFIX}:${menu.id}:${b.roleId}`)
            .setLabel(b.label || "Ρόλος")
            .setStyle(STYLES[b.style] ?? ButtonStyle.Primary);
        const emoji = parseEmoji(b.emoji);
        if (emoji?.id) button.setEmoji({ id: emoji.id, name: emoji.name, animated: emoji.animated });
        else if (emoji?.unicode) button.setEmoji(emoji.unicode);
        rows[rows.length - 1].addComponents(button);
    });
    return { embeds: [embed], components: rows, allowedMentions: { parse: [] } };
}

// Posts the menu, or edits its message in place if it is still in the same channel.
async function publishMenu(client, pool, menu, channelId, userId) {
    const channel = await client.channels.fetch(channelId);
    const payload = buildMessage(menu, { serverIconUrl: channel.guild?.iconURL?.({ size: 64, extension: "png" }) ?? null });
    if (menu.messageId && menu.channelId === channelId) {
        try {
            const message = await channel.messages.fetch(menu.messageId);
            await message.edit(payload);
            return saveMenu(pool, { ...menu, channelId }, userId);
        } catch {
            // Deleted by hand: post a new one below.
        }
    } else if (menu.messageId && menu.channelId) {
        try {
            const old = await client.channels.fetch(menu.channelId);
            await (await old.messages.fetch(menu.messageId)).delete();
        } catch {
            // Already gone.
        }
    }
    const message = await channel.send(payload);
    return saveMenu(pool, { ...menu, channelId, messageId: message.id }, userId);
}

async function unpublishMenu(client, menu) {
    if (!menu.messageId || !menu.channelId) return;
    try {
        const channel = await client.channels.fetch(menu.channelId);
        await (await channel.messages.fetch(menu.messageId)).delete();
    } catch {
        // Already gone.
    }
}

const SEMESTER_EMOJI = { "Α": "sem_a", "Β": "sem_b", "Γ": "sem_g", "Δ": "sem_d", "Ε": "sem_e", "ΣΤ": "sem_st", "Ζ": "sem_z", "Η": "sem_h" };
const SEMESTER_ORDER = ["Α", "Β", "Γ", "Δ", "Ε", "ΣΤ", "Ζ", "Η"];
const semesterLetter = (name) => SEMESTER_ORDER.find((l) => new RegExp(`^${l}\\s`, "u").test(name)) ?? null;

// Once, on a fresh install: a draft of the semester menu like the Dyno one, with the semester
// roles in order and the sem_* emojis if the server has them. It still has to be published.
async function seedSemesterMenu(pool, guild) {
    await ensureSchema(pool);
    if (await getMeta(pool, "role_menus_seeded")) return;
    await setMeta(pool, "role_menus_seeded", "1");
    if (menus.length) return;
    const { semesterRoleIds } = semesterConfig();
    const roles = semesterRoleIds.map((id) => guild.roles.cache.get(id)).filter(Boolean)
        .sort((a, b) => SEMESTER_ORDER.indexOf(semesterLetter(a.name)) - SEMESTER_ORDER.indexOf(semesterLetter(b.name)));
    if (!roles.length) return;
    const emojis = guild.emojis?.cache ? [...guild.emojis.cache.values()] : [];
    const buttons = roles.map((role) => {
        const emoji = emojis.find((e) => e.name === SEMESTER_EMOJI[semesterLetter(role.name)]);
        return { roleId: role.id, label: role.name, emoji: emoji ? `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>` : "", style: "primary" };
    });
    await saveMenu(pool, {
        name: "Επιλογή εξαμήνου",
        channelId: process.env.SEMESTER_CHANNEL_ID || null,
        messageId: null,
        title: "📚 Επιλογή εξαμήνου",
        description: [
            "Διάλεξε το εξάμηνο (ή τα εξάμηνα) που σε ενδιαφέρουν για να δεις τα αντίστοιχα κανάλια με σημειώσεις, help και voice.",
            "",
            "**Μπορείς να επιλέξεις πολλά μαζί**, π.χ. αν έχεις χρωστούμενα από προηγούμενα εξάμηνα.",
            "",
            "Πάτα ξανά ένα κουμπί για να αφαιρέσεις τον ρόλο.",
            "",
            "Αν κάτι δεν δουλεύει ή δεν σου δίνει ρόλο, γράψε στο <#1504990025664696415>.",
        ].join("\n"),
        color: "#F4A11C",
        footer: "Πληροφορική UoWM · Επιλογή εξαμήνου",
        footerIcon: "server",
        buttons,
    }, null);
}

// A role the bot may hand out from a button: exists, not @everyone or managed, below the bot.
function assignable(guild, roleId) {
    const role = guild.roles.cache.get(roleId);
    if (!role || role.id === guild.id || role.managed) return null;
    const top = guild.members.me?.roles.highest.position ?? Infinity;
    return role.position < top ? role : null;
}

// A click on a role button. The role must be one of that menu's buttons, so a forged button
// cannot hand out any other role.
// verifyChannelId: where /post-verify-info is, for the "verify first" hint (optional).
async function handleClick(interaction, { verifyChannelId = null } = {}) {
    const [, menuId, roleId] = interaction.customId.split(":");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const menu = getMenu(menuId);
    if (!menu || !menu.buttons.some((b) => b.roleId === roleId)) {
        return interaction.editReply({ content: "Αυτό το κουμπί δεν ισχύει πια." });
    }
    const role = assignable(interaction.guild, roleId);
    if (!role || !interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.editReply({ content: "Δεν μπορώ να δώσω αυτόν τον ρόλο. Ενημερώστε κάποιον Admin." });
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const { semesterRoleIds, allowedRoleIds } = semesterConfig();
    if (semesterRoleIds.includes(roleId) && !allowedRoleIds.some((id) => member.roles.cache.has(id))) {
        const verify = verifyChannelId ? ` στο <#${verifyChannelId}>` : "";
        return interaction.editReply({ content: `Για να διαλέξεις εξάμηνο, επαληθεύσου πρώτα με την εντολή \`/auth\`${verify}.` });
    }
    if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId, "Role button");
        return interaction.editReply({ content: `Αφαιρέθηκε ο ρόλος **${role.name}**.` });
    }
    await member.roles.add(roleId, "Role button");
    return interaction.editReply({ content: `Πήρες τον ρόλο **${role.name}**.` });
}

module.exports = {
    PREFIX, MAX_BUTTONS, STYLES, loadRoleMenus, getMenus, getMenu, saveMenu, deleteMenu, buildMessage,
    publishMenu, unpublishMenu, parseEmoji, footerIconUrl, seedSemesterMenu, assignable, handleClick, toMenu,
};
