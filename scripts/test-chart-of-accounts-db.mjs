import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { randomUUID } from "node:crypto";
import pg from "pg";

// Substitute only the HTTP session boundary; use real services and PostgreSQL.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.includes("/src/")) {
      const url = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(url)) return next(url.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith("/src/lib/auth.server.ts"))
      return {
        format: "module",
        source: "export async function readSession(){return globalThis.testLedgerSession??null}",
        shortCircuit: true,
      };
    return next(url, context);
  },
});
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const admin = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const schema = "coa_test_" + randomUUID().replaceAll("-", "");
let pool;
try {
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("options", "-c search_path=" + schema);
  process.env.DATABASE_URL = url.href;
  pool = (await import("../src/lib/db.server.ts")).db();
  for (const migration of [
    "001_auth",
    "002_cash_flow",
    "003_access_audit",
    "004_companies",
    "017_company_columns",
    "011_cash_chart_links",
    "012_vendors",
    "013_customers",
    "014_us_gaap_coa",
  ])
    await pool.query(
      readFileSync(new URL("../database/" + migration + ".sql", import.meta.url), "utf8"),
    );
  const profile = (await pool.query("SELECT id FROM access_profiles WHERE system_admin")).rows[0]
    .id;
  const user = (
    await pool.query(
      "INSERT INTO app_users(name,email,password_hash,profile_id) VALUES('COA Admin','coa@test.invalid',$1,$2) RETURNING id,name,email",
      ["0".repeat(32) + ":" + "0".repeat(128), profile],
    )
  ).rows[0];
  globalThis.testLedgerSession = user;
  const companyData = ["COA company", "LLC", "FL"];
  const a = (
    await pool.query(
      "INSERT INTO companies(name,entity,state) VALUES($1,$2,$3) RETURNING id",
      companyData,
    )
  ).rows[0].id;
  const b = (
    await pool.query("INSERT INTO companies(name,entity,state) VALUES($1,$2,$3) RETURNING id", [
      "Other company",
      "LLC",
      "FL",
    ])
  ).rows[0].id;
  const service = await import("../src/lib/accounting.server.ts");
  let revision = 0;
  async function command(command, args) {
    const result = await service.execute({ companyId: a, revision, command, args });
    revision = result.revision;
    return result;
  }
  assert.deepEqual((await service.load(a)).state.accounts, []);
  await pool.query(
    readFileSync(new URL("../database/014_us_gaap_coa.sql", import.meta.url), "utf8"),
  );
  const installed = await service.execute({
    companyId: b,
    revision: 0,
    command: "installUsGaapCoa",
    args: [],
  });
  assert.equal(installed.state.accounts.length, 81);
  assert.equal(installed.state.accounts.find((a) => a.code === "15200").balanceType, "Credit");
  assert.equal(installed.state.accounts.find((a) => a.code === "30200").type, "Equity");
  assert.equal(
    (
      await pool.query(
        "SELECT * FROM chart_of_accounts WHERE company_id=$1 AND account_code='50300'",
        [b],
      )
    ).rows[0].track_1099,
    true,
  );
  await assert.rejects(
    service.execute({
      companyId: b,
      revision: installed.revision,
      command: "installUsGaapCoa",
      args: [],
    }),
    /empty chart/,
  );

  const account = {
    code: "1000",
    name: "Bank",
    type: "Asset",
    balanceType: "Debit",
    description: "Real account",
  };
  await command("addAccount", [{ ...account, code: " 1000 ", name: " Bank " }]);
  let persisted = (await service.load(a)).state.accounts;
  assert.equal(persisted[0].code, "1000");
  assert.equal(persisted[0].name, "Bank");
  assert.equal((await service.load(b)).state.accounts.length, 81);
  await assert.rejects(command("addAccount", [account]), /already exists|Já existe/);
  await assert.rejects(command("addAccount", [{ ...account, code: " " }]));
  const changes = {
    name: "Operating bank",
    type: "Asset",
    balanceType: "Debit",
    description: "Updated description",
  };
  await command("updateAccount", ["1000", changes]);
  assert.equal((await service.load(a)).state.accounts[0].name, "Operating bank");
  await assert.rejects(command("updateAccount", ["missing", changes]), /not found|não encontrada/);
  await command("addAccount", [{ ...account, code: "unused" }]);
  await command("deleteAccount", ["unused"]);
  assert.equal((await service.load(a)).state.accounts.length, 1);
  // A persisted journal is sufficient to protect history, even after reversal.
  await pool.query(
    "INSERT INTO ledger_journals(company_id,id,position,data) VALUES($1,'posted',0,$2)",
    [
      a,
      {
        id: "posted",
        date: "2026-10-01",
        memo: "Historical entry",
        sourceType: "Manual",
        currency: "USD",
        fxRate: 1,
        status: "Posted",
        createdBy: user.name,
        createdAt: new Date().toISOString(),
        lines: [
          { id: "d", accountCode: "1000", debit: 100, credit: 0 },
          { id: "c", accountCode: "1000", debit: 0, credit: 100 },
        ],
      },
    ],
  );
  await assert.rejects(command("deleteAccount", ["1000"]), /linked records|vínculos/);
  await assert.rejects(
    command("updateAccount", ["1000", { ...changes, balanceType: "Credit" }]),
    /normal balance|natureza/,
  );
  await command("updateAccount", ["1000", { ...changes, name: "Renamed used account" }]);
  const balanceState = await service.load(a);
  assert.equal(balanceState.state.journals.length, 1);
  assert.equal(balanceState.state.accounts[0].name, "Renamed used account");
  await assert.rejects(
    service.execute({ companyId: a, revision: 0, command: "deleteAccount", args: ["1000"] }),
    /outra sessão/,
  );
  assert.ok(
    (
      await pool.query(
        "SELECT 1 FROM system_audit_log WHERE company_id=$1 AND action='updateAccount'",
        [a],
      )
    ).rowCount,
  );
  const readOnly = (await pool.query("SELECT id FROM access_profiles WHERE name='Consulta'"))
    .rows[0].id;
  await pool.query("UPDATE app_users SET profile_id=$2 WHERE id=$1", [user.id, readOnly]);
  await pool.query("INSERT INTO profile_companies(profile_id,company_id) VALUES($1,$2)", [
    readOnly,
    a,
  ]);
  await assert.rejects(
    service.execute({
      companyId: a,
      revision,
      command: "addAccount",
      args: [{ ...account, code: "denied" }],
    }),
  );
  assert.equal((await service.load(a)).state.accounts.length, 1);
  await assert.rejects(service.load(b));
  console.log(
    "PASS: empty company, PostgreSQL persistence, trimming, duplicate codes, edit/delete, journal history, concurrency, audit, permissions and company isolation. Isolated schema removed.",
  );
} finally {
  if (pool) await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
  await admin.end();
}
