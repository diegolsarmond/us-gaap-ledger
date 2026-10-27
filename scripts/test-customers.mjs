import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const source = ts.transpileModule(fs.readFileSync("src/lib/customer-model.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const model = { exports: {} };
new Function("require", "exports", "module", source)(require, model.exports, model);
const { customerSchema, validateCustomers, MAX_ATTACHMENT_BYTES } = model.exports;
const customer = (id, displayName, more = {}) => ({
  ...customerSchema.parse({ displayName, ...more }),
  id,
});
assert.equal(customerSchema.parse({ displayName: " Only name " }).displayName, "Only name");
assert.throws(() => customerSchema.parse({ displayName: " " }));
assert.throws(() => customerSchema.parse({ displayName: "Test", email: "invalid" }));
const parent = customer("p", "Parent");
const child = customer("c", "Child", { parentCustomerId: "p", billWithParent: true });
validateCustomers([parent, child], [], [], []);
assert.throws(
  () => validateCustomers([parent, customer("q", "parent")], [], [], []),
  /já cadastrado/,
);
assert.throws(() => validateCustomers([child], [], [], []), /não pertence/);
assert.throws(
  () => validateCustomers([{ ...parent, parentCustomerId: "c" }, child], [], [], []),
  /circular/,
);
assert.throws(
  () => validateCustomers([customer("x", "Foreign", { currency: "BRL" })], ["USD"], [], []),
  /Moeda/,
);
assert.throws(
  () => validateCustomers([customer("x", "Term", { paymentTermId: "outside" })], [], [], []),
  /Termo/,
);
assert.throws(
  () => validateCustomers([customer("x", "Tax", { defaultTaxCode: "outside" })], [], [], []),
  /Imposto/,
);
const attachment = { id: crypto.randomUUID(), name: "contract.pdf", size: 3, content: "YWJj" };
customerSchema.parse({ displayName: "Files", attachments: [attachment] });
assert.throws(() =>
  customerSchema.parse({ displayName: "Files", attachments: [{ ...attachment, size: 4 }] }),
);
assert.throws(() =>
  customerSchema.parse({
    displayName: "Files",
    attachments: [{ ...attachment, size: MAX_ATTACHMENT_BYTES + 1 }],
  }),
);
console.log("Customer validation: 12 checks passed.");
