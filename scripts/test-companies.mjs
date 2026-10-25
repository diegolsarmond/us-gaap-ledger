import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import pg from "pg";

// Only the session boundary is substituted. Authorization and business services run unchanged.
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
    if (url.endsWith(".ts") && url.includes("/src/"))
      return {
        format: "module",
        source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText,
        shortCircuit: true,
      };
    return next(url, context);
  },
});

const { companySchema } = await import("../src/lib/company-model.ts");
const { parseStatementCsv } = await import("../src/lib/statement-csv.ts");
assert(!companySchema.safeParse({ name: "Test", entity: "LLC", state: "FL", ein: "123" }).success);
assert.equal(
  companySchema.parse({ name: "Test", entity: "LLC", state: "FL", ein: "12-3456789" }).ein,
  "123456789",
);
assert.equal(
  parseStatementCsv('date,description,amount\n2026-10-01,"A, B",-12.50')[0].amount,
  -12.5,
);
assert.throws(() => parseStatementCsv("date,description,amount\n2026-02-30,A,1"));
assert.throws(() => parseStatementCsv("date,description,amount\n2026-10-01,A,0"));
assert.throws(() => parseStatementCsv('date,description,amount\n2026-10-01,"A,1'));
console.log("PASS: cadastro EUA, EIN e parser CSV.");
if (!process.env.DATABASE_URL) {
  console.log("SKIP: integração PostgreSQL requer DATABASE_URL.");
  process.exit(0);
}
const original = process.env.DATABASE_URL;
const admin = new pg.Client({ connectionString: original, connectionTimeoutMillis: 5000 });
const schema = "company_test_" + randomUUID().replaceAll("-", "");
let pool;
try {
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(original);
  url.searchParams.set("options", "-c search_path=" + schema);
  process.env.DATABASE_URL = url.href;
  ({ db: pool } = await import("../src/lib/db.server.ts"));
  const connection = pool();
  for (const migration of ["001_auth", "002_cash_flow", "003_access_audit", "004_companies"])
    await connection.query(
      readFileSync(new URL("../database/" + migration + ".sql", import.meta.url), "utf8"),
    );
  const profile = (await connection.query("SELECT id FROM access_profiles WHERE system_admin"))
    .rows[0].id;
  const user = (
    await connection.query(
      "INSERT INTO app_users(name,email,password_hash,profile_id) VALUES('Test Admin','admin@example.test',$1,$2) RETURNING id,name,email",
      ["0".repeat(32) + ":" + "0".repeat(128), profile],
    )
  ).rows[0];
  globalThis.testLedgerSession = user;
  const legacy = (
    await connection.query(
      "INSERT INTO cash_accounts(user_id,name,currency,opening_date) VALUES($1,'Legacy','USD','2026-01-01') RETURNING id",
      [user.id],
    )
  ).rows[0].id;
  await connection.query(
    "INSERT INTO cash_transactions(user_id,account_id,description,category,direction,amount,due_date,status) VALUES($1,$2,'Legacy','Legacy','in',5,'2026-01-01','planned')",
    [user.id, legacy],
  );
  const auditBefore = Number(
    (await connection.query("SELECT count(*) FROM system_audit_log")).rows[0].count,
  );
  const cleanup = readFileSync(
    new URL("../database/005_reset_legacy_cash.sql", import.meta.url),
    "utf8",
  );
  await connection.query(cleanup);
  await connection.query(cleanup);
  assert.equal(
    Number((await connection.query("SELECT count(*) FROM cash_accounts")).rows[0].count),
    0,
  );
  assert(
    Number((await connection.query("SELECT count(*) FROM system_audit_log")).rows[0].count) >=
      auditBefore,
  );
  assert.equal(Number((await connection.query("SELECT count(*) FROM app_users")).rows[0].count), 1);
  await connection.query(
    readFileSync(new URL("../database/006_system_parameters.sql", import.meta.url), "utf8"),
  );
  const companies = await import("../src/lib/companies.server.ts");
  const accounting = await import("../src/lib/accounting.server.ts");
  const adminService = await import("../src/lib/admin.server.ts");
  const cash = await import("../src/lib/cash-flow.server.ts");
  const company = (name) => companySchema.parse({ name, entity: "LLC", state: "FL" });
  const a = (await companies.saveCompany(company("Alpha LLC"))).id;
  const b = (await companies.saveCompany(company("Beta LLC"))).id;
  assert.equal((await companies.listCompanies()).companies.length, 2);
  assert((await accounting.load(a)).state.accounts.length === 0);
  let revision = 0;
  const command = async (name, args) => {
    const r = await accounting.execute({ companyId: a, revision, command: name, args });
    revision = r.revision;
    return r;
  };
  await command("addAccount", [
    { code: "1000", name: "Bank", description: "", type: "Asset", balanceType: "Debit" },
  ]);
  await command("addAccount", [
    { code: "4000", name: "Revenue", description: "", type: "Revenue", balanceType: "Credit" },
  ]);
  await command("addFiscalPeriod", [
    {
      periodCode: "2026-10",
      fiscalYear: "2026",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      status: "Open",
    },
  ]);
  const entry = {
    date: "2026-10-01",
    memo: "Opening",
    sourceType: "Manual",
    lines: [
      { accountCode: "1000", debit: 100, credit: 0 },
      { accountCode: "4000", debit: 0, credit: 100 },
    ],
  };
  await command("postJournalEntry", [entry]);
  await assert.rejects(
    command("postJournalEntry", [
      {
        ...entry,
        lines: [
          { accountCode: "9999", debit: 100, credit: 0 },
          { accountCode: "4000", debit: 0, credit: 100 },
        ],
      },
    ]),
  );
  const journal = (await accounting.load(a)).state.journals[0];
  await command("reverseJournalEntry", [journal.id, "Correction of entry"]);
  const state = (await accounting.load(a)).state;
  const engine = await import("../src/lib/accounting-engine.ts");
  assert.equal(
    engine.createAccountingEngine(
      state,
      (await accounting.load(a)).company,
      accounting.persona(user, { write_accounting: true, close_periods: true, manage_users: true }),
    ).value.accountBalances["1000"].net,
    0,
  );
  await assert.rejects(
    accounting.execute({
      companyId: a,
      revision: 0,
      command: "addAccount",
      args: [{ code: "X", name: "X", description: "", type: "Asset", balanceType: "Debit" }],
    }),
  );
  assert.equal((await accounting.load(b)).state.accounts.length, 0);
  for (const [code, type, balanceType] of [
    ["1100", "Asset", "Debit"],
    ["2000", "Liability", "Credit"],
    ["6100", "Operating Expense", "Debit"],
    ["1300", "Asset", "Debit"],
    ["5000", "COGS", "Debit"],
    ["4100", "Revenue", "Credit"],
    ["2200", "Liability", "Credit"],
    ["6300", "Other Expense", "Debit"],
  ]) {
    await command("addAccount", [{ code, name: code, description: "", type, balanceType }]);
  }
  await command("createProject", [
    {
      code: "P1",
      name: "Project",
      clientName: "Customer",
      budget: 0,
      contractValue: 100,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      status: "Active",
      notes: "",
    },
  ]);
  const project = (await accounting.load(a)).state.projects[0];
  await command("addInventoryItem", [
    {
      sku: "SKU1",
      name: "Product",
      type: "Product",
      qtyOnHand: 0,
      unitCost: 10,
      unitPrice: 20,
      valuationMethod: "FIFO",
    },
  ]);
  const purchased = await command("createBill", [
    {
      vendorName: "Vendor",
      billNumber: "V1",
      date: "2026-10-01",
      dueDate: "2026-10-31",
      currency: "EUR",
      fxRate: 1.1,
      foreignAmount: 100,
      items: [
        {
          id: "item1",
          description: "Purchase",
          accountCode: "1300",
          isInventory: true,
          sku: "SKU1",
          qty: 10,
          amount: 110,
          projectId: project.id,
        },
      ],
    },
  ]);
  await command("payBill", [purchased.result.billId, "2026-10-02", 1.2]);
  const issued = await command("createInvoice", [
    {
      customerName: "Customer",
      date: "2026-10-02",
      dueDate: "2026-10-31",
      kind: "Product",
      items: [
        {
          id: "line1",
          description: "Sale",
          sku: "SKU1",
          isProduct: true,
          qty: 2,
          unitPrice: 20,
          taxable: false,
        },
      ],
      subtotal: 40,
      taxRate: 0,
      taxAmount: 0,
      total: 40,
      taxExempt: true,
      projectId: project.id,
    },
  ]);
  await command("recordInvoicePayment", [issued.result.invoiceId, "2026-10-03"]);
  await command("importStatement", [
    {
      name: "bank.csv",
      type: "CSV",
      accountCode: "1000",
      content: "date,description,amount\n2026-10-04,Sale,12.50",
    },
  ]);
  const staged = (await accounting.load(a)).state.stagingRows[0];
  await command("classifyStagingRow", [staged.id, "4000"]);
  const live = (await accounting.load(a)).state;
  assert.equal(live.inventory[0].qtyOnHand, 8);
  assert.equal(live.invoices[0].status, "Paid");
  assert.equal(live.bills[0].status, "Paid");
  assert.equal(live.bills[0].usdAmount, 110);
  assert.equal(live.stagingRows[0].status, "Classified");
  assert(live.statements[0].content.includes("Sale"));
  assert.equal((await accounting.load(b)).state.invoices.length, 0);
  console.log(
    "PASS: projetos, estoque, faturas, recebimentos, contas a pagar, câmbio e classificação de extrato CSV.",
  );
  await cash.saveAccount({
    companyId: a,
    name: "Bank",
    currency: "USD",
    opening_date: "2026-10-01",
    opening_balance: 0,
  });
  const bank = (await cash.load(a)).accounts[0];
  await assert.rejects(
    cash.saveTransaction({
      companyId: b,
      account_id: bank.id,
      description: "Cross company",
      category: "Other",
      direction: "in",
      amount: 1,
      due_date: "2026-10-01",
      paid_date: null,
      status: "planned",
    }),
  );
  await cash.saveTransaction({
    companyId: a,
    account_id: bank.id,
    description: "Real",
    category: "Sales",
    direction: "in",
    amount: 5,
    due_date: "2026-10-01",
    paid_date: null,
    status: "planned",
  });
  await connection.query(cleanup);
  assert.equal((await cash.load(a)).transactions.length, 1);
  const profileData = {
    name: "Restricted",
    manage_users: false,
    manage_profiles: false,
    view_audit: true,
    write_cash: true,
    manage_companies: false,
    write_accounting: true,
    close_periods: false,
    all_companies: false,
    company_ids: [a],
  };
  await adminService.saveProfile(profileData);
  const restricted = (
    await connection.query("SELECT id FROM access_profiles WHERE name='Restricted'")
  ).rows[0].id;
  const staff = (
    await connection.query(
      "INSERT INTO app_users(name,email,password_hash,profile_id) VALUES('Staff','staff@example.test',$1,$2) RETURNING id,name,email",
      ["0".repeat(32) + ":" + "0".repeat(128), restricted],
    )
  ).rows[0];
  globalThis.testLedgerSession = staff;
  assert.equal((await companies.listCompanies()).companies.length, 1);
  await assert.rejects(accounting.load(b));
  await assert.rejects(cash.load(b));
  await assert.rejects(companies.saveCompany(company("Unauthorized")));
  await assert.rejects(adminService.loadAudit(1, b));
  await assert.rejects(
    accounting.execute({ companyId: b, revision: 0, command: "addAccount", args: [] }),
  );
  await connection.query("DELETE FROM profile_companies WHERE profile_id=$1", [restricted]);
  assert.equal((await companies.listCompanies()).companies.length, 0);
  await assert.rejects(accounting.load(a));
  globalThis.testLedgerSession = user;
  await companies.saveCompany({ ...company("Alpha LLC"), id: a, active: false });
  await assert.rejects(accounting.load(a));
  console.log(
    "PASS: migrações e limpeza idempotentes; empresas vazias; perfis e revogação; isolamento de leitura/escrita; lançamentos e estorno; concorrência; caixa; auditoria; inativação.",
  );
} catch (e) {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
} finally {
  if (pool) await pool().end();
  if (/^[a-z0-9_]+$/.test(schema))
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
  await admin.end().catch(() => {});
}
