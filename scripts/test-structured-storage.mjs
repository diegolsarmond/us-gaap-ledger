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
        source: "export async function readSession(){return globalThis.structuredSession}",
        shortCircuit: true,
      };
    if (url.endsWith("/src/lib/db.server.ts"))
      return {
        format: "module",
        source: "export function db(){return globalThis.structuredDb}",
        shortCircuit: true,
      };
    return next(url, context);
  },
});
const { readLedger, replaceLedger } = await import("../src/lib/ledger-storage.server.ts");
const { ledgerSchemas } = await import("../src/lib/ledger-schema.ts");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const schema = "structured_test_" + randomUUID().replaceAll("-", "");
let created = false;
const migration = (name) =>
  client.query(readFileSync(new URL("../database/" + name, import.meta.url), "utf8"));
try {
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  await client.query(`SET search_path TO "${schema}"`);
  const migrations = readdirSync(new URL("../database/", import.meta.url))
    .filter((name) => name.endsWith(".sql") && !name.startsWith("000"))
    .sort();
  for (const name of migrations.filter((name) => name < "018")) await migration(name);
  const company = (
    await client.query(
      "INSERT INTO companies(name,entity,state) VALUES('Storage test','LLC','FL') RETURNING id",
    )
  ).rows[0].id;
  const records = {};
  // All domains, scalar types, flattened objects and child collections are covered.
  for (const [domain, spec] of Object.entries(ledgerSchemas)) {
    const row = {};
    for (const field of spec.fields) {
      let value =
        field.type === "boolean"
          ? false
          : ["numeric", "integer"].includes(field.type)
            ? 12
            : field.type === "uuid"
              ? randomUUID()
              : field.type === "date"
                ? "2026-10-30"
                : "Example";
      if (field.path === "id" || field.path === "code")
        value = domain === "currencies" && field.path === "code" ? "USD" : "record-1";
      if (field.path === "parentCode") continue;
      if (field.path === "maturity") value = "Unclassified";
      if (field.path === "type" && domain === "accounts") value = "Asset";
      const keys = field.path.split(".");
      let target = row;
      for (const key of keys.slice(0, -1)) target = target[key] ??= {};
      target[keys.at(-1)] = value;
    }
    for (const [key, fields] of Object.entries(spec.children)) {
      if (key === "companyIds") {
        row[key] = [company];
        continue;
      }
      row[key] = [
        Object.fromEntries(
          fields.map((f) => [
            f.path,
            f.type === "boolean"
              ? true
              : ["numeric", "integer"].includes(f.type)
                ? 7
                : f.type === "uuid"
                  ? randomUUID()
                  : f.type === "date"
                    ? "2026-10-30"
                    : "detail",
          ]),
        ),
      ];
    }
    records[domain] = row;
    if (domain === "currencies")
      for (const key of ["symbol", "exchangeRateToUsd", "quotationType", "lastUpdated"])
        delete row[key];
    await client.query(
      `INSERT INTO ledger_${domain.toLowerCase()}(company_id,id,position,data) VALUES($1,$2,0,$3)`,
      [company, row.code && ["accounts", "currencies"].includes(domain) ? row.code : row.id, row],
    );
  }
  const snapshot = {
    nested: { amount: 7.25, enabled: false, absent: null },
    list: ["a", {}, [], 9],
  };
  const event = (
    await client.query(
      "INSERT INTO system_audit_log(actor_name,action,entity,target_id,before_data,after_data) VALUES('Test','TEST','test','1',$1,$2) RETURNING id",
      [snapshot, {}],
    )
  ).rows[0].id;
  if (process.argv.includes("--without-reconciliation"))
    await client.query("DROP TABLE cash_flow_reconciliations");
  await migration("018_structured_ledger.sql");
  await migration("018_structured_ledger.sql");
  await migration("019_structured_audit.sql");
  await migration("019_structured_audit.sql");
  assert.deepEqual(
    (await client.query("SELECT before_data,after_data FROM system_audit_log WHERE id=$1", [event]))
      .rows[0],
    { before_data: snapshot, after_data: {} },
  );
  await client.query(
    "INSERT INTO system_audit_log(actor_name,action,entity,target_id,after_data) VALUES('Test','TEST','test','2',$1)",
    [snapshot],
  );
  for (const [domain, expected] of Object.entries(records)) {
    const rows = await readLedger(client, company, domain);
    assert.deepEqual(rows, [expected], `backfill ${domain}`);
    await client.query("BEGIN");
    await replaceLedger(client, company, domain, rows);
    await client.query("COMMIT");
    assert.deepEqual(await readLedger(client, company, domain), rows, `roundtrip ${domain}`);
  }
  globalThis.structuredDb = {
    query: client.query.bind(client),
    connect: async () => Object.assign(client, { release() {} }),
  };
  globalThis.structuredSession = (
    await client.query(
      "INSERT INTO app_users(name,email,password_hash,profile_id) SELECT 'Storage admin','storage@test.invalid',$1,id FROM access_profiles WHERE system_admin RETURNING id,name,email",
      ["0".repeat(32) + ":" + "0".repeat(128)],
    )
  ).rows[0];
  const accounting = await import("../src/lib/accounting.server.ts");
  const parameters = await import("../src/lib/parameters.server.ts");
  const companies = await import("../src/lib/companies.server.ts");
  const { companySchema } = await import("../src/lib/company-model.ts");
  const cash = await import("../src/lib/cash-flow.server.ts");
  const liveCompany = (
    await companies.saveCompany(
      companySchema.parse({ name: "Application test", entity: "LLC", state: "FL" }),
    )
  ).id;
  let revision = 0;
  for (const account of [
    { code: "1000", name: "Bank", type: "Asset" },
    { code: "3000", name: "Equity", type: "Equity" },
  ]) {
    const result = await accounting.execute({
      companyId: liveCompany,
      revision,
      command: "addAccount",
      args: [
        {
          ...account,
          balanceType: account.type === "Asset" ? "Debit" : "Credit",
          description: "Test",
        },
      ],
    });
    revision = result.revision;
  }
  revision = (
    await accounting.execute({
      companyId: liveCompany,
      revision,
      command: "addFiscalPeriod",
      args: [
        {
          periodCode: "2026-10",
          fiscalYear: "2026",
          startDate: "2026-10-01",
          endDate: "2026-10-31",
          status: "Open",
        },
      ],
    })
  ).revision;
  const posted = await accounting.execute({
    companyId: liveCompany,
    revision,
    command: "postJournalEntry",
    args: [
      {
        date: "2026-10-30",
        memo: "Test",
        sourceType: "Manual",
        lines: [
          { accountCode: "1000", debit: 100, credit: 0 },
          { accountCode: "3000", debit: 0, credit: 100 },
        ],
      },
    ],
  });
  revision = posted.revision;
  assert.equal((await accounting.load(liveCompany)).state.journals[0].lines.length, 2);
  await parameters.writeParameter({
    companyId: liveCompany,
    revision,
    domain: "paymentTerms",
    operation: "create",
    id: "net30",
    value: {
      id: "net30",
      code: "NET30",
      name: "Net 30",
      days: 30,
      isDefaultCustomer: false,
      isDefaultVendor: false,
      status: "Active",
      scope: "companies",
      companyIds: [liveCompany],
    },
  });
  assert.equal((await accounting.load(liveCompany)).state.paymentTerms[0].days, 30);
  const reconciliation = {
    companyId: liveCompany,
    start: "2026-10-01",
    end: "2026-10-30",
    currency: "USD",
    accountId: null,
    net_income: 12.5,
    depreciation: 0,
    receivables: -1,
    inventory: 0,
    payables: 0,
    taxes_payable: 0,
    other_adjustments: 0,
    balance_sheet_cash: 100,
    explanation: "Test reconciliation",
  };
  await cash.writeReconciliation(reconciliation);
  await cash.writeReconciliation({ ...reconciliation, net_income: 13 });
  assert.deepEqual(await cash.readReconciliation(reconciliation), {
    ...reconciliation,
    net_income: 13,
  });
  const jsonColumns = await client.query(
    "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=$1 AND data_type IN ('json','jsonb') AND table_name IN (SELECT tablename FROM pg_tables WHERE schemaname=$1)",
    [schema],
  );
  assert.deepEqual(jsonColumns.rows, [], "no persisted JSON columns");
  console.log(
    "PASS: all domains backfilled and round-tripped; nested collections, typed audit snapshots, migration reruns, no JSON table columns. Isolated schema removed.",
  );
} finally {
  if (created) {
    await client.query("ROLLBACK");
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
  await client.end();
}
