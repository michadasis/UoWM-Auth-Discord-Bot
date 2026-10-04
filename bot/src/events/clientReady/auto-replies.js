const pool = require("../../lib/database");
const { loadAutoReplies } = require("../../lib/autoReplies");

module.exports = async () => {
    await loadAutoReplies(pool).catch((err) => console.error("Loading automatic replies failed:", err));
};
