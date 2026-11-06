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
const { createAccountingEngine, createInitialCompanyData } =
  await import("../src/lib/accounting-engine.ts");
const { US_GAAP_COA } = await import("../src/lib/coa.ts");
const { companySchema } = await import("../src/lib/company-model.ts");
const { customerSchema } = await import("../src/lib/customer-model.ts");
const { vendorSchema } = await import("../src/lib/vendor-model.ts");
const { outstanding, settlement, normalizedFx } = await import("../src/lib/transaction-fx.ts");
const { commandArgs } = await import("../src/lib/accounting-model.ts");
const company = {
  ...companySchema.parse({ name: "FX tests", entity: "LLC", state: "TX" }),
  id: crypto.randomUUID(),
  baseCurrency: "USD",
  initials: "FX",
  costMethod: "FIFO",
  isPeriodClosed: false,
  activePeriod: "2026-01",
};
const user = {
  name: "Test",
  title: "Accountant",
  role: "accounting_staff",
  canCreateJournals: true,
  canClosePeriod: true,
  canManageUsers: false,
  allowedReportsOnly: false,
};
let state = createInitialCompanyData();
state.accounts = structuredClone(US_GAAP_COA);
state.fiscalPeriods = [
  {
    id: "jan",
    periodCode: "2026-01",
    fiscalYear: 2026,
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    status: "Open",
  },
  {
    id: "feb",
    periodCode: "2026-02",
    fiscalYear: 2026,
    startDate: "2026-02-01",
    endDate: "2026-02-28",
    status: "Open",
  },
];
const vendorId = crypto.randomUUID(),
  customerId = crypto.randomUUID(),
  bankId = crypto.randomUUID();
state.vendors = [
  {
    ...vendorSchema.parse({
      displayName: "One global vendor",
      companyName: "Vendor Ltd",
      bankAccounts: [
        {
          id: bankId,
          label: "GBP HSBC",
          currency: "GBP",
          bankName: "HSBC",
          accountNumber: "0000012345",
          routingNumber: "",
          swiftBic: "HSBCGB2L",
          paymentType: "Wire",
        },
      ],
    }),
    id: vendorId,
  },
];
state.customers = [
  {
    ...customerSchema.parse({
      displayName: "One global customer",
      companyName: "Customer Ltd",
      email: "billing@example.com",
      billingAddress: { street: "123 Main", city: "Tomball", country: "US" },
    }),
    id: customerId,
  },
];
function run(command, ...args) {
  const engine = createAccountingEngine(state, company, user);
  while (args.length < commandArgs[command].items.length) args.push(undefined);
  const parsed = commandArgs[command].parse(args);
  const result = engine.value[command](...parsed);
  assert.notEqual(result?.success, false, result?.error);
  state = engine.getState();
  return result;
}
function bill(currency = "GBP", rate = 1.2, amount = 100) {
  return run("createBill", {
    vendorId,
    vendorName: "One global vendor",
    billNumber: crypto.randomUUID(),
    date: "2026-01-02",
    dueDate: "2026-01-20",
    currency,
    fxRate: rate,
    foreignAmount: amount,
    items: [
      {
        id: crypto.randomUUID(),
        description: "Services",
        accountCode: "60100",
        isInventory: false,
        amount: Math.round(amount * rate * 100) / 100,
      },
    ],
  }).billId;
}
function invoice(currency = "GBP", rate = 1.2, amount = 100) {
  return run("createInvoice", {
    customerId,
    customerName: "One global customer",
    date: "2026-01-02",
    dueDate: "2026-01-20",
    kind: "Service",
    items: [
      {
        id: crypto.randomUUID(),
        description: "Services",
        isProduct: false,
        qty: 1,
        unitPrice: amount,
        taxable: false,
      },
    ],
    subtotal: amount,
    taxRate: 0,
    taxAmount: 0,
    total: amount,
    taxExempt: true,
    transactionCurrency: currency,
    exchangeRateValue: rate,
  }).invoiceId;
}
const ap = bill(),
  ar = invoice();
