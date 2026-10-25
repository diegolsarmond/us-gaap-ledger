import { z } from "zod";
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + "T12:00:00Z");
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Invalid date");
const money = z.number().finite().max(999999999999.99).multipleOf(0.01);
export const accountSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  currency: z.enum(["USD", "BRL", "EUR"]),
  opening_date: dateSchema,
  opening_balance: money.min(-999999999999.99),
});
export const cashCategorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  company_id: z.string().uuid().nullable(),
});
export type CashCategory = z.infer<typeof cashCategorySchema> & { id: string };
export const transactionSchema = z
  .object({
    id: z.string().uuid().optional(),
    account_id: z.string().uuid(),
    description: z.string().trim().min(1).max(240),
    category: z.string().trim().min(1).max(100),
    direction: z.enum(["in", "out"]),
    amount: money.positive(),
    due_date: dateSchema,
    paid_date: dateSchema.nullable(),
    status: z.enum(["planned", "paid", "cancelled"]),
  })
  .refine(
    (t) => (t.status === "paid") === (t.paid_date !== null),
    "Provide a payment date only for actual transactions.",
  );
export type CashAccount = z.infer<typeof accountSchema> & { id: string };
export type CashTransaction = z.infer<typeof transactionSchema> & { id: string };
export type CashData = {
  accounts: CashAccount[];
  transactions: CashTransaction[];
  categories: CashCategory[];
};
export type Interval = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
export function summarize(
  accounts: CashAccount[],
  transactions: CashTransaction[],
  start: string,
  end: string,
  interval: Interval,
  projected: boolean,
) {
  const cents = (n: number) => Math.round(n * 100);
  const signed = (t: CashTransaction) => cents(t.amount) * (t.direction === "in" ? 1 : -1);
  const accountDates = new Map(accounts.map((a) => [a.id, a.opening_date]));
  const eligible = transactions.filter((t) => {
    const openingDate = accountDates.get(t.account_id);
    return (
      openingDate !== undefined &&
      (t.paid_date ?? t.due_date) >= openingDate &&
      (t.status === "paid" || (projected && t.status === "planned"))
    );
  });
  const effectiveDate = (t: CashTransaction) => t.paid_date ?? t.due_date;
  let balance =
    accounts
      .filter((a) => a.opening_date < start)
      .reduce((s, a) => s + cents(a.opening_balance), 0) +
    eligible.filter((t) => effectiveDate(t) < start).reduce((s, t) => s + signed(t), 0);
  const opening = balance;
  const periods: {
    label: string;
    openingBalance: number;
    inflows: number;
    outflows: number;
    adjustments: number;
    net: number;
    balance: number;
  }[] = [];
  for (
    let cursor = new Date(start + "T12:00:00Z");
    cursor.toISOString().slice(0, 10) <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const date = cursor.toISOString().slice(0, 10);
    const bucket = new Date(cursor);
    if (interval === "weekly")
      bucket.setUTCDate(bucket.getUTCDate() - ((bucket.getUTCDay() + 6) % 7));
    const label =
      interval === "daily" || interval === "weekly"
        ? bucket.toISOString().slice(0, 10)
        : interval === "monthly"
          ? date.slice(0, 7)
          : interval === "quarterly"
            ? `${date.slice(0, 4)} Q${Math.floor(cursor.getUTCMonth() / 3) + 1}`
            : date.slice(0, 4);
    let row = periods.at(-1);
    if (!row || row.label !== label) {
      row = {
        label,
        openingBalance: balance,
        inflows: 0,
        outflows: 0,
        adjustments: 0,
        net: 0,
        balance: 0,
      };
      periods.push(row);
    }
    const adjustments = accounts
      .filter((a) => a.opening_date === date)
      .reduce((s, a) => s + cents(a.opening_balance), 0);
    const entries = eligible.filter((t) => effectiveDate(t) === date);
    const inflows = entries
      .filter((t) => t.direction === "in")
      .reduce((s, t) => s + cents(t.amount), 0);
    const outflows = entries
      .filter((t) => t.direction === "out")
      .reduce((s, t) => s + cents(t.amount), 0);
    balance += adjustments + inflows - outflows;
    row.inflows += inflows;
    row.outflows += outflows;
    row.adjustments += adjustments;
    row.net += inflows - outflows;
    row.balance = balance;
  }
  return {
    opening: opening / 100,
    periods: periods.map((p) => ({
      ...p,
      openingBalance: p.openingBalance / 100,
      inflows: p.inflows / 100,
      outflows: p.outflows / 100,
      adjustments: p.adjustments / 100,
      net: p.net / 100,
      balance: p.balance / 100,
    })),
  };
}
