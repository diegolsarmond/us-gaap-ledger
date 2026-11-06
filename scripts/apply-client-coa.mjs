import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { US_GAAP_COA } from "../src/lib/coa.ts";

const companyId = "d11094b7-d2c1-451e-9e09-fdb489f2b96c";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(803003)");
  const company = (
    await client.query("SELECT id,name FROM companies WHERE id=$1 FOR UPDATE", [companyId])
  ).rows[0];
  if (!company) throw new Error("Clear Choice Filter LLC not found.");
  const others = async () =>
    (
      await client.query(
        "SELECT * FROM ledger_accounts WHERE company_id<>$1 ORDER BY company_id,id",
        [companyId],
      )
    ).rows;
  const accounts = async () =>
    (
      await client.query("SELECT * FROM ledger_accounts WHERE company_id=$1 ORDER BY id", [
        companyId,
      ])
    ).rows;
  const beforeOthers = await others();
  const before = await accounts();
  await client.query(
    readFileSync(new URL("../database/021_seed_accounts.sql", import.meta.url), "utf8"),
  );
  const sql = readFileSync(
    new URL("../database/024_updated_coa_template.sql", import.meta.url),
    "utf8",
  )
    .replace(/^BEGIN;\s*$/m, "")
    .replace(/^COMMIT;\s*$/m, "");
  await client.query(sql);
  const after = await accounts();
  assert.equal(after.length, 104, "Expected exactly 104 accounts; transaction rolled back.");
  for (const expected of US_GAAP_COA) {
    const row = after.find((a) => a.code === expected.code);
    assert.ok(row, `Missing account ${expected.code}`);
    assert.equal(row.type, expected.type);
    assert.equal(row.balance_type, expected.balanceType);
    assert.equal(row.detail_type, expected.detailType);
    assert.equal(row.track1099, expected.track1099);
    assert.equal(row.is_contra, expected.isContra);
    assert.equal(row.parent_account_code ?? undefined, expected.parentCode);
  }
  for (const original of before) {
    const row = after.find((a) => a.id === original.id);
    for (const field of [
      "id",
      "name",
      "type",
      "balance_type",
      "description",
      "is_contra",
      "position",
    ])
      assert.deepEqual(
        row?.[field],
        original[field],
        `Existing account ${original.id} changed ${field}`,
      );
  }
  assert.deepEqual(await others(), beforeOthers, "Other companies must be unchanged.");
  await client.query("UPDATE companies SET revision=revision+1 WHERE id=$1", [companyId]);
  await client.query(
    "INSERT INTO system_audit_log(actor_name,action,entity,target_id,company_id,after_data) VALUES('Codex','REAPPLY_COA','Accounting',$1::text,$1::uuid,$2::jsonb)",
    [
      companyId,
      JSON.stringify({
        accounts: after.length,
        script: "024_updated_coa_template.sql",
        otherCompaniesUnchanged: true,
      }),
    ],
  );
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  await client.query("COMMIT");
  console.log(
    JSON.stringify({
      company: company.name,
      companyId,
      before: before.length,
      after: after.length,
      subaccounts: after.filter((a) => a.parent_account_code).length,
      track1099: after.filter((a) => a.track1099).length,
      otherCompaniesUnchanged: true,
      committed: true,
    }),
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
