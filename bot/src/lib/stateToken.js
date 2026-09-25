const crypto = require("crypto");

// Must match web/src/lib/server/crypto.js hashStateToken().
function hashStateToken(token) {
    return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function newStateToken() {
    return crypto.randomBytes(32).toString("base64url");
}

module.exports = { hashStateToken, newStateToken };
