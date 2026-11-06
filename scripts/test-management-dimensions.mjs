import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.includes("/src/")) {
      const url = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(url)) return next(url.href, context);
    }
    return next(specifier, context);
  },
});
const { createAccountingEngine, createInitialCompanyData } =
  await import("../src/lib/accounting-engine.ts");
const { US_GAAP_COA } = await import("../src/lib/coa.ts");
const { effectiveDimensions, validateDimensionValues, validateDimensionDefinitions } =
  await import("../src/lib/dimensions.ts");
const { invoice: invoiceSchema } = await import("../src/lib/accounting-model.ts");
const { reportRows } = await import("../src/lib/financial-report.ts");
const { isModuleAvailable } = await import("../src/lib/module-availability.ts");
for (const path of ["/dimensions", "/invoices", "/payables", "/dre"])
  assert.equal(
    isModuleAvailable(path),
    true,
    `${path} must be reachable through the workspace guard`,
  );
const dimension = {
  id: "category",
  code: "PRODUCT",
  name: "Product category",
  status: "Active",
  required: true,
  applyInvoices: true,
  applyBills: true,
  options: [
    { id: "elements", code: "ELEMENTS", name: "Filter Elements", status: "Active" },
    { id: "parts", code: "PARTS", name: "Replacement Parts", status: "Active" },
  ],
};
const logistics = {
  id: "logistics",
  code: "LOGISTICS",
  name: "Transport mode",
  status: "Active",
  required: false,
  applyInvoices: true,
  applyBills: true,
  options: [
    { id: "air", code: "AIR", name: "Air Freight", status: "Active" },
    { id: "ocean", code: "OCEAN", name: "Ocean Freight", status: "Active" },
  ],
};
const values = [
  { dimensionId: "category", valueId: "elements" },
  { dimensionId: "category", valueId: "parts", lineId: "line-2" },
  { dimensionId: "logistics", valueId: "air" },
];
assert.equal(
  effectiveDimensions(values, "line-1").find((v) => v.dimensionId === "category").valueId,
  "elements",
);
assert.equal(
  effectiveDimensions(values, "line-2").find((v) => v.dimensionId === "category").valueId,
  "parts",
);
assert.throws(
  () => validateDimensionValues([dimension], [{ dimensionId: "foreign", valueId: "elements" }]),
  /company/,
);
assert.throws(
  () =>
    validateDimensionValues(
      [dimension],
      [{ dimensionId: "category", valueId: "elements", lineId: "missing" }],
      ["line-1"],
    ),
  /unknown/,
);
assert.throws(() => validateDimensionValues([dimension], [values[0], values[0]]), /one option/);
assert.throws(
  () => validateDimensionDefinitions([dimension, { ...dimension, id: "other" }]),
  /unique/,
);
const initial = createInitialCompanyData();
initial.accounts = structuredClone(US_GAAP_COA);
initial.dimensions = [dimension, logistics];
initial.fiscalPeriods = [
  {
    id: "period",
    periodCode: "2026-11",
    fiscalYear: "2026",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    status: "Open",
  },
];
initial.inventory = [
  {
    id: "product",
    sku: "FILTER",
    name: "Filter",
    type: "Product",
    qtyOnHand: 10,
    unitCost: 20,
    unitPrice: 100,
    valuationMethod: "FIFO",
    costLots: [
      { id: "lot1", qty: 1, unitCost: 10, date: "2026-11-01" },
      { id: "lot2", qty: 9, unitCost: 20, date: "2026-11-02" },
    ],
  },
];
const company = {
  name: "Test",
  costMethod: "FIFO",
  isPeriodClosed: false,
  activePeriod: "2026-11",
};
const persona = { canCreateJournals: true, canClosePeriod: true, name: "Tester" };
const makeEngine = (state) => createAccountingEngine(state, company, persona);
initial.vendors = [{ id: "carrier", displayName: "Carrier" }];
initial.customers = [{ id: "customer", displayName: "Customer", registrationStatus: "Active" }];
const invoice = {
  customerId: "customer",
  customerName: "Customer",
  date: "2026-11-06",
  dueDate: "2026-11-30",
  kind: "Product",
  items: [
    {
      id: "line-1",
      description: "Filter first line",
      sku: "FILTER",
      isProduct: true,
      qty: 1,
      unitPrice: 100,
      taxable: false,
    },
    {
      id: "line-2",
      description: "Filter second line",
      sku: "FILTER",
      isProduct: true,
      qty: 2,
      unitPrice: 100,
      taxable: false,
    },
  ],
  subtotal: 300,
  taxRate: 0,
  taxAmount: 0,
  total: 300,
  taxExempt: true,
  dimensionValues: values,
};
assert.deepEqual(
  invoiceSchema.omit({ id: true, status: true }).parse(invoice).dimensionValues,
  values,
);
let engine = makeEngine(initial);
assert.throws(
  () => engine.value.createInvoice({ ...invoice, dimensionValues: [] }),
  /Select Product category/,
);
assert.equal(engine.getState().invoices.length, 0);
assert.equal(engine.value.createInvoice(invoice).success, true);
let state = engine.getState();
const posted = state.journals[0];
assert.equal(
  posted.lines.reduce((s, l) => s + l.debit - l.credit, 0),
  0,
);
const balanceSheetLines = posted.lines.filter((l) => ["11000", "13000"].includes(l.accountCode));
assert.ok(balanceSheetLines.every((l) => !posted.dimensionValues.some((v) => v.lineId === l.id)));
const report = (filters) =>
  reportRows(state.accounts, state.journals, undefined, undefined, { dimensions: filters });
