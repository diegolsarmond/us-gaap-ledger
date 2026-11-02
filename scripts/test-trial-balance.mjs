import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { randomUUID } from "node:crypto";
import pg from "pg";
registerHooks({
  resolve(s, c, n) {
    if (s.startsWith(".") && c.parentURL?.includes("/src/")) {
      const u = new URL(s + ".ts", c.parentURL);
      if (existsSync(u)) return n(u.href, c);
    }
    return n(s, c);
  },
  load(u, c, n) {
    if (u.endsWith("/src/lib/auth.server.ts"))
      return {
        format: "module",
        source: "export async function readSession(){return globalThis.journalSession}",
        shortCircuit: true,
      };
    if (u.endsWith("/src/lib/db.server.ts"))
      return {
        format: "module",
        source: "export function db(){return globalThis.journalDb}",
        shortCircuit: true,
      };
    return n(u, c);
  },
});
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const schema = "journal_test_" + randomUUID().replaceAll("-", "");
let created = false;
try {
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  await client.query(`SET search_path TO "${schema}"`);
  for (const file of readdirSync(new URL("../database/", import.meta.url))
    .filter((x) => x.endsWith(".sql") && !x.startsWith("000") && !x.includes("seed_accounts"))
    .sort())
    await client.query(readFileSync(new URL("../database/" + file, import.meta.url), "utf8"));
  globalThis.journalDb = {
    query: (...args) => client.query(...args),
    connect: async () => ({ query: (...args) => client.query(...args), release() {} }),
  };
  const { executeJournal: run } = await import("../src/lib/journal.server.ts");
  const { replaceLedger, readLedger } = await import("../src/lib/ledger-storage.server.ts");
  const admin = (await client.query("SELECT id FROM access_profiles WHERE system_admin LIMIT 1"))
    .rows[0].id;
  const user = (
    await client.query(
      "INSERT INTO app_users(name,email,password_hash,profile_id) VALUES('Journal tester','journal@test.local','00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',$1) RETURNING id",
      [admin],
    )
  ).rows[0].id;
  const approver = (
    await client.query(
      "INSERT INTO app_users(name,email,password_hash,profile_id) VALUES('Approver','approver@test.local','00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',$1) RETURNING id",
      [admin],
    )
  ).rows[0].id;
  const company = (
    await client.query(
      "INSERT INTO companies(name,entity,state) VALUES('Journal test','LLC','FL') RETURNING id",
    )
  ).rows[0].id;
  const other = (
    await client.query(
      "INSERT INTO companies(name,entity,state) VALUES('Other','LLC','FL') RETURNING id",
    )
  ).rows[0].id;
  globalThis.journalSession = { id: user, name: "Journal tester", email: "journal@test.local" };
  await client.query("BEGIN");
  await replaceLedger(client, company, "accounts", [
    { code: "1000", name: "Cash", type: "Asset", balanceType: "Debit", description: "" },
    { code: "4000", name: "Revenue", type: "Revenue", balanceType: "Credit", description: "" },
  ]);
  await replaceLedger(client, company, "currencies", [
    { code: "USD", name: "US Dollar", isBaseCurrency: true, status: "Active" },
    { code: "EUR", name: "Euro", isBaseCurrency: false, status: "Active" },
  ]);
  await replaceLedger(client, company, "fiscalPeriods", [
    {
      id: "p1",
      periodCode: "2026-01",
      fiscalYear: "2026",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      status: "Open",
    },
    {
      id: "p2",
      periodCode: "2026-02",
      fiscalYear: "2026",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      status: "Locked",
    },
  ]);
  await client.query("COMMIT");
  const value = {
    journalType: "Manual",
    accountingDate: "2026-01-10",
    description: "Exact test",
    reference: "",
    currency: "USD",
    exchangeRate: "1",
    exchangeRateSource: "Parity",
    lines: [
      { accountCode: "1000", description: "", debit: "0.30", credit: "0" },
      { accountCode: "4000", description: "", debit: "0", credit: "0.30" },
    ],
  };

  await client.query("UPDATE accounting_policies SET approval_required=false WHERE company_id=$1", [
    company,
  ]);
  await client.query(
    "INSERT INTO accounting_policies(company_id,approval_required) VALUES($1,false) ON CONFLICT(company_id) DO UPDATE SET approval_required=false",
    [company],
  );
  const { generateTrialBalance: trial } = await import("../src/lib/trial-balance.server.ts");
  const { exactSum } = await import("../src/lib/trial-balance.ts");
  assert.equal(exactSum(["999999999999999.9900", "0.0100"]), "1000000000000000.0000");
  const call = (operation, extra = {}) => run({ companyId: company, operation, ...extra });
  const filters = { companyId: company, start: "2026-01-01", end: "2026-01-31", showZero: true };
  await call("save", { value });
  let r = await trial(filters);
  assert.equal(r.accounts.length, 2);
  assert.equal(Number(r.total_debit), 0, "draft excluded");
  const j = (await call("save", { value })).entry;
  await call("post", { id: j.id, version: j.version });
  r = await trial(filters);
  assert.equal(r.status, "Balanced");
  assert.equal(Number(r.total_debit), 0.3);
  assert.equal(Number(r.total_credit), 0.3);
  assert.equal(Number(r.accounts.find((a) => a.code === "1000").closing_debit), 0.3);
  const filtered = await trial({ ...filters, accountType: "Asset" });
  assert.equal(filtered.accounts.length, 1);
  assert.equal(filtered.status, "Balanced");
  assert.equal(Number(filtered.subset_difference), 0.3);
  const a = await trial({ ...filters, account: "1000" });
  assert.equal(a.activity.length, 1);
  assert.equal(Number(a.activity[0].running), 0.3);
  const opening = await trial({ ...filters, start: "2026-02-01", end: "2026-02-28" });
  assert.equal(Number(opening.accounts[0].opening_debit), 0.3);
  assert.equal(Number(opening.accounts[0].period_debit), 0, "closed period allowed");
  await call("reverse", {
    id: j.id,
    version: (await call("detail", { id: j.id })).entry.version,
    reason: "Trial reversal",
    reversalDate: "2026-01-20",
  });
  r = await trial({ ...filters, showZero: false });
  assert.equal(Number(r.total_debit), 0);
  assert.equal(r.accounts.length, 2, "net zero activity remains visible");
  const detail = await trial({ ...filters, account: "1000" });
  assert.equal(detail.activity.length, 2);
  assert.equal(Number(detail.activity.at(-1).running), 0);
  const unassigned = await trial({ ...filters, costCenter: "Unassigned" });
  assert.equal(unassigned.status, "Balanced");
  await assert.rejects(() => trial({ ...filters, costCenter: "foreign-center" }), /unavailable/);
  await assert.rejects(() => trial({ ...filters, start: "2026-03-01" }), /Start date/);
  const restricted = (
    await client.query("INSERT INTO access_profiles(name) VALUES('Restricted trial') RETURNING id")
  ).rows[0].id;
  await client.query("UPDATE app_users SET profile_id=$2 WHERE id=$1", [user, restricted]);
  await assert.rejects(() => trial(filters), /access denied/);
  console.log(
    "PASS: exact decimals, posted-only, net balances, global versus display filters, opening history, closed periods, activity reconciliation, reversals, zero activity, cost center validation, company access.",
  );
} finally {
  if (created) {
    await client.query("ROLLBACK");
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
  await client.end();
}
