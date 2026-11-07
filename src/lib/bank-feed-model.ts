import { z } from "zod";
import { amountUnits, unitsAmount } from "./journal-model";
import { currencyPrecision } from "./format";

const id = z.string().trim().min(1).max(200);
const date = z.string().date();
const currency = z.string().regex(/^[A-Z]{3}$/);
const decimal = z.string().regex(/^\d{1,12}(\.\d{1,4})?$/, "Enter a positive decimal amount.");
const signed = z.string().regex(/^-?\d{1,12}(\.\d{1,4})?$/);
const reason = z.string().trim().min(1).max(1000);
const optionalId = id.optional();
const rate = z.string().regex(/^\d{1,10}(\.\d{1,12})?$/);
const row = { rowId: id };
const fx = {
  date,
  rate: rate.optional(),
  rateSource: z.string().trim().min(1).max(300).optional(),
};
export const bankScope = z.object({ companyId: z.string().uuid() });
export const bankRowScope = bankScope.extend(row);
export const bankImport = bankScope.extend({
  account: id,
  currency,
  fileName: z.string().trim().min(1).max(300),
  content: z.string().min(1).max(2_000_000),
});
export const bankCategory = z.object({
  ...row,
  ...fx,
  operation: z.literal("categorize"),
  transactionType: z.enum(["Expense", "Deposit", "Transfer", "Card payment"]),
  memo: z.string().trim().max(2000),
  payeeId: optionalId,
  locationId: optionalId,
  confirmDuplicate: z.boolean().default(false),
  rememberMapping: z.boolean().default(false),
  lines: z
    .array(
      z.object({
        account: id,
        description: z.string().trim().max(2000),
        amount: decimal,
        customerId: optionalId,
        projectId: optionalId,
        costCenterId: optionalId,
        classId: optionalId,
        sku: optionalId,
        quantity: decimal.optional(),
        unitRate: decimal.optional(),
        billable: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(100),
});
export const bankSettlement = z.object({
  ...row,
  ...fx,
  operation: z.literal("settle"),
  confirmDuplicate: z.boolean().default(false),
  lines: z
    .array(z.object({ documentId: id, amount: decimal }))
    .min(1)
    .max(100),
});
export const bankAction = z.discriminatedUnion("operation", [
  bankCategory,
  bankSettlement,
  z.object({
    ...row,
    operation: z.literal("match"),
    keys: z.array(id).min(1).max(100),
    confirmDuplicate: z.boolean().default(false),
  }),
  z.object({ ...row, operation: z.literal("exclude"), reason }),
  z.object({ ...row, operation: z.literal("restore") }),
  z.object({
    ...row,
    operation: z.literal("undo"),
    reason: reason.optional(),
    date: date.optional(),
  }),
  z.object({ operation: z.literal("balance"), account: id, currency, date, amount: signed }),
  z.object({
    operation: z.literal("rule"),
    kind: z.enum(["mapping", "rule"]),
    pattern: z.string().trim().min(1).max(300),
    account: id,
  }),
  z.object({ operation: z.literal("removeRule"), id }),
  z.object({
    ...row,
    operation: z.literal("attach"),
    name: z.string().trim().min(1).max(255),
    content: z.string().min(1).max(14_000_000),
  }),
  z.object({ ...row, operation: z.literal("removeAttachment"), id }),
]);

export type BankCategory = z.infer<typeof bankCategory>;
export type BankSettlement = z.infer<typeof bankSettlement>;
export type BankAction = z.input<typeof bankAction>;

export const bankBatchLimit = 50;
const batchRows = {
  bankAccount: id,
  rowIds: z
    .array(id)
    .min(1)
    .max(bankBatchLimit)
    .refine((values) => new Set(values).size === values.length, "Select each transaction once."),
};
export const bankBatchAction = z.discriminatedUnion("operation", [
  z.object({
    ...batchRows,
    operation: z.literal("categorize"),
    account: id,
    costCenterId: optionalId,
    rate: fx.rate,
    rateSource: fx.rateSource,
    confirmDuplicate: z.boolean().default(false),
  }),
  z.object({ ...batchRows, operation: z.literal("exclude"), reason }),
  z.object({ ...batchRows, operation: z.literal("restore") }),
  z.object({
    ...batchRows,
    operation: z.literal("undo"),
    date: date.optional(),
    reason: reason.optional(),
  }),
]);
export type BankBatchAction = z.infer<typeof bankBatchAction>;

export function bankAmount(value: string, currencyCode: string) {
  const text = value.startsWith("-") ? value.slice(1) : value;
  const units = amountUnits(text);
  const precision = Math.min(currencyPrecision(currencyCode), 4);
  if (units % 10n ** BigInt(4 - precision))
    throw new Error(`Use ${precision} decimal places for ${currencyCode}.`);
  return value.startsWith("-") ? -units : units;
}

export function itemAmount(quantity: string, unitRate: string, currencyCode: string) {
  const scale = 10n ** BigInt(8 - Math.min(currencyPrecision(currencyCode), 4));
  const product = amountUnits(quantity) * amountUnits(unitRate);
  return unitsAmount(((product + scale / 2n) / scale) * (scale / 10000n));
}

export function bankRate(currencyCode: string, rate?: string, source?: string) {
  if (currencyCode === "USD") {
    if (rate && Number(rate) !== 1) throw new Error("USD requires parity 1.");
    return { value: "1", source: "Functional currency parity" };
  }
  if (!rate || !source || Number(rate) <= 0)
    throw new Error("Enter the effective exchange rate and its source.");
  return { value: rate, source };
}

export function bankSourceAccount(
  account: { code: string; name: string; type: string; detailType?: string | undefined },
  accounts: { parentCode?: string | undefined }[],
) {
  return (
    !accounts.some((a) => a.parentCode === account.code) &&
    ((account.type === "Asset" &&
      /bank|checking|savings|money market|^cash$/i.test(account.detailType || account.name)) ||
      (account.type === "Liability" && /credit card/i.test(account.detailType || account.name)))
  );
}
