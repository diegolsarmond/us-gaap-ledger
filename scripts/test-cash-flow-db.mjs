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
  const schema = "cash_test_" + randomUUID().replaceAll("-", "");
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  await client.query("CREATE TABLE app_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid())");
  const sql = (await readFile(new URL("../database/002_cash_flow.sql", import.meta.url), "utf8"))
    .replace(/^BEGIN;\s*/, "")
    .replace(/COMMIT;\s*$/, "");
  await client.query(sql);
  await client.query(sql);
  const users = (await client.query("INSERT INTO app_users DEFAULT VALUES RETURNING id")).rows;
  const other = (await client.query("INSERT INTO app_users DEFAULT VALUES RETURNING id")).rows[0]
    .id;
  const id = users[0].id;
  const account = (
    await client.query(
      "INSERT INTO cash_accounts(user_id,name,currency,opening_date,opening_balance) VALUES($1,'Banco','USD','2026-10-01',100.12) RETURNING id",
      [id],
    )
  ).rows[0].id;
  await client.query(
    "INSERT INTO cash_transactions(user_id,account_id,description,category,direction,amount,due_date,paid_date,status) VALUES($1,$2,'Venda','Vendas','in',20.25,'2026-10-02','2026-10-03','paid')",
    [id, account],
  );
  const row = (
    await client.query("SELECT amount::text FROM cash_transactions WHERE user_id=$1", [id])
  ).rows[0];
  assert.equal(row.amount, "20.25");
  async function rejected(sql, args, code) {
    await client.query("SAVEPOINT invalid");
    let caught = false;
    try {
      await client.query(sql, args);
    } catch (e) {
      caught = true;
      assert.equal(e.code, code);
    }
    await client.query("ROLLBACK TO SAVEPOINT invalid");
    assert.equal(caught, true);
  }
  const insert =
    "INSERT INTO cash_transactions(user_id,account_id,description,category,direction,amount,due_date,status) VALUES($1,$2,'Teste','Teste','out',$3,'2026-10-03',$4)";
  await rejected(insert, [other, account, 1, "planned"], "23503");
  await rejected(insert, [id, account, -1, "planned"], "23514");
  await rejected(insert, [id, account, 1, "paid"], "23514");
  await rejected("DELETE FROM cash_accounts WHERE id=$1", [account], "23503");
  console.log(
    "SQL validado: reexecução, precisão decimal, vínculo por usuário, valor positivo, situação/data e integridade da conta. Todas as alterações de teste serão revertidas.",
  );
} catch (e) {
  console.error("Teste SQL não concluído:", e.code ?? e.name);
  process.exitCode = 1;
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end().catch(() => {});
}
