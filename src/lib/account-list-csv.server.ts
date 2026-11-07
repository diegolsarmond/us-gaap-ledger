import { createHash } from "node:crypto";
import { account } from "./accounting-model";
import type { Account, AccountType } from "./accounting-engine";
import { postingRoles } from "./posting-accounts";
import { templateCashCodes } from "./coa";
import { readCsvRows } from "./statement-csv";

const header = "account #,account name,type,detail type,description,total balance,currency";
const classes = new Map<string, [AccountType, Account["maturity"]]>([
  ["Bank", ["Asset", "Current"]],
  ["Accounts receivable (A/R)", ["Asset", "Current"]],
  ["Other Current Assets", ["Asset", "Current"]],
  ["Fixed Assets", ["Asset", "Noncurrent"]],
  ["Other Assets", ["Asset", "Noncurrent"]],
  ["Accounts payable (A/P)", ["Liability", "Current"]],
  ["Credit Card", ["Liability", "Current"]],
  ["Other Current Liabilities", ["Liability", "Current"]],
  ["Long Term Liabilities", ["Liability", "Noncurrent"]],
  ["Equity", ["Equity", "Not Applicable"]],
  ["Income", ["Revenue", "Not Applicable"]],
  ["Cost of Goods Sold", ["COGS", "Not Applicable"]],
  ["Expenses", ["Operating Expense", "Not Applicable"]],
  ["Other Income", ["Other Income", "Not Applicable"]],
  ["Other Expense", ["Other Expense", "Not Applicable"]],
]);
const reservedCodes = new Set<string>([
  ...Object.values(postingRoles).flatMap(({ preferred, legacy }) => [preferred, legacy]),
  ...templateCashCodes,
]);
const contraDetails =
  /^(accumulated depreciation|accumulated amortization|allowance for bad debts|discounts\/refunds given|treasury stock)$/i;
const key = (value: string) => value.normalize("NFC").toLowerCase();

export function parseAccountListCsv(content: string): Account[] {
  if (!content || new TextEncoder().encode(content).length > 2_000_000)
    throw new Error("Select an Account List CSV of up to 2 MB.");
  const rows = readCsvRows(content.replace(/^\uFEFF/, ""), ",").map((row) =>
    row.map((value) => value.trim()),
  );
  const headerIndex = rows.findIndex(
    (row) => row.length === 7 && row.map(key).join(",") === header,
  );
  if (headerIndex < 0)
    throw new Error("Use the QuickBooks Account List CSV with all seven columns.");

  const accounts = new Map<string, Account>();
  const numbers = new Set<string>();
  const codes = new Set<string>();
  let footer = false;
  for (const [index, row] of rows.slice(headerIndex + 1).entries()) {
    if (row.every((value) => !value)) continue;
    const [
      number = "",
      path = "",
      sourceType = "",
      detailType = "",
      description = "",
      balance = "",
      currency = "",
    ] = row;
    if (
      row.length === 7 &&
      number === "TOTAL" &&
      !path &&
      !sourceType &&
      !detailType &&
      !description &&
      !currency
    ) {
      footer = true;
      continue;
    }
    if (
      row.length === 7 &&
      row.slice(1).every((value) => !value) &&
      /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+.+\bGMT[+-]\d{2}:\d{2}$/i.test(
        number,
      )
    ) {
      footer = true;
      continue;
    }
    const label = `Account record ${index + 1}`;
    if (balance && !/^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,4})?$/.test(balance))
      throw new Error(`${label}: invalid reported balance.`);
    const classification = classes.get(sourceType);
    const parts = path.split(":");
    if (footer || row.length !== 7 || !classification || parts.some((part) => !part.trim()))
      throw new Error(`${label}: invalid account path, type or column count.`);
    if (accounts.has(key(path))) throw new Error(`${label}: duplicate account path ${path}.`);
    if (number && numbers.has(key(number)))
      throw new Error(`${label}: duplicate source account number ${number}.`);
    if (number) numbers.add(key(number));
    const code = number
      ? reservedCodes.has(number)
        ? `QBO-${number}`
        : number
      : `QBO-U-${createHash("sha256").update(key(path)).digest("hex").slice(0, 16)}`;
    if (codes.has(key(code))) throw new Error(`${label}: duplicate internal code ${code}.`);
    codes.add(key(code));

    const [type, maturity] = classification;
    const name = parts.at(-1)!.trim();
    const isContra =
      contraDetails.test(detailType) ||
      (type === "Equity" && /distributions?|owner'?s? draw/i.test(name));
    const debit = ["Asset", "COGS", "Operating Expense", "Other Expense"].includes(type);
    const parsed = account.safeParse({
      code,
      name,
      type,
      balanceType: debit !== isContra ? "Debit" : "Credit",
      description,
      subgroup: sourceType,
      detailType,
      maturity,
      isContra,
      sourceAccount: {
        number,
        path,
        type: sourceType,
        currency,
        balance: balance ? Number(balance.replaceAll(",", "")) : undefined,
      },
    });
    if (!parsed.success)
      throw new Error(
        `${label}: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")} is invalid.`,
      );
    accounts.set(key(path), parsed.data);
  }
  if (!accounts.size || accounts.size > 1000)
    throw new Error("The CSV must contain between 1 and 1,000 accounts.");

  const sorted = [...accounts.values()].sort(
    (a, b) => a.sourceAccount!.path.split(":").length - b.sourceAccount!.path.split(":").length,
  );
  for (const child of sorted) {
    const path = child.sourceAccount!.path;
    const separator = path.lastIndexOf(":");
    if (separator < 0) continue;
    const parent = accounts.get(key(path.slice(0, separator)));
    if (!parent || parent.type !== child.type)
      throw new Error(
        `The parent of ${path} must be present in the CSV and have the same classification.`,
      );
    child.parentCode = parent.code;
  }
  return sorted;
}
