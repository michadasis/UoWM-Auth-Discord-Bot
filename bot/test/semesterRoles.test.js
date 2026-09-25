const { test } = require("node:test");
const assert = require("node:assert/strict");
const { semesterConfig, semesterRolesToStrip, parseIds } = require("../src/lib/semesterRoles");
const { hashStateToken } = require("../src/lib/stateToken");

const env = { STUDENT_ROLE_ID: "student", SEMESTER_ROLE_IDS: "sem-a, sem-b,sem-h" };

test("parseIds trims and drops empties", () => {
    assert.deepEqual(parseIds(" a, b,,c "), ["a", "b", "c"]);
});

test("verified student keeps semester roles", () => {
    assert.deepEqual(semesterRolesToStrip(["student", "sem-a"], semesterConfig(env)), []);
});

test("unverified member or professor loses semester roles", () => {
    const config = semesterConfig(env);
    assert.deepEqual(semesterRolesToStrip(["sem-a", "sem-h", "other"], config), ["sem-a", "sem-h"]);
    assert.deepEqual(semesterRolesToStrip(["professor", "sem-b"], config), ["sem-b"]);
});

test("SEMESTER_ALLOWED_ROLE_IDS can allow guests too", () => {
    const config = semesterConfig({ ...env, SEMESTER_ALLOWED_ROLE_IDS: "student,guest" });
    assert.deepEqual(semesterRolesToStrip(["guest", "sem-a"], config), []);
});

test("no semester roles configured means nothing is stripped", () => {
    assert.deepEqual(semesterRolesToStrip(["sem-a"], semesterConfig({ STUDENT_ROLE_ID: "student" })), []);
});

test("state hash matches the web implementation (sha256 hex)", () => {
    assert.equal(hashStateToken("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
