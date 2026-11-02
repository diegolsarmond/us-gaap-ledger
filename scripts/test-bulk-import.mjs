import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import ExcelJS from "exceljs";
const { Workbook } = ExcelJS;
registerHooks({
  resolve(s, c, next) {
    if (s.startsWith(".") && c.parentURL?.includes("/src/")) {
      const u = new URL(s + ".ts", c.parentURL);
      if (existsSync(u)) return next(u.href, c);
    }
    return next(s, c);
  },
});
const { importColumns, parseImportRows, importCatalog } = await import("../src/lib/bulk-import.ts");
const { readImportWorkbook, importExample, downloadImportTemplate } =
  await import("../src/lib/import-workbook.ts");
const { createAccountingEngine, createInitialCompanyData } =
  await import("../src/lib/accounting-engine.ts");
assert.equal(Object.keys(importCatalog).length, 10);
for (const domain of Object.keys(importCatalog)) {
  assert.equal(parseImportRows(domain, [importExample(domain)]).length, 1, domain);
  let blob;
  const original = URL.createObjectURL;
  URL.createObjectURL = (value) => {
    blob = value;
    return "blob:test";
  };
  globalThis.document = { createElement: () => ({ click() {} }) };
  try {
    await downloadImportTemplate(domain);
  } finally {
    URL.createObjectURL = original;
  }
  const workbook = new Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  assert.equal(workbook.getWorksheet("Dados").rowCount, 2);
  assert.equal(
    workbook.getWorksheet("Dados").getCell("A2").value,
    importExample(domain)[importColumns(domain)[0].path],
  );
  assert.ok(workbook.getWorksheet("Dados").getCell("A2").note);
}
assert.equal(
  parseImportRows("companies", [{ ...importExample("companies"), ein: "12-3456789" }])[0].ein,
  "123456789",
);
assert.throws(
  () => parseImportRows("companies", [{ ...importExample("companies"), state: "XX" }]),
  /Linha 2/,
);
assert.equal(
  parseImportRows("customers", [{ displayName: "Cliente" }])[0].shippingSameAsBilling,
  true,
);
assert.throws(() => parseImportRows("customers", [{ displayName: "" }]), /Linha 2/);
assert.throws(() => parseImportRows("customers", []), /1.000/);
assert.throws(() => parseImportRows("customers", Array(1001).fill({ displayName: "X" })), /1.000/);
assert.throws(
  () => parseImportRows("customers", [{ displayName: "X", taxExempt: "talvez" }]),
  /true ou false/,
);
assert.equal(
  parseImportRows("customers", [
    { displayName: "X", "billingAddress.city": "Miami", taxExempt: "sim" },
  ])[0].billingAddress.city,
  "Miami",
);
assert.throws(
  () => parseImportRows("costCenters", [{ annualBudget: "1.000,00" }]),
  /ponto decimal/,
);
const book = new Workbook();
const sheet = book.addWorksheet("Dados");
sheet.addRow(importColumns("customers").map((c) => c.path));
sheet.addRow(["Cliente de teste"]);
const file = async () => new File([await book.xlsx.writeBuffer()], "clientes.xlsx");
assert.equal(
  (await readImportWorkbook(await file(), "customers"))[0].displayName,
  "Cliente de teste",
);
await assert.rejects(() => readImportWorkbook(new File([""], "dados.csv"), "customers"), /xlsx/);
await assert.rejects(async () => readImportWorkbook(await file(), "vendors"), /Cabeçalhos/);
sheet.getCell("A2").value = { formula: '"Cliente"', result: "Cliente" };
await assert.rejects(async () => readImportWorkbook(await file(), "customers"), /fórmulas/);
const state = createInitialCompanyData();
const company = {
  id: "test",
  name: "Test",
  costMethod: "FIFO",
  isPeriodClosed: false,
  activePeriod: "2026-11",
};
const persona = {
  name: "Test",
  role: "accounting_staff",
  canCreateJournals: true,
  canClosePeriod: true,
};
let engine = createAccountingEngine(state, company, persona);
for (let i = 0; i < 20; i++) {
  engine.value.addCostCenter({
    code: `C${i}`,
    name: `Center ${i}`,
    manager: "",
    annualBudget: 0,
    description: "",
    status: "Active",
  });
  engine = createAccountingEngine(engine.getState(), engine.getCompany(), persona);
}
assert.equal(new Set(engine.getState().costCenters.map((c) => c.id)).size, 20);
console.log("Bulk import: validation, workbook parsing, formula rejection and batch IDs passed.");
