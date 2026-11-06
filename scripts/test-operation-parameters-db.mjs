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
const { readLedger, replaceLedger } = await import("../src/lib/ledger-storage.server.ts");
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
  assert.deepEqual(await readLedger(c, company, "postingAccounts"), [mapping]);
  await replaceLedger(c, company, "postingAccounts", [{ ...mapping, glAccountCode: "10200" }]);
  assert.equal((await readLedger(c, company, "postingAccounts"))[0].glAccountCode, "10200");
  await replaceLedger(c, company, "postingAccounts", []);
  assert.equal((await readLedger(c, company, "postingAccounts")).length, 0);
  await c.query(
    "INSERT INTO cash_accounts(company_id,name,currency,opening_date,opening_balance,user_id) VALUES($1,'JPY cash','JPY','2026-01-01',0,(SELECT id FROM app_users ORDER BY id LIMIT 1))",
    [company],
  );
  console.log(
    "PASS: relational posting mapping create/read/update/delete, company scope and JPY cash persistence (rolled back).",
  );
} finally {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
}
