const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { healthChecks, certificateCheck } = require("../src/panel/health");

const role = (id, position) => ({ id, name: id, position });
function guild({ manageRoles = true, botTop = 10 } = {}) {
    const roles = new Map([["student", role("student", 3)], ["high", role("high", 20)], ["sem", role("sem", 2)]]);
    return {
        roles: { cache: roles },
        members: { me: { permissions: { has: () => manageRoles }, roles: { highest: { position: botTop } } } },
    };
}
const pool = (posted) => ({ query: async () => (posted ? [{ meta_value: "c:m" }] : []) });
const env = { STUDENT_ROLE_ID: "student", SEMESTER_ROLE_IDS: "sem", ADMIN_CHANNEL_ID: "c", SEMESTER_CHANNEL_ID: "s" };

test("all good", async () => {
    const checks = await healthChecks({ guild: guild(), pool: pool(true), env });
    assert.deepEqual(checks.map((c) => c.status), ["ok"]);
});

test("problems are reported with a status and, where it helps, a link", async () => {
    const checks = await healthChecks({ guild: guild({ manageRoles: false, botTop: 1 }), pool: pool(false), env: { STUDENT_ROLE_ID: "student", PROFESSOR_ROLE_ID: "gone", SEMESTER_ROLE_IDS: "sem" } });
    const text = checks.map((c) => `${c.status} ${c.text}`).join("\n");
    assert.match(text, /err .*Manage Roles/);
    assert.match(text, /err .*κάτω από: Φοιτητής/);
    assert.match(text, /err .*δεν υπάρχει πια.*Καθηγητής/);
    assert.match(text, /warn .*κανάλι καταγραφής/);
    assert.match(text, /warn .*κανάλι επιλογής εξαμήνων/);
    assert.match(text, /warn .*\/post-verify-info/);
    assert.ok(checks.find((c) => /καταγραφής/.test(c.text)).href === "/settings");
});

test("certificate expiry", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cert-"));
    const cert = path.join(dir, "c.pem");
    execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-keyout", path.join(dir, "k.pem"), "-out", cert, "-days", "30", "-subj", "/CN=t"], { stdio: "ignore" });
    assert.equal(certificateCheck(cert).status, "ok");
    assert.equal(certificateCheck(cert, Date.now() + 15 * 86400000).status, "warn");
    assert.equal(certificateCheck(cert, Date.now() + 26 * 86400000).status, "err");
    assert.match(certificateCheck(cert, Date.now() + 40 * 86400000).text, /έχει λήξει/);
    assert.equal(certificateCheck(path.join(dir, "missing.pem")).status, "warn");
    fs.rmSync(dir, { recursive: true, force: true });
});
