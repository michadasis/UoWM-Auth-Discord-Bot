const pool = require("../../lib/database");
const { startPanel } = require("../../panel/server");

// Starts the admin panel (only when PANEL_PORT is set).
module.exports = async (c, client) => {
    try {
        startPanel(client, pool);
    } catch (err) {
        console.error(err.message);
    }
};
