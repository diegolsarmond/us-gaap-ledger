import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const source = readFileSync(new URL("../src/lib/parameters-context.tsx", import.meta.url), "utf8");
const start = source.indexOf("const newContext ="),
  end = source.indexOf("export function useAccounting");
assert.ok(start >= 0 && end > start);
const code = ts.transpileModule(
  source.slice(start, end) + "\nglobalThis.observedContext = Context;",
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;
let created = 0;
const sandbox = { createContext: () => ({ instance: ++created }) };
runInNewContext(code, sandbox);
const first = sandbox.observedContext;
// Each HMR evaluation has fresh module bindings and the same global context registry.
runInNewContext("{ " + code + " }", sandbox);
assert.equal(created, 2);
assert.equal(sandbox.observedContext, first);
console.log("PASS: ParametersProvider and cached route consumers retain one context across HMR.");
