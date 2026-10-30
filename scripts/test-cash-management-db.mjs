import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { randomUUID } from "node:crypto";
import pg from "pg";
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
const admin = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const schema = "cash_management_test_" + randomUUID().replaceAll("-", "");
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
    "006_system_parameters",
    "007_cash_categories",
    "012_vendors",
    "013_customers",
  ])
    await pool.query(
      readFileSync(new URL("../database/" + migration + ".sql", import.meta.url), "utf8"),
    );
  const user = (
    await pool.query(
      "INSERT INTO app_users(name,email,password_hash,profile_id) SELECT 'Test','cash@test.invalid',$1,id FROM access_profiles WHERE system_admin RETURNING id,name,email",
      ["0".repeat(32) + ":" + "0".repeat(128)],
    )
  ).rows[0];
  globalThis.testLedgerSession = user;
  const company = (
    await pool.query(
      "INSERT INTO companies(name,entity,state) VALUES('Cash test','LLC','FL') RETURNING id",
    )
  ).rows[0].id;
  const account = (
    await pool.query(
      "INSERT INTO cash_accounts(company_id,user_id,name,currency,opening_date,opening_balance) VALUES($1,$2,'Test','USD','2026-01-01',1000) RETURNING id",
      [company, user.id],
    )
  ).rows[0].id;
  const category = "Test sales";
  await pool.query("INSERT INTO cash_categories(name,company_id) VALUES($1,$2)", [
    category,
    company,
  ]);
  const legacy = (
    await pool.query(
      "INSERT INTO cash_transactions(company_id,user_id,account_id,description,category,direction,amount,due_date,status) VALUES($1,$2,$3,'Legacy',$4,'in',100,'2026-10-01','planned') RETURNING id",
      [company, user.id, account, category],
    )
  ).rows[0].id;
  const sql = readFileSync(
    new URL("../database/010_cash_flow_management.sql", import.meta.url),
    "utf8",
  );
  await pool.query(sql);
  await pool.query(sql);
  const linksMigration = readFileSync(
    new URL("../database/011_cash_chart_links.sql", import.meta.url),
    "utf8",
  );
  await pool.query(linksMigration);
  await pool.query(linksMigration);
  await pool.query(
    readFileSync(new URL("../database/016_cash_flow_controls.sql", import.meta.url), "utf8"),
  );
  for (const data of [
    { code: "1000", name: "Bank", type: "Asset", balanceType: "Debit", description: "" },
    { code: "4000", name: "Sales", type: "Revenue", balanceType: "Credit", description: "" },
  ])
    await pool.query(
      "INSERT INTO ledger_accounts(company_id,id,position,data) VALUES($1,$2,0,$3)",
      [company, data.code, data],
    );
  const service = await import("../src/lib/cash-flow.server.ts");
  assert.equal((await service.load(company)).transactions[0].forecast_amount, 100);
  const input = {
    companyId: company,
    id: legacy,
    account_id: account,
    description: "Legacy",
    category,
    direction: "in",
    amount: 80,
    due_date: "2026-10-12",
    status: "paid",
    paid_date: "2026-10-12",
    cash_flow_line: "customers",
    variance_note: "Delayed and discounted",
    gl_account_code: "4000",
  };
  await service.saveTransaction(input);
  let saved = (await service.load(company)).transactions.find((t) => t.id === legacy);
  assert.equal(saved.forecast_amount, 100);
  assert.equal(saved.forecast_date, "2026-10-01");
  assert.equal(saved.amount, 80);
  assert.equal(saved.gl_account_code, "4000");
  await assert.rejects(service.removeTransaction(legacy, company), /Cancel forecasted/);
  await service.saveTransaction({ ...input, status: "cancelled", paid_date: null });
  saved = (await service.load(company)).transactions.find((t) => t.id === legacy);
  assert.equal(saved.forecast_amount, 100);
  await service.saveTransaction({ ...input, id: undefined, description: "Unplanned" });
  assert.equal(
    (await service.load(company)).transactions.find((t) => t.description === "Unplanned")
      .forecast_amount,
    null,
  );
  const bank = {
    id: account,
    companyId: company,
    name: "Test",
    currency: "USD",
    opening_date: "2026-01-01",
    opening_balance: 1000,
    gl_account_code: "1000",
  };
  await service.saveAccount(bank);
  await assert.rejects(service.saveAccount({ ...bank, gl_account_code: "4000" }), /Asset/);
  const other = (
    await pool.query(
      "INSERT INTO companies(name,entity,state) VALUES('Other','LLC','FL') RETURNING id",
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO ledger_accounts(company_id,id,position,data) VALUES($1,'9999',0,$2)",
    [
      other,
      {
        code: "9999",
        name: "Other sales",
        type: "Revenue",
        balanceType: "Credit",
        description: "",
      },
    ],
  );
  await assert.rejects(
    service.saveTransaction({ ...input, gl_account_code: "9999" }),
    /does not belong/,
  );
  await assert.rejects(
    pool.query("UPDATE cash_transactions SET gl_account_code='9999' WHERE id=$1", [legacy]),
    (error) => error.code === "23503",
  );
  await assert.rejects(
    pool.query("DELETE FROM ledger_accounts WHERE company_id=$1 AND id='1000'", [company]),
    (error) => error.code === "23503",
  );
  const accounting = await import("../src/lib/accounting.server.ts");
  await assert.rejects(
    accounting.execute({
      companyId: company,
      revision: 0,
      command: "deleteAccount",
      args: ["4000"],
    }),
    /forecast/,
  );
  await assert.rejects(
    accounting.execute({
      companyId: company,
      revision: 0,
      command: "updateAccount",
      args: [
        "1000",
        { name: "Invalid", type: "Liability", balanceType: "Credit", description: "" },
      ],
    }),
    /Asset/,
  );
  await accounting.execute({
    companyId: company,
    revision: 0,
    command: "updateAccount",
    args: ["1000", { name: "Linked bank", type: "Asset", balanceType: "Debit", description: "" }],
  });
  assert.equal((await service.load(company)).accounts[0].gl_account_code, "1000");
  await service.saveTransaction({
    ...input,
    id: undefined,
    description: "Future sale",
    status: "planned",
    paid_date: null,
    amount: 150,
  });
  const forecast = (await service.load(company)).transactions.find(
    (t) => t.description === "Future sale",
  );
  await service.saveTransaction({
    ...forecast,
    companyId: company,
    status: "paid",
    paid_date: "2026-10-20",
    amount: 140,
  });
  const settled = (await service.load(company)).transactions.find((t) => t.id === forecast.id);
  assert.equal(settled.gl_account_code, "4000");
  assert.equal(settled.forecast_amount, 150);
  assert.equal(settled.amount, 140);
  assert.equal(
    (
      await pool.query("SELECT count(*)::int AS n FROM ledger_journals WHERE company_id=$1", [
        company,
      ])
    ).rows[0].n,
    0,
  );
  const usage = (await accounting.cashAccountLinks(company)).find((l) => l.code === "4000");
  assert.equal(usage.actual, 2);
  assert.equal(usage.cancelled, 1);
  assert.equal(usage.planned, 0);
  const scope = {
    companyId: company,
    start: "2026-10-01",
    end: "2026-10-31",
    currency: "USD",
    accountId: null,
  };
  const reconciliation = {
    ...scope,
    net_income: 100,
    depreciation: 10,
    receivables: -20,
    inventory: 0,
    payables: 0,
    taxes_payable: 0,
    other_adjustments: -10,
    balance_sheet_cash: 1080,
    explanation: "Trial balance and bank reconciliation",
  };
  await service.writeReconciliation(reconciliation);
  await service.writeReconciliation({ ...reconciliation, net_income: 120 });
  assert.equal((await service.readReconciliation(scope)).net_income, 120);
  assert.equal(await service.readReconciliation({ ...scope, currency: "BRL" }), null);
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM cash_flow_reconciliations")).rows[0].n,
    1,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM system_audit_log WHERE entity='cash_flow_reconciliations'",
      )
    ).rows[0].n,
    2,
  );
  await pool.query(
    "UPDATE app_users SET profile_id=(SELECT id FROM access_profiles WHERE name='Consulta') WHERE id=$1",
    [user.id],
  );
  await assert.rejects(service.writeReconciliation(reconciliation));
  console.log(
    "PASS: migration rerun, baseline preservation, cancellation, unplanned actuals, scoped reconciliation upsert, audit and write authorization. Isolated schema removed.",
  );
} finally {
  if (pool) await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
  await admin.end();
}
