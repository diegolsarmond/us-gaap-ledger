import pg from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
try {
  await client.connect();
  await client.query("BEGIN");
  const schema = "access_test_" + randomUUID().replaceAll("-", "");
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  for (const file of ["001_auth.sql", "002_cash_flow.sql", "003_access_audit.sql"]) {
    const sql = (await readFile(new URL("../database/" + file, import.meta.url), "utf8"))
      .replace(/^BEGIN;\s*/, "")
      .replace(/COMMIT;\s*$/, "");
    await client.query(sql);
    if (file === "001_auth.sql")
      await client.query(
        "INSERT INTO app_users(name,email,password_hash) VALUES('Admin','admin@test.local',$1)",
        ["a".repeat(32) + ":" + "b".repeat(128)],
      );
  }
  const user = (
    await client.query(
      "SELECT u.id,p.system_admin FROM app_users u JOIN access_profiles p ON p.id=u.profile_id",
    )
  ).rows[0];
  assert.equal(user.system_admin, true);
  await client.query("SELECT set_config('app.actor_id',$1,true)", [user.id]);
  await client.query("UPDATE app_users SET name='Renamed' WHERE id=$1", [user.id]);
  const log = (await client.query("SELECT * FROM system_audit_log")).rows[0];
  assert.equal(log.actor_id, user.id);
  assert.equal(log.before_data.name, "Admin");
  assert.equal(log.after_data.name, "Renamed");
  assert.equal("password_hash" in log.after_data, false);
  const account = (
    await client.query(
      "INSERT INTO cash_accounts(user_id,name,currency,opening_date) VALUES($1,'Bank','USD','2026-10-01') RETURNING id",
      [user.id],
    )
  ).rows[0];
  await client.query("SELECT set_config('app.actor_id','',true)");
  await client.query("DELETE FROM cash_accounts WHERE id=$1", [account.id]);
  const deletion = (await client.query("SELECT * FROM system_audit_log WHERE action='DELETE'"))
    .rows[0];
  assert.equal(deletion.actor_id, user.id);
  assert.equal(deletion.target_id, account.id);
  const consultation = (await client.query("SELECT id FROM access_profiles WHERE name='Consulta'")).rows[0];
  await client.query("UPDATE app_users SET profile_id=$1 WHERE id=$2", [consultation.id, user.id]);
  await client.query("UPDATE access_profiles SET view_audit=true WHERE id=$1", [consultation.id]);
  const logCount = (await client.query("SELECT count(*)::int AS count FROM system_audit_log")).rows[0].count;
  const migration = (await readFile(new URL("../database/003_access_audit.sql", import.meta.url), "utf8"))
    .replace(/^BEGIN;\s*/, "").replace(/COMMIT;\s*$/, "");
  await client.query(migration);
  await client.query(migration);
  const preserved = (await client.query("SELECT u.profile_id,p.view_audit FROM app_users u JOIN access_profiles p ON p.id=u.profile_id WHERE u.id=$1", [user.id])).rows[0];
  assert.equal(preserved.profile_id, consultation.id);
  assert.equal(preserved.view_audit, true);
  assert.equal((await client.query("SELECT count(*)::int AS count FROM system_audit_log")).rows[0].count, logCount);
  assert.equal((await client.query("SELECT count(*)::int AS count FROM access_profiles")).rows[0].count, 3);
  console.log("OK: reexecução da migração preserva perfis, permissões e auditoria sem duplicações.");
  console.log(
    "OK: migrações, administrador inicial, auditoria de alterações/exclusões, responsável e exclusão de hash de senha. Teste revertido.",
  );
} catch (e) {
  console.error(
    "Teste SQL falhou:",
    e.code ?? e.name,
    e.message?.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[redacted]"),
  );
  process.exitCode = 1;
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end().catch(() => {});
}