bill("USD", 1, 50);
invoice("USD", 1, 50);
assert.equal(state.vendors.length, 1);
assert.equal(state.customers.length, 1);
assert.equal(normalizedFx(state.invoices.find((i) => i.id === ar)).functionalAmount, 120);
assert.equal(
  state.journals.find((j) => j.sourceId === ar).lines.find((l) => l.accountCode === "11000").debit,
  120,
);
run("payBill", ap, "2026-01-10", 1.1, 40, bankId);
let apDoc = state.bills.find((b) => b.id === ap);
assert.equal(apDoc.status, "Partially Paid");
assert.deepEqual(outstanding(apDoc), { native: 60, functional: 72 });
assert.equal(apDoc.payments[0].realizedGain, 4);
assert.equal(apDoc.payments[0].bankAccountId, bankId);
run("recordInvoicePayment", ar, "2026-01-10", 1.3, 40);
let arDoc = state.invoices.find((i) => i.id === ar);
assert.equal(arDoc.payments[0].realizedGain, 4);
assert.deepEqual(outstanding(arDoc), { native: 60, functional: 72 });
run("payBill", ap, "2026-01-15", 1.3, 60, bankId);
run("recordInvoicePayment", ar, "2026-01-15", 1.1, 60);
apDoc = state.bills.find((b) => b.id === ap);
arDoc = state.invoices.find((i) => i.id === ar);
assert.equal(apDoc.status, "Paid");
assert.equal(arDoc.status, "Paid");
assert.equal(apDoc.payments[1].realizedGain, -6);
assert.equal(arDoc.payments[1].realizedGain, -6);
assert.deepEqual(outstanding(apDoc, "2026-01-12"), { native: 60, functional: 72 });
assert.throws(() => settlement(apDoc, "AP", 1, 1.2, "2026-01-16"), /exceeds/);
const closingAp = bill(),
  closingAr = invoice();
run("revalueOpenItems", "2026-01-31", {
  GBP: { rate: 1.3, date: "2026-01-30", source: "Test closing quote" },
});
const closes = state.journals.filter((j) => j.sourceType === "FXRevaluation");
const reversals = state.journals.filter((j) => j.sourceType === "FXReversal");
assert.equal(closes.length, 2);
assert.equal(reversals.length, 2);
assert(reversals.every((j) => j.date === "2026-02-01"));
const apClose = closes.find((j) => j.sourceId.startsWith("AP:" + closingAp + ":"));
const arClose = closes.find((j) => j.sourceId.startsWith("AR:" + closingAr + ":"));
assert.equal(apClose.lines.find((l) => l.accountCode === "80300").debit, 10);
assert.equal(arClose.lines.find((l) => l.accountCode === "80300").credit, 10);
const count = state.journals.length;
run("revalueOpenItems", "2026-01-31", {
  GBP: { rate: 1.3, date: "2026-01-30", source: "Test closing quote" },
});
assert.equal(state.journals.length, count);
run("payBill", closingAp, "2026-02-02", 1.1, 100, bankId);
run("recordInvoicePayment", closingAr, "2026-02-02", 1.3, 100);
assert.equal(state.bills.find((b) => b.id === closingAp).payments[0].realizedGain, 10);
assert.equal(state.invoices.find((i) => i.id === closingAr).payments[0].realizedGain, 10);
assert.equal(new Set(state.journals.map((j) => j.id)).size, state.journals.length);
for (const journal of state.journals)
  assert(Math.abs(journal.lines.reduce((s, l) => s + l.debit - l.credit, 0)) < 0.005);
assert.equal(
  typeof createAccountingEngine(createInitialCompanyData(), company, user).value.revalueOpenItems,
  "function",
);
assert(
  !customerSchema.safeParse({ displayName: "No billing info", companyName: "Customer" }).success,
);
assert(!("currency" in vendorSchema.parse({ displayName: "Vendor", companyName: "Vendor" })));
const draft = customerSchema.parse({ displayName: "Incomplete", registrationStatus: "Draft" });
state.customers.push({ ...draft, id: "draft-customer" });
const attempted = createAccountingEngine(state, company, user).value.createInvoice({
  customerId: "draft-customer",
  customerName: "Incomplete",
  date: "2026-02-02",
  dueDate: "2026-02-02",
  kind: "Service",
  items: [],
  subtotal: 1,
  taxRate: 0,
  taxAmount: 0,
  total: 1,
  taxExempt: true,
});
assert.equal(attempted.success, false);
assert.match(attempted.error, /draft/i);
export { state };

