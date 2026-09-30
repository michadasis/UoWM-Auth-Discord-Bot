const { startSyncing } = require("../../lib/verifyInfoMessage");

// Keeps the /post-verify-info message in sync with privacyNotice.js.
module.exports = async (c, client) => {
    await startSyncing(client).catch((err) => console.error("Starting verify info sync failed:", err));
};
