import pg from "pg";
import assert from "node:assert/strict";
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
try {
  await c.connect();
  await c.query("BEGIN");
  const company = (
    await c.query("INSERT INTO companies(name,entity,state) VALUES($1,'LLC','FL') RETURNING id", [
      "Temporary parameter test",
    ])
  ).rows[0].id;
  for (const domain of [
    "currencies",
    "taxjurisdictions",
    "paymentterms",
    "costcenters",
    "expensecategories",
    "fiscalperiods",
  ]) {
    const table = "ledger_" + domain,
      id = crypto.randomUUID();
    await c.query("INSERT INTO " + table + "(company_id,id,position,data) VALUES($1,$2,0,$3)", [
      company,
      id,
      JSON.stringify({ test: true }),
    ]);
    assert.equal(
      (await c.query("SELECT data FROM " + table + " WHERE company_id=$1 AND id=$2", [company, id]))
        .rows[0].data.test,
      true,
    );
    await c.query("UPDATE " + table + " SET data=$3 WHERE company_id=$1 AND id=$2", [
      company,
      id,
      JSON.stringify({ test: "updated" }),
    ]);
    assert.equal(
      (await c.query("SELECT data FROM " + table + " WHERE company_id=$1 AND id=$2", [company, id]))
        .rows[0].data.test,
      "updated",
    );
    await c.query("DELETE FROM " + table + " WHERE company_id=$1 AND id=$2", [company, id]);
    assert.equal(
      (await c.query("SELECT id FROM " + table + " WHERE company_id=$1 AND id=$2", [company, id]))
        .rowCount,
      0,
    );
    assert.equal(
      (
        await c.query(
          "SELECT id FROM system_audit_log WHERE company_id=$1 AND entity=$2 AND target_id=$3",
          [company, table, id],
        )
      ).rowCount,
      3,
    );
  }
  console.log(
    "PASS: persisted CRUD and audit events for all six parameter domains. Test data rolled back.",
  );
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}
