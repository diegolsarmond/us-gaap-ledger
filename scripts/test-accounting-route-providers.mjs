import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToString } from "react-dom/server";
import ts from "typescript";

// Render the real route components independently of the root layout. Stop at
// useAccounting so this checks provider ownership without requiring a database.
const require = createRequire(import.meta.url);
const context = React.createContext(false);
const reachedAccounting = new Error("Accounting consumer reached with its provider");
const store = {
  AccountingProvider: ({ children }) =>
    React.createElement(context.Provider, { value: true }, children),
  useAccounting() {
    assert.equal(React.useContext(context), true, "AccountingProvider ausente");
    throw reachedAccounting;
  },
};
let tested = 0;
for (const name of readdirSync(new URL("../src/routes/", import.meta.url))) {
  if (!name.endsWith(".tsx") || name === "__root.tsx") continue;
  const source = readFileSync(new URL(`../src/routes/${name}`, import.meta.url), "utf8");
  if (!source.includes('from "@/lib/accounting-store"')) continue;
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(
    output,
    {
      exports,
      require(specifier) {
        if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
        if (specifier === "@tanstack/react-router")
          return { createFileRoute: () => (options) => options };
        if (specifier === "@/lib/accounting-store") return store;
        if (specifier === "@/components/modal-provider") return { useModal: () => ({}) };
        return {};
      },
    },
    { filename: name },
  );
  assert.throws(
    () => renderToString(React.createElement(exports.Route.component)),
    (error) => error === reachedAccounting,
    `${name} must provide accounting context even without a parent route provider`,
  );
  tested++;
}
assert.ok(tested >= 15, "Expected all accounting routes to be exercised");
console.log(`${tested} accounting routes render their consumers inside a local provider.`);
