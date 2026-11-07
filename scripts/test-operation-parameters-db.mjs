import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.includes("/src/")) {
      const url = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(url)) return next(url.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".ts") && url.includes("/src/"))
      return {
        format: "module",
        shortCircuit: true,
        source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText,
      };
    return next(url, context);
  },
});

const pg = (await import("pg")).default;
const { readLedger, readLedgerDomains, replaceLedger } =
  await import("../src/lib/ledger-storage.server.ts");
const { US_GAAP_COA } = await import("../src/lib/coa.ts");
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
try {
  await c.connect();
  await c.query("BEGIN");
  const company = (
    await c.query(
      "INSERT INTO companies(name,entity,state) VALUES('Parameter integration test','LLC','TX') RETURNING id",
    )
  ).rows[0].id;
  await replaceLedger(c, company, "accounts", US_GAAP_COA);
  const mapping = {
    id: "ar",
    code: "ar",
    name: "AR",
    glAccountCode: "11000",
    status: "Active",
    scope: "companies",
    sharedId: crypto.randomUUID(),
    companyIds: [company],
  };
  await replaceLedger(c, company, "postingAccounts", [mapping]);
  await replaceLedger(c, company, "currencies", [
    {
      code: "USD",
      name: "US Dollar",
      isBaseCurrency: true,
      status: "Active",
      companyIds: [company],
    },
  ]);
  await replaceLedger(c, company, "fiscalPeriods", [
    {
      id: "period",
      periodCode: "2026-11",
      fiscalYear: "2026",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      status: "Open",
      companyIds: [company],
    },
  ]);
  await replaceLedger(c, company, "inventory", [
    {
      id: "second",
      sku: "SECOND",
      name: "Second",
      type: "Product",
      qtyOnHand: 2,
      unitCost: 2.5,
      unitPrice: 5,
      valuationMethod: "FIFO",
      costLots: [{ id: "lot-2", qty: 2, unitCost: 2.5, date: "2026-11-02" }],
    },
    {
      id: "first",
      sku: "FIRST",
      name: "First",
      type: "Service",
      qtyOnHand: 0,
      unitCost: 0,
      unitPrice: 100,
      valuationMethod: "FIFO",
      costLots: [],
    },
  ]);
  const { domains } = await import("../src/lib/accounting-model.ts");
  let calls = 0;
  const batched = await readLedgerDomains(
    {
      query: (...args) => {
        calls++;
        return c.query(...args);
      },
    },
    company,
    domains,
  );
  assert.ok(calls <= 3, "A full snapshot should use at most three database round trips");
  for (const domain of domains)
    assert.deepEqual(
      batched[domain],
      await readLedger(c, company, domain),
      domain + " must preserve the original read contract",
    );
  console.log(
    "PASS: batched full-company snapshot matches all 20 ledger domains, root/child order, dates, decimals and scope in at most three round trips.",
  );

  assert.deepEqual(await readLedger(c, company, "postingAccounts"), [mapping]);
  await replaceLedger(c, company, "postingAccounts", [{ ...mapping, glAccountCode: "10200" }]);
  assert.equal((await readLedger(c, company, "postingAccounts"))[0].glAccountCode, "10200");
  await replaceLedger(c, company, "postingAccounts", []);
  assert.equal((await readLedger(c, company, "postingAccounts")).length, 0);
  console.log(
    "PASS: relational posting mapping create/read/update/delete and company scope (rolled back).",
  );
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}
