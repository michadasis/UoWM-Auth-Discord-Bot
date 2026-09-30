const { startRefreshing } = require("../../lib/verifiedStatsMessage");

// Keeps the /post-verified-stats message up to date.
module.exports = async (c, client) => {
    await startRefreshing(client).catch((err) => console.error("Starting live stats updates failed:", err));
};
