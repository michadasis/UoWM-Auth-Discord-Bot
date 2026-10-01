const { restore } = require("../../lib/semesterPing");

module.exports = async (c, client) => {
    await restore(client).catch((err) => console.error("Restoring semester pings failed:", err));
};
