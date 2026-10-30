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
const schema = "cash_controls_test_" + randomUUID().replaceAll("-", "");
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
    "010_cash_flow_management",
    "011_cash_chart_links",
    "016_cash_flow_controls",
    "016_cash_flow_controls",
  ])
    await pool.query(
      readFileSync(new URL("../database/" + migration + ".sql", import.meta.url), "utf8"),
    );
  const user = (
    await pool.query(
      "INSERT INTO app_users(name,email,password_hash,profile_id) SELECT 'Test','controls@test.invalid',$1,id FROM access_profiles WHERE system_admin RETURNING id,name,email",
      ["0".repeat(32) + ":" + "0".repeat(128)],
    )
  ).rows[0];
  globalThis.testLedgerSession = user;
  const company = (
    await pool.query(
      "INSERT INTO companies(name,entity,state) VALUES('Controls test','LLC','FL') RETURNING id",
    )
  ).rows[0].id;
  for (const data of [
    { code: "1000", name: "Operating bank", type: "Asset", balanceType: "Debit" },
    { code: "1010", name: "Reserve bank", type: "Asset", balanceType: "Debit" },
    { code: "4000", name: "Sales", type: "Revenue", balanceType: "Credit" },
  ])
    await pool.query(
      "INSERT INTO ledger_accounts(company_id,id,position,data) VALUES($1,$2,0,$3)",
      [company, data.code, data],
    );
  const category = "Test";
  await pool.query("INSERT INTO cash_categories(name,company_id) VALUES($1,$2)", [
    category,
    company,
  ]);
  const service = await import("../src/lib/cash-flow.server.ts");
  const base = { companyId: company, currency: "USD", opening_date: "2026-01-01" };
  await service.saveAccount({
    ...base,
    name: "Operating",
    opening_balance: 1000,
    gl_account_code: "1000",
  });
  await service.saveAccount({
    ...base,
    name: "Reserve",
    opening_balance: 0,
    gl_account_code: "1010",
  });
  const accounts = (await service.load(company)).accounts;
  const operating = accounts.find((a) => a.name === "Operating").id;
  const reserve = accounts.find((a) => a.name === "Reserve").id;
  const entry = {
    companyId: company,
    account_id: operating,
    description: "Receipt",
    category,
    direction: "in",
    amount: 100,
    due_date: "2026-09-10",
    paid_date: "2026-09-10",
    status: "paid",
    cash_flow_line: "customers",
    variance_note: "",
    gl_account_code: "4000",
    transfer_account_id: null,
  };
  await service.saveTransaction(entry);

  // Transfers are written and deleted as a pair.
  const transfer = {
    ...entry,
    description: "Move to reserve",
    direction: "out",
    amount: 300,
    due_date: "2026-10-05",
    paid_date: "2026-10-05",
    cash_flow_line: "internal_transfer",
    gl_account_code: null,
    transfer_account_id: reserve,
  };
  await service.saveTransaction(transfer);
  let legs = (await service.load(company)).transactions.filter((t) => t.transfer_id);
  assert.equal(legs.length, 2);
  assert.equal(new Set(legs.map((t) => t.transfer_id)).size, 1);
  const inLeg = legs.find((t) => t.account_id === reserve);
  assert.equal(inLeg.direction, "in");
  assert.equal(inLeg.transfer_account_id, operating);
  assert.equal(inLeg.gl_account_code, "1000");
  assert.equal(legs.find((t) => t.account_id === operating).gl_account_code, "1010");
  await service.saveTransaction({
    ...transfer,
    id: inLeg.id === legs[0].id ? legs[1].id : legs[0].id,
    amount: 250,
  });
  legs = (await service.load(company)).transactions.filter((t) => t.transfer_id);
  assert.deepEqual(
    legs.map((t) => t.amount),
    [250, 250],
  );
  await assert.rejects(
    service.saveTransaction({
      ...entry,
      id: inLeg.id,
      account_id: reserve,
      due_date: "2026-10-05",
      paid_date: "2026-10-05",
    }),
    /cannot be reclassified/,
  );
  await assert.rejects(
    service.saveTransaction({
      ...entry,
      cash_flow_line: "internal_transfer",
      transfer_account_id: operating,
    }),
  );

  // GL check: cash module differs from GL until the journals reflect the same cash.
  const scope = {
    companyId: company,
    start: "2026-10-01",
    end: "2026-10-31",
    currency: "USD",
    accountId: null,
  };
  let check = await service.checkGlCash(scope);
  assert.equal(check.status, "difference");
  assert.equal(check.cashBalance, 1100);
  await pool.query(
    "INSERT INTO ledger_journals(company_id,id,position,data) VALUES($1,'JE-1',0,$2)",
    [
      company,
      {
        id: "JE-1",
        date: "2026-01-01",
        status: "Posted",
        lines: [
          { accountCode: "1000", debit: 1100, credit: 0 },
          { accountCode: "4000", debit: 0, credit: 1100 },
        ],
      },
    ],
  );
  check = await service.checkGlCash(scope);
  assert.equal(check.status, "verified");
  assert.equal((await service.checkGlCash({ ...scope, currency: "BRL" })).status, "unavailable");

  // Closed periods freeze cash records dated in them, including the transfer pair.
  await pool.query(
    "INSERT INTO ledger_fiscalperiods(company_id,id,position,data) VALUES($1,'P9',0,$2),($1,'P10',1,$3)",
    [
      company,
      {
        id: "P9",
        periodCode: "2026-09",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        status: "Locked",
      },
      {
        id: "P10",
        periodCode: "2026-10",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        status: "Soft-Close",
      },
    ],
  );
  const september = (await service.load(company)).transactions.find(
    (t) => t.description === "Receipt",
  );
  await assert.rejects(
    service.saveTransaction({ ...entry, id: september.id, amount: 90 }),
    /2026-09 is locked/,
  );
  await assert.rejects(service.saveTransaction({ ...entry }), /2026-09 is locked/);
  await assert.rejects(service.removeTransaction(september.id, company), /2026-09 is locked/);
  // Moving an actual out of a locked period is also blocked; planned items have no accounting date.
  await assert.rejects(
    service.saveTransaction({ ...entry, id: september.id, paid_date: "2026-11-02" }),
    /locked/,
  );
  await service.saveTransaction({
    ...entry,
    status: "planned",
    paid_date: null,
    due_date: "2026-09-15",
  });
  await assert.rejects(
    service.saveAccount({
      ...base,
      id: operating,
      name: "Operating",
      opening_balance: 900,
      gl_account_code: "1000",
      opening_date: "2026-09-01",
    }),
    /locked/,
  );
  // Soft-close: allowed for close_periods holders, blocked for others.
  await service.removeTransaction(legs[0].id, company);
  assert.equal((await service.load(company)).transactions.filter((t) => t.transfer_id).length, 0);
  await pool.query(
    "UPDATE access_profiles SET close_periods=false WHERE id=(SELECT profile_id FROM app_users WHERE id=$1)",
    [user.id],
  );
  await assert.rejects(
    service.saveTransaction({ ...entry, due_date: "2026-10-07", paid_date: "2026-10-07" }),
    /soft-closed/,
  );
  console.log(
    "PASS: migration rerun, paired transfers, GL cash check, locked and soft-closed periods. Isolated schema removed.",
  );
} finally {
  if (pool) await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
  await admin.end();
}
