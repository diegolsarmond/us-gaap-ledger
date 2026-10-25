import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { randomUUID, scryptSync } from "node:crypto";
import pg from "pg";
import ts from "typescript";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const require = createRequire(import.meta.url);
let cookie;
const cookies = {
  getCookie: () => cookie,
  setCookie: (_, value) => {
    cookie = value;
  },
  deleteCookie: () => {
    cookie = undefined;
  },
};
const module = { exports: {} };
const source = ts.transpileModule(readFileSync("src/lib/auth.server.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(source, {
  module,
  exports: module.exports,
  Buffer,
  process,
  require: (name) =>
    name === "./db.server"
      ? { db: () => pool }
      : name === "@tanstack/react-start/server"
        ? cookies
        : require(name),
});
const auth = module.exports;
const email = `auth-test-${randomUUID()}@test.local`;
let id;
try {
  await auth.registerUser("Auth test", email, "OriginalPassword123!");
  id = (await pool.query("SELECT id FROM app_users WHERE email=$1", [email])).rows[0].id;
  assert.ok((await auth.signIn(email, "wrong")).error);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM system_audit_log WHERE target_id=$1 AND action='LOGIN'",
        [id],
      )
    ).rows[0].n,
    0,
  );
  assert.equal((await auth.signIn(email, "OriginalPassword123!")).error, null);
  assert.equal((await auth.readSession()).id, id);
  const salt = "a".repeat(32);
  await pool.query("UPDATE app_users SET password_hash=$1,must_change_password=true WHERE id=$2", [
    salt + ":" + scryptSync("TemporaryPassword123!", salt, 64).toString("hex"),
    id,
  ]);
  await pool.query("DELETE FROM app_sessions WHERE user_id=$1", [id]);
  assert.equal(await auth.readSession(), null);
  assert.equal((await auth.signIn(email, "TemporaryPassword123!")).error, null);
  assert.equal((await auth.readSession()).must_change_password, true);
  await assert.rejects(auth.changeRequiredPassword("TemporaryPassword123!"));
  await auth.changeRequiredPassword("NewPassword456789!");
  assert.equal((await auth.readSession()).must_change_password, false);
  await auth.signOut();
  assert.ok((await auth.signIn(email, "TemporaryPassword123!")).error);
  assert.equal((await auth.signIn(email, "NewPassword456789!")).error, null);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM system_audit_log WHERE target_id=$1 AND action='LOGIN'",
        [id],
      )
    ).rows[0].n,
    3,
  );
  console.log(
    "OK: login audit, revoked sessions, required password change, temporary password rejection and new password login.",
  );
} finally {
  if (id) {
    await pool.query("DELETE FROM app_users WHERE id=$1", [id]);
    await pool.query("DELETE FROM system_audit_log WHERE target_id=$1", [id]);
  }
  await pool.query("DELETE FROM login_attempts WHERE email=$1", [email]);
  await pool.end();
}