// Parameter integration regressions: soft-close and jurisdiction GL mapping.
const parameterState = structuredClone(state);
parameterState.fiscalPeriods[0].status = "Soft-Close";
let parameterEngine = createAccountingEngine(parameterState, company, {
  ...user,
  canClosePeriod: false,
});
const sourceInvoice = structuredClone(state.invoices[0]);
const denied = parameterEngine.value.createInvoice({ ...sourceInvoice, date: "2026-01-05" });
assert.equal(denied.success, false);
assert.match(denied.error, /soft-closed/);
assert.equal(parameterEngine.getState().invoices.length, parameterState.invoices.length);
parameterState.fiscalPeriods[0].status = "Open";
parameterState.accounts.push({
  code: "22999",
  name: "Configured sales tax",
  type: "Liability",
  balanceType: "Credit",
});
parameterState.taxJurisdictions = [
  {
    id: "configured-tax",
    code: "TX-CUSTOM",
    name: "Configured tax",
    rate: 5,
    status: "Active",
    glAccountCode: "22999",
    state: "TX",
    taxType: "Combined",
    filingFrequency: "Monthly",
  },
];
parameterState.customers.find((c) => c.id === customerId).defaultTaxCode = "TX-CUSTOM";
parameterEngine = createAccountingEngine(parameterState, company, user);
const configured = parameterEngine.value.createInvoice({
  ...sourceInvoice,
  date: "2026-01-05",
  transactionCurrency: "USD",
  exchangeRateValue: 1,
  transactionAmount: 105,
  functionalAmount: 105,
  subtotal: 100,
  taxRate: 5,
  taxAmount: 5,
  total: 105,
  taxExempt: false,
  items: [
    {
      id: "tax-line",
      description: "Taxable service",
      qty: 1,
      unitPrice: 100,
      taxable: true,
      isProduct: false,
    },
  ],
});
assert.equal(configured.success, true, configured.error);
assert.ok(
  parameterEngine
    .getState()
    .journals.some(
      (j) =>
        j.sourceId === configured.invoiceId &&
        j.lines.some((l) => l.accountCode === "22999" && l.credit === 5),
    ),
);
console.log("PASS: operational soft-close and configured jurisdiction GL account.");
console.log(
  "PASS: single contact across currencies, required customer fields, foreign invoice posting, AP/AR partial settlement and both FX signs, bank ownership, historical aging, month-end revaluation, next-day reversal, idempotence, balanced unique journals and empty-engine regression.",
);

const mappedState = structuredClone(parameterState);
mappedState.accounts.push({
  code: "11999",
  name: "Configured AR",
  type: "Asset",
  balanceType: "Debit",
  description: "",
});
mappedState.postingAccounts = [
  { id: "ar-map", code: "ar", name: "AR", glAccountCode: "11999", status: "Active" },
];
mappedState.costCenters = [
  {
    id: "ops",
    code: "OPS",
    name: "Operations",
    status: "Active",
    manager: "Test",
    annualBudget: 1000,
    description: "",
  },
];
const mappedEngine = createAccountingEngine(mappedState, company, user);
const mappedInvoice = mappedEngine.value.createInvoice({
  ...sourceInvoice,
  date: "2026-01-05",
  costCenterId: "ops",
});
assert.equal(mappedInvoice.success, true, mappedInvoice.error);
const mappedJournal = mappedEngine
  .getState()
  .journals.find((j) => j.sourceId === mappedInvoice.invoiceId);
assert.ok(mappedJournal.lines.some((l) => l.accountCode === "11999"));
assert.ok(mappedJournal.lines.every((l) => l.costCenterId === "ops"));
assert.equal(
  mappedState.journals.some((j) => j.lines.some((l) => l.accountCode === "11999")),
  false,
);
console.log(
  "PASS: automatic account mapping and cost-center propagation without rewriting history.",
);

