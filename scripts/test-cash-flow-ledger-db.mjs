// Cash Flow reads actual cash from posted journals only (database/037_cash_flow_ledger_only.sql).
// Runs every migration in a throwaway schema, posts journals directly and checks balances,
// classification (default, mapping, per-movement override), forecasts and the GL proof.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
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
const schema = "cash_ledger_test_" + randomUUID().replaceAll("-", "");
let pool;
try {
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("options", "-c search_path=" + schema);
  process.env.DATABASE_URL = url.href;
  pool = (await import("../src/lib/db.server.ts")).db();
  const current = (await pool.query("SELECT current_schema() AS s")).rows[0].s;
  assert.equal(current, schema, "tests must never run against the application schema");
  // 000 creates the database and 024 imports one client's chart; neither belongs in a test.
  for (const file of readdirSync(new URL("../database/", import.meta.url))
    .filter((f) => f.endsWith(".sql") && !/^(000|024)_/.test(f))
    .sort())
    await pool.query(readFileSync(new URL("../database/" + file, import.meta.url), "utf8"));

  const user = (
    await pool.query(
      "INSERT INTO app_users(name,email,password_hash,profile_id) SELECT 'Test','ledger-cash@test.invalid',$1,id FROM access_profiles WHERE system_admin RETURNING id,name,email",
      ["0".repeat(32) + ":" + "0".repeat(128)],
    )
  ).rows[0];
  globalThis.testLedgerSession = user;
  const company = (
    await pool.query(
      "INSERT INTO companies(name,entity,state) VALUES('Cash ledger test','LLC','FL') RETURNING id",
    )
  ).rows[0].id;
  const accounts = [
    ["1000", "Operating checking", "Asset", "Debit", "Checking", null],
    ["1010", "Reserve savings", "Asset", "Debit", "Savings", null],
    ["1500", "Equipment", "Asset", "Debit", "Machinery & equipment", "Noncurrent"],
    ["2500", "Bank loan", "Liability", "Credit", "Notes payable", "Noncurrent"],
    ["3000", "Opening balance equity", "Equity", "Credit", "Opening balance equity", null],
    ["4000", "Sales", "Revenue", "Credit", "Sales of product income", null],
    ["6000", "Rent", "Operating Expense", "Debit", "Rent or lease of buildings", null],
    ["6100", "Payroll expenses", "Operating Expense", "Debit", "Payroll expenses", null],
  ];
  for (const [i, [code, name, type, balance, detail, maturity]] of accounts.entries())
    await pool.query(
      `INSERT INTO ledger_accounts(company_id,id,position,code,name,type,balance_type,description,detail_type,maturity)
       VALUES($1,$2,$3,$2,$4,$5,$6,'',$7,$8)`,
      [company, code, i, name, type, balance, detail, maturity],
    );
  await pool.query(
    `INSERT INTO ledger_fiscalperiods(company_id,id,position,period_code,fiscal_year,start_date,end_date,status)
     VALUES($1,'p2026',0,'2026',2026,'2026-01-01','2026-12-31','Open')`,
    [company],
  );
  const tenant = (await pool.query("SELECT id FROM accounting_tenant")).rows[0].id;
  let number = 0;
  async function post(date, type, lines) {
    const id = randomUUID();
    number += 1;
    await pool.query(
      `INSERT INTO journal_entries(id,tenant_id,company_id,journal_number,journal_type,accounting_date,fiscal_period_id,
       description,status,transaction_currency,exchange_rate,exchange_rate_source,created_by)
       VALUES($1,$2,$3,$4,$5,$6,'p2026',$7,'Draft','USD',1,'parity',$8)`,
      [id, tenant, company, `JE-${number}`, type, date, `Journal ${number}`, user.id],
    );
    for (const [i, [code, debit, credit]] of lines.entries())
      await pool.query(
        `INSERT INTO journal_entry_lines(tenant_id,company_id,journal_entry_id,line_number,account_code,debit,credit,base_debit,base_credit)
         VALUES($1,$2,$3,$4,$5,$6,$7,$6,$7)`,
        [tenant, company, id, i + 1, code, debit, credit],
      );
    // Lines first, then posting: the database checks the balance when a journal is posted.
    await pool.query("UPDATE journal_entries SET status='Posted', posted_at=now() WHERE id=$1", [
      id,
    ]);
    return id;
  }
  await post("2026-01-01", "Opening", [
    ["1000", 10000, 0],
    ["3000", 0, 10000],
  ]);
  await post("2026-01-05", "Manual", [
    ["1000", 500, 0],
    ["4000", 0, 500],
  ]);
  const split = await post("2026-01-10", "Manual", [
    ["6000", 300, 0],
    ["6100", 200, 0],
    ["1000", 0, 500],
  ]);
  await post("2026-01-12", "Manual", [
    ["1010", 1000, 0],
    ["1000", 0, 1000],
  ]);
  await post("2026-01-15", "Manual", [
    ["1000", 2000, 0],
    ["2500", 0, 2000],
  ]);

  // QuickBooks history of 1000: lines QuickBooks had posted before the 2026-01-01 opening,
  // plus one dated after it (in neither the opening nor the ledger).
  const feed = randomUUID();
  await pool.query(
    `INSERT INTO ledger_statements(company_id,id,position,file_name,account_code,file_type,rows_count,uploaded_at,uploaded_by,status,feed_source_format)
     VALUES($1,$2,0,'qb.csv','1000','csv',4,'2026-01-01','Test','Pending Review','quickbooks-posted')`,
    [company, feed],
  );
  const history = [
    ["2025-12-10", "Customer deposit", 4000, "Added to:  Deposit: 4000 Sales 12/10/2025 $4,000.00"],
    ["2025-12-20", "Supplies", -1500, "Added to:  Expense: Split expense 12/20/2025 $1,500.00"],
    ["2025-12-22", "Vendor bill", -500, "Matched to:  Bill Payment: Split expense SI1 $500.00"],
    ["2026-01-20", "Late rent", -100, "Added to:  Check: 6000 Rent 01/20/2026 $100.00"],
  ];
  const historyIds = [];
  for (const [i, [date, description, amount, posting]] of history.entries()) {
    const id = randomUUID();
    historyIds.push(id);
    await pool.query(
      `INSERT INTO ledger_stagingrows(company_id,id,position,file_id,date,description,amount,suggested_account,status,feed_external_posting)
       VALUES($1,$2,$3,$4,$5,$6,$7,'','Pending',$8)`,
      [company, id, i, feed, date, description, amount, posting],
    );
  }

  const service = await import("../src/lib/cash-flow.server.ts");
  const model = await import("../src/lib/cash-flow-model.ts");
  let data = await service.load(company);
  {
    const qb = data.transactions.filter((t) => t.source === "quickbooks");
    assert.deepEqual(
      qb.map((t) => [t.paid_date, t.cash_flow_line, t.counterpart_code]).sort(),
      [
        ["2025-12-10", "customers", "4000"],
        ["2025-12-20", "unclassified", null],
        ["2025-12-22", "suppliers", null],
      ],
      "QuickBooks history up to the opening, classified by its account or transaction type",
    );
    const start = data.transactions.filter((t) => t.account_id === "1000" && t.balance_adjustment);
    assert.deepEqual(
      start.map((t) => [t.paid_date, t.direction, t.amount]),
      [["2025-12-09", "in", 8000]],
      "the opening becomes the balance before the history: 10000 - (4000 - 1500 - 500)",
    );
    const at = (date) =>
      model
        .summarize([data.accounts[0]], data.transactions, date, date, "daily", false)
        .periods.at(-1).balance;
    assert.equal(at("2025-12-31"), 10000, "history reaches the QuickBooks opening balance");
    assert.deepEqual(data.statementPending, [{ account: "1000", count: 1, oldest: "2026-01-20" }]);
    await service.saveOverride({
      companyId: company,
      journal_id: `qb:${historyIds[1]}`,
      line_sequence: 0,
      counterpart_code: "",
      cash_flow_line: "opex",
    });
    data = await service.load(company);
    assert.equal(
      data.transactions.find((t) => t.id === `quickbooks:${historyIds[1]}`).cash_flow_line,
      "opex",
      "a split QuickBooks line can be reclassified",
    );
  }
  assert.deepEqual(
    data.accounts.map((a) => [a.id, a.first_posting]),
    [
      ["1000", "2026-01-01"],
      ["1010", "2026-01-12"],
    ],
    "cash accounts are the bank accounts of the chart, with ledger history",
  );
  const both = data.accounts;
  const balance = (scope, date) =>
    model.summarize(scope, data.transactions, date, date, "daily", false).periods.at(-1).balance;
  assert.equal(balance(both, "2026-01-31"), 12000);
  assert.equal(balance([both[0]], "2026-01-31"), 11000);
  const lines = () =>
    Object.fromEntries(
      model
        .statement(both, data.transactions, "2026-01-01", "2026-01-31", false)
        .lines.filter((l) => l.count)
        .map((l) => [l.key, l.net]),
    );
  assert.deepEqual(
    lines(),
    { customers: 500, opex: -300, payroll: -200, borrowings: 2000 },
    "default lines by account type; the opening and the internal transfer are not flows",
  );
  const pieces = data.transactions.filter((t) => t.journal?.id === split);
  assert.deepEqual(
    pieces.map((t) => [t.counterpart_code, t.amount]).sort(),
    [
      ["6000", 300],
      ["6100", 200],
    ],
    "a payment of several expenses is split by counterpart",
  );
  const transfer = model.statement([both[0]], data.transactions, "2026-01-01", "2026-01-31", false);
  assert.equal(transfer.transfers, -1000, "a transfer out of scope stays visible as a transfer");

  await service.saveMapping({
    companyId: company,
    account_code: "4000",
    inflow_line: "other_operating_in",
    outflow_line: "opex",
  });
  const rent = pieces.find((t) => t.counterpart_code === "6000");
  await service.saveOverride({
    companyId: company,
    journal_id: split,
    line_sequence: rent.journal.sequence,
    counterpart_code: "6000",
    cash_flow_line: "capex",
  });
  data = await service.load(company);
  assert.deepEqual(lines(), {
    other_operating_in: 500,
    capex: -300,
    payroll: -200,
    borrowings: 2000,
  });
  await assert.rejects(
    service.saveMapping({
      companyId: company,
      account_code: "1010",
      inflow_line: "capital",
      outflow_line: "opex",
    }),
    /always internal transfers/,
  );
  await service.saveOverride({
    companyId: company,
    journal_id: split,
    line_sequence: rent.journal.sequence,
    counterpart_code: "6000",
    cash_flow_line: null,
  });
  data = await service.load(company);
  assert.equal(lines().opex, -300, "removing the override returns to the mapping");

  const forecast = {
    companyId: company,
    account_code: "1000",
    counterpart_code: "6000",
    description: "February rent",
    direction: "out",
    amount: 700,
    expected_date: "2026-02-10",
    status: "planned",
    cash_flow_line: "opex",
    variance_note: "",
  };
  await assert.rejects(
    service.saveForecast({ ...forecast, counterpart_code: "1010" }),
    /is a transfer/,
  );
  await service.saveForecast(forecast);
  await service.saveForecast({
    ...forecast,
    counterpart_code: "1010",
    description: "Move to reserve",
    amount: 400,
    cash_flow_line: "internal_transfer",
  });
  data = await service.load(company);
  const rentPlan = data.transactions.find((t) => t.description === "February rent");
  const legs = data.transactions.filter((t) => t.description === "Move to reserve");
  assert.deepEqual(legs.map((t) => [t.account_id, t.direction, t.transfer_account_id]).sort(), [
    ["1000", "out", "1010"],
    ["1010", "in", "1000"],
  ]);
  const projected = (scope) =>
    model
      .summarize(scope, data.transactions, "2026-02-28", "2026-02-28", "daily", true, "2026-02-01")
      .periods.at(-1).balance;
  assert.equal(projected(both), 11300, "a transfer inside the scope does not change its cash");
  assert.equal(projected([both[0]]), 9900, "out of scope, the transfer leaves this account");

  await service.saveForecast({ ...forecast, id: rentPlan.id, amount: 750, status: "realized" });
  data = await service.load(company);
  const realized = data.transactions.find((t) => t.id === rentPlan.id);
  assert.equal(realized.forecast_amount, 700, "the first plan is preserved");
  assert.equal(projected([both[0]]), 10600, "a realized forecast leaves the projection");

  const proof = await service.checkGlCash({
    companyId: company,
    start: "2026-01-01",
    end: "2026-01-31",
    currency: "USD",
    accountId: null,
  });
  assert.equal(proof.status, "verified", proof.reason);
  assert.equal(proof.glBalance, 12000);
  console.log("Cash flow ledger tests passed.");
} finally {
  await pool?.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
  await admin.end();
}
