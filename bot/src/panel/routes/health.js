// Public health check for an uptime monitor: GET /health answers 200 when Discord and the
// database both work, 503 otherwise. No login, and nothing private in the answer.

const { SECURITY_HEADERS } = require("../http");

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

module.exports = function healthRoutes(ctx) {
    const { client, pool } = ctx;
    return {
        "GET /health": async (req, res) => {
            const discord = client.isReady?.() ?? Boolean(client.readyTimestamp);
            const database = await withTimeout(pool.query("SELECT 1"), 3000).then(() => true, () => false);
            const ok = discord && database;
            res.writeHead(ok ? 200 : 503, { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ status: ok ? "ok" : "down", discord: discord ? "ok" : "down", database: database ? "ok" : "down" }));
        },
    };
};
