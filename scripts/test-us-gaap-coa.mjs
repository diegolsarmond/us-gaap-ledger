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
const { US_GAAP_COA, validateCoa, totalByType, resolveAccount } = await import("../src/lib/coa.ts");
const { reportRows } = await import("../src/lib/financial-report.ts");
const { createAccountingEngine, createInitialCompanyData } =
  await import("../src/lib/accounting-engine.ts");
assert.equal(US_GAAP_COA.length, 81);
assert.equal(new Set(US_GAAP_COA.map((a) => a.code)).size, 81);
validateCoa(US_GAAP_COA);
const find = (code) => US_GAAP_COA.find((a) => a.code === code);
for (const code of ["12000", "15200", "15400", "15600", "15800"])
  assert.equal(find(code).balanceType, "Credit");
assert.equal(find("30200").balanceType, "Debit");
assert.equal(find("48000").balanceType, "Debit");
assert.equal(find("60200").type, "Operating Expense");
assert.equal(find("50300").track1099, true);
assert.throws(() => validateCoa([{ ...find("10200"), parentCode: "missing" }]), /Parent/);
assert.throws(
  () =>
    validateCoa([
      { ...find("10200"), parentCode: "10300" },
      { ...find("10300"), parentCode: "10200" },
    ]),
  /cycles/,
);
assert.throws(() => validateCoa([{ ...find("15200"), balanceType: "Debit" }]), /Normal balance/);
assert.throws(() => validateCoa([{ ...find("60200"), maturity: "Current" }]), /classification/);
const journals = [
  {
    date: "2026-10-01",
    lines: [
      { accountCode: "10200", debit: 1000, credit: 0, projectId: "p1" },
      { accountCode: "40100", debit: 0, credit: 1000, projectId: "p1" },
      { accountCode: "48000", debit: 100, credit: 0, projectId: "p1" },
      { accountCode: "10200", debit: 0, credit: 100, projectId: "p1" },
      { accountCode: "30200", debit: 50, credit: 0 },
      { accountCode: "10200", debit: 0, credit: 50 },
      { accountCode: "15300", debit: 200, credit: 0 },
      { accountCode: "27200", debit: 0, credit: 200 },
      { accountCode: "69100", debit: 20, credit: 0 },
      { accountCode: "15400", debit: 0, credit: 20 },
      { accountCode: "90100", debit: 10, credit: 0 },
      { accountCode: "10200", debit: 0, credit: 10 },
    ],
  },
  {
    date: "2026-11-01",
    lines: [
      { accountCode: "10200", debit: 200, credit: 0 },
      { accountCode: "40200", debit: 0, credit: 200 },
    ],
  },
];
let rows = reportRows(US_GAAP_COA, journals, "2026-10-31");
const sum = (t) => rows.filter((a) => a.type === t).reduce((n, a) => n + a.amount, 0);
assert.equal(sum("Revenue"), 900);
assert.equal(sum("Asset"), 1020);
assert.equal(sum("Liability"), 200);
assert.equal(sum("Equity"), -50);
assert.equal(sum("Operating Expense"), 20);
assert.equal(sum("Other Expense"), 10);
assert.equal(
  sum("Asset"),
  sum("Liability") +
    sum("Equity") +
    sum("Revenue") -
    sum("Operating Expense") -
    sum("Other Expense"),
);
assert.equal(
  reportRows(US_GAAP_COA, journals, undefined, "p1").find((a) => a.code === "10200").amount,
  900,
);
assert.equal(resolveAccount(US_GAAP_COA, "10200", "1000"), "10200");
assert.equal(resolveAccount([{ code: "1000" }], "10200", "1000"), "1000");
const state = createInitialCompanyData();
state.accounts = structuredClone(US_GAAP_COA);
state.journals = journals;
const engine = createAccountingEngine(state, {}, { canCreateJournals: true });
assert.equal(engine.value.totalRevenue, 1100);
assert.equal(engine.value.netIncome, 1070);
assert.throws(() => engine.value.installUsGaapCoa(), /empty chart/);
assert.throws(
  () =>
    engine.value.updateAccount("10200", {
      ...find("10200"),
      balanceType: "Credit",
      isContra: true,
    }),
  /normal balance/,
);
console.log(
  "PASS: 81-account template, contra balances, hierarchy, classification, dated and project reports, complete P&L, legacy mapping and history protection.",
);
