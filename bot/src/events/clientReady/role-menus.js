const pool = require("../../lib/database");
const { loadRoleMenus } = require("../../lib/roleMenus");

module.exports = async () => {
    await loadRoleMenus(pool).catch((err) => console.error("Loading role menus failed:", err));
};
