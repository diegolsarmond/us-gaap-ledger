import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { customerSchema } from "../src/lib/customer-model.ts";
import { vendorSchema } from "../src/lib/vendor-model.ts";

for (const model of [customerSchema, vendorSchema]) {
  assert.equal(model.parse({ displayName: "Legacy" }).sourceOpenBalance, undefined);
  for (const value of [null, 0, -97.64, 10769.04]) {
    assert.equal(
      model.parse({ displayName: "Test", sourceOpenBalance: value }).sourceOpenBalance,
      value,
    );
  }
  for (const value of ["10.00", Infinity, NaN]) {
    assert(!model.safeParse({ displayName: "Test", sourceOpenBalance: value }).success);
  }
  assert(!model.safeParse({ displayName: "Test", sourceBalanceDate: "2026-02-30" }).success);
}
assert.equal(
  customerSchema.parse({ displayName: "Test", customerType: "Reseller" }).customerType,
  "Reseller",
);
assert(!customerSchema.safeParse({ displayName: "Test", customerType: true }).success);
assert(!customerSchema.safeParse({ displayName: "Test", customerType: "x".repeat(121) }).success);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required for database validation");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const schema = "contacts_test_" + randomUUID().replaceAll("-", "");
let created = false;
try {
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  await client.query(`SET search_path TO "${schema}"`);
  await client.query("CREATE TABLE companies(id uuid PRIMARY KEY)");
  for (const name of [
    "012_vendors",
    "013_customers",
    "015_contact_registration",
    "015_contact_registration",
  ]) {
    await client.query(readFileSync(new URL(`../database/${name}.sql`, import.meta.url), "utf8"));
  }
  const company = randomUUID();
  await client.query("INSERT INTO companies VALUES($1)", [company]);
  for (const [table, view, model] of [
    ["ledger_customers", "customer_registration", customerSchema],
    ["ledger_vendors", "vendor_registration", vendorSchema],
  ]) {
    const data = model.parse({
      displayName: "Example",
      customerType: "Reseller",
      sourceOpenBalance: -97.64,
      sourceBalanceDate: "2026-10-30",
    });
    await client.query(`INSERT INTO ${table} VALUES($1,'test',0,$2)`, [company, data]);
    const row = (await client.query(`SELECT * FROM ${view} WHERE company_id=$1`, [company]))
      .rows[0];
    assert.equal(Number(row.source_open_balance), -97.64);
    assert(row.source_balance_date);
    if (table === "ledger_customers") assert.equal(row.customer_type, "Reseller");
    for (const invalid of [
      { sourceOpenBalance: "wrong" },
      { sourceBalanceDate: "2026-02-30" },
      { displayName: null },
    ]) {
      await assert.rejects(
        client.query(`UPDATE ${table} SET data=data || $1::jsonb`, [JSON.stringify(invalid)]),
      );
    }
    await client.query(`UPDATE ${table} SET data=$1`, [{ displayName: "Legacy" }]);
    assert.equal(
      (await client.query(`SELECT source_open_balance FROM ${table}`)).rows[0].source_open_balance,
      null,
    );
  }
  console.log(
    "PASS: model validation, typed views, legacy compatibility, invalid data rejection and migration reexecution.",
  );
} finally {
  await client.query("ROLLBACK").catch(() => {});
  if (created) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
  await client.end();
}
