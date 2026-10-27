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

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
const schema = "scope_test_" + randomUUID().replaceAll("-", "");
let pool;
try {
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("options", "-c search_path=" + schema);
  process.env.DATABASE_URL = url.href;
  pool = (await import("../src/lib/db.server.ts")).db();
  for (const name of [
    "001_auth",
    "002_cash_flow",
    "003_access_audit",
    "004_companies",
    "006_system_parameters",
    "012_vendors",
    "013_customers",
  ])
    await pool.query(
      readFileSync(new URL("../database/" + name + ".sql", import.meta.url), "utf8"),
    );
  const profile = (await pool.query("SELECT id FROM access_profiles WHERE system_admin")).rows[0]
    .id;
  globalThis.testLedgerSession = (
    await pool.query(
      "INSERT INTO app_users(name,email,password_hash,profile_id) VALUES('Scope Admin','scope@example.test',$1,$2) RETURNING id,name,email",
      ["0".repeat(32) + ":" + "0".repeat(128), profile],
    )
  ).rows[0];
  const companies = [];
  for (const name of ["A", "B"])
    companies.push(
      (
        await pool.query("INSERT INTO companies(data) VALUES($1) RETURNING id", [
          JSON.stringify({ name }),
        ])
      ).rows[0].id,
    );
  const { writeParameter, readParameters } = await import("../src/lib/parameters.server.ts");
  const id = randomUUID();
  const value = {
    id,
    code: "OPS",
    name: "Operations",
    manager: "Manager",
    annualBudget: 100,
    description: "",
    status: "Active",
    scope: "companies",
    companyIds: companies,
  };
  const mutate = async (operation, row, companyId = companies[0], rowId = id) =>
    writeParameter({
      companyId,
      domain: "costCenters",
      id: rowId,
      revision: (await readParameters(companyId)).revision,
      operation,
      value: row,
    });
  await mutate("create", value);
  let a = (await readParameters(companies[0])).costCenters[0];
  let b = (await readParameters(companies[1])).costCenters[0];
  assert.equal(a.sharedId, b.sharedId);
  await mutate("update", { ...b, name: "Shared update" }, companies[1], b.id);
  assert.equal((await readParameters(companies[0])).costCenters[0].name, "Shared update");
  await mutate("update", { ...a, companyIds: [companies[0]] });
  assert.equal((await readParameters(companies[1])).costCenters.length, 0);
  await assert.rejects(mutate("update", { ...value, companyIds: [] }), /Selecione|Select at least one company/);
  await assert.rejects(
    mutate("update", { ...value, companyIds: [companies[0], randomUUID()] }),
    /permissão/,
  );
  assert.equal((await readParameters(companies[0])).costCenters.length, 1);
  await mutate("update", { ...value, scope: "global" });
  assert.equal((await readParameters(companies[1])).costCenters[0].scope, "global");
  const { saveCompany } = await import("../src/lib/companies.server.ts");
  const created = await saveCompany({
    name: "New Company",
    entity: "LLC",
    state: "FL",
    ein: "123456789",
    active: true,
  });
  assert.equal((await readParameters(created.id)).costCenters[0].scope, "global");
  await mutate("delete");
  for (const companyId of [...companies, created.id])
    assert.equal((await readParameters(companyId)).costCenters.length, 0);
  console.log(
    "PASS: multiple companies, shared edits, unlink, empty selection, authorization rollback, global inheritance and shared deletion.",
  );
} finally {
  if (pool) await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
}
