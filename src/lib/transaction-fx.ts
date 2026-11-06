import { z } from "zod";
export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const fxFields = {
  transactionCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("USD"),
  transactionAmount: z.number().finite().nonnegative().optional(),
  functionalCurrency: z.literal("USD").default("USD"),
  exchangeRateValue: z.number().finite().positive().default(1),
  functionalAmount: z.number().finite().nonnegative().optional(),
  exchangeRateSource: z.string().trim().min(1).max(300).default("Manual"),
  exchangeRateDate: z.string().date().optional(),
};
export const paymentSchema = z.object({
  id: z.string(),
  date: z.string().date(),
  ...fxFields,
  transactionAmount: z.number().finite().positive(),
  functionalAmount: z.number().finite().nonnegative(),
  bookAmount: z.number().finite().nonnegative(),
  realizedGain: z.number().finite(),
  bankAccountId: z.string().optional(),
  journalId: z.string(),
});
export type Payment = z.infer<typeof paymentSchema>;
export interface TransactionFx {
  transactionCurrency?: string;
  transactionAmount?: number;
  functionalCurrency?: "USD";
  exchangeRateValue?: number;
  functionalAmount?: number;
  exchangeRateSource?: string;
  exchangeRateDate?: string;
  payments?: Payment[];
}
export function normalizedFx(
  doc: TransactionFx & {
    total?: number;
    currency?: string;
    foreignAmount?: number;
    fxRate?: number;
    usdAmount?: number;
  },
) {
  const currency = doc.transactionCurrency || doc.currency || "USD";
  const amount = doc.transactionAmount ?? doc.foreignAmount ?? doc.total ?? 0;
  const rate = doc.exchangeRateValue ?? doc.fxRate ?? 1;
  if (!Number.isFinite(rate) || rate <= 0 || (currency === "USD" && rate !== 1))
    throw new Error("Enter a positive exchange rate; USD must use 1.");
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid transaction amount.");
  const converted = money(amount * rate);
  if (doc.functionalAmount != null && Math.abs(doc.functionalAmount - converted) > 0.005)
    throw new Error("Functional amount does not match transaction amount × exchange rate.");
  return {
    transactionCurrency: currency,
    transactionAmount: money(amount),
    functionalCurrency: "USD" as const,
    exchangeRateValue: rate,
    functionalAmount: converted,
  };
}
export function outstanding(
  doc: TransactionFx & {
    date: string;
    total?: number;
    currency?: string;
    foreignAmount?: number;
    fxRate?: number;
    usdAmount?: number;
    status?: string;
  },
  asOf = "9999-12-31",
) {
  const fx = normalizedFx(doc);
  if (doc.date > asOf) return { native: 0, functional: 0 };
  // Legacy paid documents are migrated with a payment row.
  const payments = (doc.payments || []).filter((p) => p.date <= asOf);
  return {
    native: Math.max(
      0,
      money(fx.transactionAmount - payments.reduce((s, p) => s + p.transactionAmount, 0)),
    ),
    functional: Math.max(
      0,
      money(fx.functionalAmount - payments.reduce((s, p) => s + p.bookAmount, 0)),
    ),
  };
}
export function settlement(
  doc: Parameters<typeof outstanding>[0],
  kind: "AP" | "AR",
  amount: number,
  rate: number,
  date: string,
) {
  const fx = normalizedFx(doc),
    open = outstanding(doc);
  if (date < doc.date || (doc.payments || []).some((p) => p.date > date))
    throw new Error("Payment dates must be chronological and on or after issue date.");
  if (!Number.isFinite(amount) || amount <= 0 || money(amount) > open.native)
    throw new Error("Payment exceeds the outstanding transaction amount.");
  if (!Number.isFinite(rate) || rate <= 0 || (fx.transactionCurrency === "USD" && rate !== 1))
    throw new Error("Enter a valid settlement rate.");
  const bookAmount =
    money(amount) === open.native
      ? open.functional
      : Math.min(open.functional, money(amount * fx.exchangeRateValue));
  const functionalAmount = money(amount * rate);
  return {
    bookAmount,
    functionalAmount,
    realizedGain: money(
      kind === "AP" ? bookAmount - functionalAmount : functionalAmount - bookAmount,
    ),
    remaining: money(open.native - amount),
  };
}
export function nextDay(date: string) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
export function closingAdjustment(
  doc: Parameters<typeof outstanding>[0],
  kind: "AP" | "AR",
  asOf: string,
  rate: number,
) {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Closing spot rate is missing.");
  const open = outstanding(doc, asOf),
    value = money(open.native * rate),
    difference = money(value - open.functional);
  return { ...open, value, difference, gain: kind === "AP" ? -difference : difference };
}
