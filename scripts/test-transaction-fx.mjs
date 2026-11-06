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
const draft=customerSchema.parse({displayName:"Incomplete",registrationStatus:"Draft"});
state.customers.push({...draft,id:"draft-customer"});
const attempted=createAccountingEngine(state,company,user).value.createInvoice({customerId:"draft-customer",customerName:"Incomplete",date:"2026-02-02",dueDate:"2026-02-02",kind:"Service",items:[],subtotal:1,taxRate:0,taxAmount:0,total:1,taxExempt:true});
assert.equal(attempted.success,false);
assert.match(attempted.error,/draft/i);
export {state};
console.log(
  "PASS: single contact across currencies, required customer fields, foreign invoice posting, AP/AR partial settlement and both FX signs, bank ownership, historical aging, month-end revaluation, next-day reversal, idempotence, balanced unique journals and empty-engine regression.",
);
