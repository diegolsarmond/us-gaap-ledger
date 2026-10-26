import { z } from "zod";
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + "T12:00:00Z");
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Invalid date");
const money = z.number().finite().min(-999999999999.99).max(999999999999.99).multipleOf(0.01);
export const cashFlowLines = {
  unclassified: {
    label: "Unclassified — review required",
    activity: "unclassified",
    direction: null,
  },
  customers: {
    label: "Cash received from customers / future sales",
    activity: "operating",
    direction: "in",
  },
  suppliers: {
    label: "Supplier payments / inventory (COGS cash payments)",
    activity: "operating",
    direction: "out",
  },
  logistics: { label: "Logistics and freight", activity: "operating", direction: "out" },
  payroll: { label: "Employee payments", activity: "operating", direction: "out" },
  opex: { label: "Rent, fixed costs and other OPEX", activity: "operating", direction: "out" },
  taxes: { label: "Income and sales taxes paid", activity: "operating", direction: "out" },
  interest_paid: {
    label: "Interest paid (excluding capitalized interest)",
    activity: "operating",
    direction: "out",
  },
  interest_received: { label: "Interest received", activity: "operating", direction: "in" },
  dividends_received: {
    label: "Dividends received — return on investment",
    activity: "operating",
    direction: "in",
  },
  other_operating_in: { label: "Other operating receipts", activity: "operating", direction: "in" },
  capex: {
    label: "PP&E purchases / capitalized interest",
    activity: "investing",
    direction: "out",
  },
  asset_sales: { label: "Proceeds from PP&E sales", activity: "investing", direction: "in" },
  investments: {
    label: "Securities purchased / loans granted",
    activity: "investing",
    direction: "out",
  },
  investment_returns: {
    label: "Securities sold / loan principal collected / return of investment",
    activity: "investing",
    direction: "in",
  },
  capital: {
    label: "Capital contributions / shares issued",
    activity: "financing",
    direction: "in",
  },
  borrowings: { label: "Loan and credit line proceeds", activity: "financing", direction: "in" },
  debt_principal: { label: "Debt principal repayments", activity: "financing", direction: "out" },
  dividends_paid: {
    label: "Dividends / distributions paid",
    activity: "financing",
    direction: "out",
  },
  buybacks: { label: "Share repurchases", activity: "financing", direction: "out" },
} as const;
export type CashFlowLine = keyof typeof cashFlowLines;
const cashFlowLineSchema = z.enum(Object.keys(cashFlowLines) as [CashFlowLine, ...CashFlowLine[]]);
export const accountSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  currency: z.enum(["USD", "BRL", "EUR"]),
  opening_date: dateSchema,
  opening_balance: money.min(-999999999999.99),
  gl_account_code: z.string().trim().min(1).max(120).nullable().default(null),
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
    cash_flow_line: cashFlowLineSchema.default("unclassified"),
    variance_note: z.string().trim().max(1000).default(""),
    gl_account_code: z.string().trim().min(1).max(120).nullable().default(null),
  })
  .refine(
    (t) =>
      !cashFlowLines[t.cash_flow_line].direction ||
      cashFlowLines[t.cash_flow_line].direction === t.direction,
    {
      message:
        "Select a cash flow classification that matches the transaction type (inflow or outflow).",
      path: ["cash_flow_line"],
    },
  )
  .refine(
    (t) => (t.status === "paid") === (t.paid_date !== null),
    "Provide a payment date only for actual transactions.",
  );
export type CashAccount = z.infer<typeof accountSchema> & { id: string };
export type CashTransaction = z.infer<typeof transactionSchema> & {
  id: string;
  forecast_amount?: number | null;
  forecast_date?: string | null;
  forecast_direction?: "in" | "out" | null;
};
export type CashData = {
  accounts: CashAccount[];
  transactions: CashTransaction[];
  categories: CashCategory[];
  glAccounts: { code: string; name: string; type: string; balanceType: "Debit" | "Credit" }[];
};
export type Interval = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
export const reconciliationScopeSchema = z.object({
  companyId: z.string().uuid(),
  start: dateSchema,
  end: dateSchema,
  currency: z.enum(["USD", "BRL", "EUR"]),
  accountId: z.string().uuid().nullable(),
});
export const reconciliationSchema = reconciliationScopeSchema.extend({
  net_income: money,
  depreciation: money,
  receivables: money,
  inventory: money,
  payables: money,
  taxes_payable: money,
  other_adjustments: money,
  balance_sheet_cash: money,
  explanation: z.string().trim().min(1).max(2000),
});
export type CashReconciliation = z.infer<typeof reconciliationSchema>;
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

