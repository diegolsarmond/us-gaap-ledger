import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(fs.readFileSync("src/lib/admin.server.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let permissions = { view_audit: true, manage_users: false };
let captured;
const connection = { query: async (sql, values) => {
  if (sql.includes("SELECT p.*")) return { rows: [permissions] };
  captured = { sql, values };
  return { rows: Array.from({ length: 101 }, (_, id) => ({ id: String(id) })) };
}};
const mod = { exports: {} };
new Function("require", "exports", "module", source)((name) => {
  if (name === "./db.server") return { db: () => connection };
  if (name === "./auth.server") return { readSession: async () => ({ id: "actor" }) };
  if (name === "./companies.server") return { authorizeCompany: async id => assert.equal(id, "company") };
  return {};
}, mod.exports, mod);
const result = await mod.exports.loadAudit(2, "company", "  Vendor  ", "addVendor");
assert.equal(result.events.length, 100);
assert.equal(result.hasMore, true);
assert.deepEqual(captured.values, [100, "company", false, "addVendor", "Vendor"]);
assert.ok(captured.sql.indexOf("action=$4") < captured.sql.indexOf("LIMIT 101"));
assert.ok(captured.sql.indexOf("lower($5)") < captured.sql.indexOf("LIMIT 101"));
permissions = { view_audit: false };
await assert.rejects(() => mod.exports.loadAudit(1), /does not allow/);
console.log("PASS: history filters before pagination, company scope, global event restrictions, and audit permissions.");