const discountState = structuredClone(mappedState);
discountState.paymentTerms = [
  {
    id: "early",
    code: "2-10",
    name: "2/10 Net 30",
    days: 30,
    earlyDiscountPercentage: 2,
    discountDays: 10,
    isDefaultCustomer: true,
    isDefaultVendor: true,
    status: "Active",
  },
];
let de = createAccountingEngine(discountState, company, user);
const di = de.value.createInvoice({
  ...sourceInvoice,
  date: "2026-01-02",
  transactionCurrency: "USD",
  exchangeRateValue: 1,
  transactionAmount: 100,
  functionalAmount: 100,
  subtotal: 100,
  total: 100,
  taxAmount: 0,
  taxRate: 0,
  taxExempt: true,
  items: [
    { id: "svc", description: "Service", isProduct: false, qty: 1, unitPrice: 100, taxable: false },
  ],
});
assert.equal(di.success, true, di.error);
let ds = de.getState();
ds.paymentTerms[0].earlyDiscountPercentage = 10;
de = createAccountingEngine(ds, company, user);
const dp = de.value.recordInvoicePayment(di.invoiceId, "2026-01-05", 1, 100);
assert.equal(dp.success, true, dp.error);
const paidDoc = de.getState().invoices.find((i) => i.id === di.invoiceId);
assert.equal(paidDoc.payments[0].discountAmount, 2);
assert.equal(paidDoc.payments[0].cashFunctionalAmount, 98);
assert.equal(outstanding(paidDoc).native, 0);
assert.equal(paidDoc.status, "Paid");
const pj = de.getState().journals.find((j) => j.id === paidDoc.payments[0].journalId);
assert.equal(
  pj.lines.reduce((t, l) => t + l.debit - l.credit, 0),
  0,
);
console.log("PASS: snapshotted early discount, net cash, full AR clearance and balanced posting.");

// Operational CRUD preserves stock valuation and linked history.
const crudState = structuredClone(mappedState);
crudState.inventory = [
  {
    id: "unused",
    sku: "UNUSED",
    name: "Unused",
    type: "Product",
    qtyOnHand: 0,
    unitCost: 10,
    unitPrice: 20,
    valuationMethod: "FIFO",
    costLots: [],
  },
];
let ce = createAccountingEngine(crudState, company, user);
ce.value.updateInventoryItem("unused", { name: "Renamed", unitPrice: 25 });
assert.equal(ce.getState().inventory[0].unitPrice, 25);
assert.equal(ce.getState().inventory[0].unitCost, 10);
ce = createAccountingEngine(ce.getState(), company, user);
ce.value.deleteInventoryItem("unused");
assert.equal(ce.getState().inventory.length, 0);
crudState.inventory[0].qtyOnHand = 1;
assert.throws(
  () => createAccountingEngine(crudState, company, user).value.deleteInventoryItem("unused"),
  /stock|history/,
);
const project = {
  id: "project-crud",
  code: "CRUD",
  name: "Project",
  clientName: "Customer",
  budget: 100,
  contractValue: 200,
  status: "Active",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  notes: "",
};
crudState.projects = [project];
ce = createAccountingEngine(crudState, company, user);
ce.value.updateProject(project.id, { ...project, budget: 150 });
assert.equal(ce.getState().projects[0].budget, 150);
ce = createAccountingEngine(ce.getState(), company, user);
ce.value.deleteProject(project.id);
assert.equal(ce.getState().projects.length, 0);
crudState.invoices[0].projectId = project.id;
assert.throws(
  () => createAccountingEngine(crudState, company, user).value.deleteProject(project.id),
  /history/,
);
console.log("PASS: operational CRUD, stock valuation preservation and linked-history protection.");