/** Gross direct-method lines. Unknown legacy classifications remain visible. */
export function statement(
  accounts: CashAccount[],
  transactions: CashTransaction[],
  start: string,
  end: string,
  projected: boolean,
) {
  const selected = new Map(accounts.map((a) => [a.id, a.opening_date]));
  const entries = transactions.filter((t) => {
    const date = t.paid_date ?? t.due_date;
    const opening = selected.get(t.account_id);
    return (
      opening !== undefined &&
      date >= opening &&
      date >= start &&
      date <= end &&
      (t.status === "paid" || (projected && t.status === "planned"))
    );
  });
  const lines = Object.entries(cashFlowLines).map(([key, definition]) => {
    const matching = entries.filter((t) => (t.cash_flow_line ?? "unclassified") === key);
    const inflows = matching
      .filter((t) => t.direction === "in")
      .reduce((s, t) => s + Math.round(t.amount * 100), 0);
    const outflows = matching
      .filter((t) => t.direction === "out")
      .reduce((s, t) => s + Math.round(t.amount * 100), 0);
    return {
      key,
      ...definition,
      inflows: inflows / 100,
      outflows: outflows / 100,
      net: (inflows - outflows) / 100,
      count: matching.length,
    };
  });
  const total = (activity: string) =>
    lines.filter((l) => l.activity === activity).reduce((s, l) => s + Math.round(l.net * 100), 0) /
    100;
  return {
    lines,
    operating: total("operating"),
    investing: total("investing"),
    financing: total("financing"),
    unclassifiedCount: entries.filter(
      (t) => !t.cash_flow_line || t.cash_flow_line === "unclassified",
    ).length,
    capex: lines.find((l) => l.key === "capex")!.outflows,
  };
}

/** Compare the first saved plan to actuals; cancellation never erases a plan. */
export function weeklyComparison(
  accounts: CashAccount[],
  transactions: CashTransaction[],
  start: string,
  end: string,
  asOf: string,
) {
  const baseline = transactions
    .filter((t) => t.forecast_amount != null && t.forecast_date && t.forecast_direction)
    .map((t) => ({
      ...t,
      amount: t.forecast_amount!,
      due_date: t.forecast_date!,
      paid_date: t.forecast_date!,
      direction: t.forecast_direction!,
      status: "paid" as const,
    }));
  const expected = summarize(accounts, baseline, start, end, "weekly", false);
  const actual = summarize(accounts, transactions, start, end, "weekly", false);
  return expected.periods.map((p, i) => {
    const a = actual.periods[i]!;
    const sunday = new Date(p.label + "T12:00:00Z");
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    const weekEnd = sunday.toISOString().slice(0, 10);
    const notes = transactions
      .filter((t) => {
        const date = t.paid_date ?? t.due_date;
        return (
          accounts.some((account) => account.id === t.account_id) &&
          ((date >= start && date <= end && date >= p.label && date <= weekEnd) ||
            (t.forecast_date &&
              t.forecast_date >= start &&
              t.forecast_date <= end &&
              t.forecast_date >= p.label &&
              t.forecast_date <= weekEnd))
        );
      })
      .filter((t) => t.variance_note)
      .map((t) => `${t.description}: ${t.variance_note}`);
    return {
      label: p.label,
      state: p.label > asOf ? "Future" : weekEnd >= asOf ? "In progress" : "Closed",
      partial: p.label < start || weekEnd > end,
      forecastIn: p.inflows,
      actualIn: a.inflows,
      forecastOut: p.outflows,
      actualOut: a.outflows,
      forecastNet: p.net,
      actualNet: a.net,
      variance: (Math.round(a.net * 100) - Math.round(p.net * 100)) / 100,
      notes,
    };
  });
}