const amount = (filters, code) => report(filters).find((a) => a.code === code).amount;
assert.equal(amount({ category: "elements" }, "40100"), 100);
assert.equal(amount({ category: "parts" }, "40100"), 200);
assert.equal(amount({ category: "elements", logistics: "ocean" }, "40100"), 0);
assert.equal(amount({ category: "elements", logistics: "air" }, "40100"), 100);
assert.equal(amount({ category: "elements" }, "50100"), 10);
assert.equal(amount({ category: "parts" }, "50100"), 40);
assert.equal(amount({}, "50100"), 50);
assert.equal(
  reportRows(state.accounts, state.journals, undefined, undefined, { from: "2026-11-07" }).find(
    (a) => a.code === "40100",
  ).amount,
  0,
);
// Required dimensions added today do not invalidate unclassified historical entries.
state.journals.push({
  id: "historical",
  date: "2026-11-01",
  sourceType: "Manual",
  lines: [
    { id: "old-r", accountCode: "40100", debit: 0, credit: 25 },
    { id: "old-c", accountCode: "10200", debit: 25, credit: 0 },
  ],
});
assert.equal(amount({ category: "__unclassified" }, "40100"), 25);
assert.equal(
  amount({}, "40100"),
  amount({ category: "elements" }, "40100") +
    amount({ category: "parts" }, "40100") +
    amount({ category: "__unclassified" }, "40100"),
);
// A single bill can use document defaults and a different value per expense line.
engine = makeEngine(state);
const bill = {
  vendorId: "carrier",
  vendorName: "Carrier",
  billNumber: "FREIGHT",
  date: "2026-11-06",
  dueDate: "2026-11-30",
  currency: "USD",
  fxRate: 1,
  foreignAmount: 75,
  items: [
    {
      id: "line-1",
      description: "Air freight",
      accountCode: "50400",
      isInventory: false,
      amount: 50,
    },
    {
      id: "line-2",
      description: "Parts air freight",
      accountCode: "50400",
      isInventory: false,
      amount: 25,
    },
  ],
  dimensionValues: values,
};
assert.equal(engine.value.createBill(bill).success, true);
state = engine.getState();
assert.equal(amount({ category: "elements", logistics: "air" }, "50400"), 50);
assert.equal(amount({ category: "parts", logistics: "air" }, "50400"), 25);
// Balance-sheet-only bills never require an operational classification.
assert.equal(
  makeEngine(state).value.createBill({
    ...bill,
    dimensionValues: [],
    foreignAmount: 10,
    items: [{ ...bill.items[0], accountCode: "15300", amount: 10 }],
  }).success,
  true,
);
// Archive preserves reporting and stored references, and prevents new selections.
engine = makeEngine(state);
const archived = {
  ...dimension,
  options: dimension.options.map((o) => ({ ...o, status: "Inactive" })),
};
engine.value.saveDimension(archived);
const archivedState = engine.getState();
validateDimensionValues(archivedState.dimensions, state.invoices[0].dimensionValues, [
  "line-1",
  "line-2",
]);
assert.throws(() => makeEngine(archivedState).value.createInvoice(invoice), /active option/);
assert.throws(
  () => makeEngine(state).value.saveDimension({ ...dimension, options: [dimension.options[0]] }),
  /company/,
);
assert.throws(
  () =>
    createAccountingEngine(initial, company, { canCreateJournals: false }).value.saveDimension(
      dimension,
    ),
  /Unauthorized/,
);
console.log(
  "PASS: configurable dimensions, tenant references, required fields, header/item overrides, FIFO COGS allocation, P&L intersections and unclassified history, archive protection, balance-sheet preservation.",
);