{
  const { earlyPaymentDiscount } = await import("../src/lib/transaction-fx.ts");
  assert.equal(
    earlyPaymentDiscount(
      { date: "2026-01-01", earlyDiscountPercentage: 2, discountDays: 10 },
      "2026-01-12",
      100,
    ),
    0,
  );
  assert.equal(
    earlyPaymentDiscount(
      { date: "2026-01-01", earlyDiscountPercentage: 2, discountDays: 10 },
      "2026-01-11",
      50,
    ),
    1,
  );
  let ae = createAccountingEngine(discountState, company, user);
  const ab = ae.value.createBill({
    vendorId,
    vendorName: "Vendor",
    billNumber: "DISCOUNT",
    date: "2026-01-02",
    dueDate: "2026-01-31",
    currency: "USD",
    fxRate: 1,
    foreignAmount: 100,
    items: [
      {
        id: "expense",
        description: "Expense",
        accountCode: "60100",
        isInventory: false,
        amount: 100,
      },
    ],
  });
  assert.equal(ab.success, true, ab.error);
  ae = createAccountingEngine(ae.getState(), company, user);
  const discountedAp = ae.value.payBill(ab.billId, "2026-01-05", 1, 100);
  assert.equal(discountedAp.success, true, discountedAp.error);
  const apDoc = ae.getState().bills.find((b) => b.id === ab.billId);
  assert.equal(apDoc.payments[0].cashFunctionalAmount, 98);
  assert.equal(outstanding(apDoc).native, 0);
  const apJournal = ae.getState().journals.find((j) => j.id === apDoc.payments[0].journalId);
  assert.equal(
    apJournal.lines.reduce((t, l) => t + l.debit - l.credit, 0),
    0,
  );
  console.log(
    "PASS: AP early discount, deadline boundaries, proportional partial discount and balanced settlement.",
  );
}

// Reconfiguring AR does not move existing open invoices to a different control account.
{
  const repriced = structuredClone(mappedEngine.getState());
  repriced.postingAccounts[0].glAccountCode = "10200";
  const re = createAccountingEngine(repriced, company, user);
  const result = re.value.revalueOpenItems("2026-01-31", {
    GBP: { rate: 1.5, date: "2026-01-31", source: "Test closing" },
  });
  assert.equal(result.success, true, result.error);
  const adjustment = re
    .getState()
    .journals.find(
      (j) =>
        j.sourceType === "FXRevaluation" &&
        j.sourceId === "AR:" + mappedInvoice.invoiceId + ":2026-01-31",
    );
  assert.ok(adjustment, "Mapped invoice must receive a closing revaluation");
  assert.ok(adjustment.lines.some((l) => l.accountCode === "11999"));
  assert.ok(adjustment.lines.every((l) => l.accountCode !== "10200"));
  assert.ok(adjustment.lines.every((l) => l.costCenterId === "ops"));
  console.log("PASS: closing revaluation preserves historical control account and cost center.");
}
{
  const { salesTaxSummary } = await import("../src/lib/sales-tax-summary.ts");
  const doc = {
    ...sourceInvoice,
    date: "2026-01-05",
    transactionCurrency: "GBP",
    exchangeRateValue: 1.5,
    transactionAmount: 107.5,
    functionalAmount: 161.25,
    subtotal: 100,
    total: 107.5,
    taxAmount: 7.5,
    taxExempt: false,
    items: [
      { id: "tax", qty: 1, unitPrice: 75, taxable: true },
      { id: "exempt", qty: 1, unitPrice: 25, taxable: false },
    ],
  };
  const summary = salesTaxSummary(
    [doc, { ...doc, date: "2025-12-01" }, { ...doc, date: "2026-01-20" }],
    "2026-01-10",
  );
  assert.deepEqual(summary, { taxableSales: 112.5, exemptSales: 37.5, collected: 11.25 });
  console.log(
    "PASS: month-to-date sales tax converts foreign amounts and separates taxable/exempt lines.",
  );
}

{
  const { reportRows } = await import("../src/lib/financial-report.ts");
  const reporting = mappedEngine.getState();
  const report = reportRows(reporting.accounts, reporting.journals, undefined, undefined, {
    costCenterId: "ops",
  });
  const original = reporting.invoices.find((i) => i.id === mappedInvoice.invoiceId);
  assert.equal(
    report.find((a) => a.code === "11999").amount,
    normalizedFx(original).functionalAmount,
  );
  const unassigned = reportRows(reporting.accounts, reporting.journals, undefined, undefined, {
    costCenterId: "__unassigned",
  });
  assert.equal(unassigned.find((a) => a.code === "11999").amount, 0);
  const empty = reportRows(reporting.accounts, reporting.journals, undefined, undefined, {
    costCenterId: "ops",
    from: "2099-01-01",
  });
  assert.ok(empty.every((a) => a.amount === 0));
  console.log(
    "PASS: financial reports intersect cost centers and dates, preserving unassigned history.",
  );
}
