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
  const sheet = workbook.getWorksheet(domain === "accounts" ? "COA - GENERAL" : "Data");
  assert.equal(sheet.rowCount, 2);
  assert.equal(sheet.getCell("A2").value, importExample(domain)[importColumns(domain)[0].path]);
  assert.ok(sheet.getCell("A2").note);
  const rows = await readImportWorkbook(new File([blob], "template.xlsx"), domain);
  assert.deepEqual(parseImportRows(domain, rows), parseImportRows(domain, [importExample(domain)]));
}
const coa = new Workbook();
const coaSheet = coa.addWorksheet("COA - GENERAL");
coaSheet.addRow([
  "Account Code",
  "Account Name",
  "QBO Detail Type / Managerial Category",
  "Category / Type",
  "Subgroup",
  "Normal Balance",
  "Current / Noncurrent",
  "Contra Account",
  "Track 1099",
  "Parent Code",
  "Description",
  "Current Net Balance ($)",
]);
coaSheet.addRow([
  10200,
  "Operating Checking",
  "Checking",
  "Asset",
  "Current Assets",
  "Debit",
  "Current",
  "False",
  "False",
  null,
  "Parent account",
  0,
]);
coaSheet.addRow([
  "00102",
  "Business Checking",
  "Checking",
  "Asset",
  "Current Assets",
  "Debit",
  "Current",
  "False",
  "True",
  10200,
  "Child account",
  100,
]);
const coaFile = async () => new File([await coa.xlsx.writeBuffer()], "coa.xlsx");
const coaRows = parseImportRows("accounts", await readImportWorkbook(await coaFile(), "accounts"));
assert.equal(coaRows[0].code, "10200");
assert.deepEqual(coaRows[1], {
  code: "00102",
  name: "Business Checking",
  detailType: "Checking",
  type: "Asset",
  subgroup: "Current Assets",
  balanceType: "Debit",
  maturity: "Current",
  isContra: false,
  track1099: true,
  parentCode: "10200",
  description: "Child account",
});
await assert.rejects(async () => readImportWorkbook(await coaFile(), "customers"), /Data sheet/);
coaSheet.getCell("J3").value = 10200.5;
await assert.rejects(
  async () => readImportWorkbook(await coaFile(), "accounts"),
  /Row 3, Parent Code/,
);
coaSheet.getCell("D1").value = "Wrong header";
await assert.rejects(async () => readImportWorkbook(await coaFile(), "accounts"), /Headers/);
coa.removeWorksheet(coaSheet.id);
const legacyCoa = coa.addWorksheet("Data");
const legacyColumns = importColumns("accounts");
legacyCoa.addRow(legacyColumns.map(({ path }) => path));
legacyCoa.addRow(legacyColumns.map(({ path }) => importExample("accounts")[path] ?? ""));
assert.deepEqual(
  parseImportRows("accounts", await readImportWorkbook(await coaFile(), "accounts")),
  parseImportRows("accounts", [importExample("accounts")]),
);
assert.equal(
  parseImportRows("companies", [{ ...importExample("companies"), ein: "12-3456789" }])[0].ein,
  "123456789",
);
assert.throws(
  () => parseImportRows("companies", [{ ...importExample("companies"), state: " " }]),
  /Row 2/,
);
const customerDraft = { displayName: "Cliente", registrationStatus: "Draft" };
assert.equal(parseImportRows("customers", [customerDraft])[0].shippingSameAsBilling, true);
assert.throws(() => parseImportRows("customers", [{ displayName: "" }]), /Row 2/);
assert.throws(() => parseImportRows("customers", []), /1,000/);
assert.throws(() => parseImportRows("customers", Array(1001).fill({ displayName: "X" })), /1,000/);
assert.throws(
  () => parseImportRows("customers", [{ displayName: "X", taxExempt: "talvez" }]),
  /true or false/,
);
assert.equal(
  parseImportRows("customers", [
    { ...customerDraft, "billingAddress.city": "Miami", taxExempt: "sim" },
  ])[0].billingAddress.city,
  "Miami",
);
assert.throws(
  () => parseImportRows("costCenters", [{ annualBudget: "1.000,00" }]),
  /decimal point/,
);
const book = new Workbook();
const sheet = book.addWorksheet("Dados");
sheet.addRow(importColumns("customers").map((c) => c.path));
sheet.addRow(["Cliente de teste"]);
const file = async () => new File([await book.xlsx.writeBuffer()], "clientes.xlsx");
const atLimit = await file();
Object.defineProperty(atLimit, "size", { value: 100 * 1024 * 1024 });
assert.equal((await readImportWorkbook(atLimit, "customers")).length, 1);
const overLimit = await file();
Object.defineProperty(overLimit, "size", { value: 100 * 1024 * 1024 + 1 });
await assert.rejects(() => readImportWorkbook(overLimit, "customers"), /100 MB/);
assert.equal(
  (await readImportWorkbook(await file(), "customers"))[0].displayName,
  "Cliente de teste",
);
await assert.rejects(() => readImportWorkbook(new File([""], "dados.csv"), "customers"), /xlsx/);
await assert.rejects(async () => readImportWorkbook(await file(), "vendors"), /Headers/);
sheet.getCell("A2").value = { formula: '"Cliente"', result: "Cliente" };
await assert.rejects(async () => readImportWorkbook(await file(), "customers"), /formulas/);
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
