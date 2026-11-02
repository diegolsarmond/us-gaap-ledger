import { z } from "zod";
const money = z
  .string()
  .transform((value) => value.trim() || "0")
  .pipe(
    z
      .string()
      .regex(/^\d{1,15}(\.\d{1,4})?$/, "Use a nonnegative decimal amount with up to four decimals"),
  );
export const journalInput = z.object({
  journalType: z
    .enum(["Manual", "Automatic", "Adjustment", "Opening", "Reclassification"])
    .default("Manual"),
  accountingDate: z.string().date(),
  description: z.string().trim().max(4000),
  reference: z.string().max(300).default(""),
  currency: z.string().regex(/^[A-Z]{3}$/),
  exchangeRate: z
    .string()
    .regex(/^\d{1,10}(\.\d{1,12})?$/)
    .default("1"),
  exchangeRateSource: z.string().trim().min(1).max(300),
  lines: z
    .array(
      z.object({
        accountCode: z.string().max(100),
        description: z.string().max(2000).default(""),
        debit: money,
        credit: money,
        costCenterId: z.string().optional(),
        projectId: z.string().optional(),
        customerId: z.string().optional(),
        vendorId: z.string().optional(),
      }),
    )
    .min(2)
    .max(1000),
});
export const journalRequest = z.object({
  companyId: z.string().uuid(),
  operation: z.enum([
    "list",
    "detail",
    "save",
    "submit",
    "approve",
    "reject",
    "revise",
    "post",
    "reverse",
    "event",
    "balances",
  ]),
  id: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  value: journalInput.optional(),
  reason: z.string().trim().max(4000).optional(),
  reversalDate: z.string().date().optional(),
  filters: z
    .object({
      from: z.string().date().optional(),
      to: z.string().date().optional(),
      status: z.string().optional(),
      search: z.string().max(200).optional(),
      account: z.string().optional(),
      period: z.string().optional(),
      type: z.string().optional(),
      source: z.string().optional(),
      creator: z.string().optional(),
      costCenter: z.string().optional(),
      page: z.number().int().min(0).default(0),
    })
    .optional(),
  source: z
    .object({
      module: z.string().min(1).max(100),
      type: z.string().min(1).max(100),
      id: z.string().min(1).max(200),
      eventId: z.string().min(1).max(200),
      eventVersion: z.number().int().positive(),
      idempotencyKey: z.string().min(1).max(200),
      contractVersion: z.literal(1),
    })
    .optional(),
});
export type JournalRequest = z.infer<typeof journalRequest>;
export type JournalInput = z.infer<typeof journalInput>;
// Exact totals for UI; all authoritative conversion and balancing uses PostgreSQL NUMERIC.
export function amountUnits(value: string): bigint {
  if (!/^\d*(\.\d{0,4})?$/.test(value)) throw new Error("Invalid amount");
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole || "0") * 10000n + BigInt(fraction.padEnd(4, "0"));
}
export function unitsAmount(value: bigint) {
  const sign = value < 0n ? "-" : "";
  const n = value < 0n ? -value : value;
  return `${sign}${n / 10000n}.${(n % 10000n).toString().padStart(4, "0")}`;
}
export function convertedUnits(value: string, rate: string): bigint {
  if (!/^\d{1,10}(\.\d{1,12})?$/.test(rate)) throw new Error("Invalid exchange rate");
  const [whole = "0", fraction = ""] = rate.split(".");
  const rateUnits = BigInt(whole) * 1000000000000n + BigInt(fraction.padEnd(12, "0"));
  const product = amountUnits(value) * rateUnits;
  // PostgreSQL NUMERIC round(value,2), expressed in four-place UI units.
  return ((product + 50000000000000n) / 100000000000000n) * 100n;
}
export function updateJournalLines(
  lines: JournalInput["lines"],
  index: number,
  patch: Partial<JournalInput["lines"][number]>,
): JournalInput["lines"] {
  const next = { ...patch };
  if (next.debit && /^\d*(\.\d{0,4})?$/.test(next.debit) && amountUnits(next.debit) > 0n)
    next.credit = "0";
  if (next.credit && /^\d*(\.\d{0,4})?$/.test(next.credit) && amountUnits(next.credit) > 0n)
    next.debit = "0";
  return lines.map((line, i) => (i === index ? { ...line, ...next } : line));
}
export function accountingDateLabel(date: string): string {
  if (!z.string().date().safeParse(date).success) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T00:00:00Z"));
}
