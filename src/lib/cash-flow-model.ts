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
  internal_transfer: {
    label: "Transfer between own cash accounts (not an activity flow)",
    activity: "transfer",
    direction: null,
  },
} as const;
export type CashFlowLine = keyof typeof cashFlowLines;
export const cashFlowLineSchema = z.enum(
  Object.keys(cashFlowLines) as [CashFlowLine, ...CashFlowLine[]],
);
const code = z.string().trim().min(1).max(120);

/** A planned receipt or payment. Actual cash only comes from the General Ledger. */
export const forecastSchema = z
  .object({
    id: z.string().uuid().optional(),
    account_code: code,
    /** Counterpart GL account: the category. For a transfer, the other cash account. */
    counterpart_code: code,
    description: z.string().trim().min(1).max(240),
    direction: z.enum(["in", "out"]),
    amount: money.positive(),
    expected_date: dateSchema,
    status: z.enum(["planned", "realized", "cancelled"]),
    cash_flow_line: cashFlowLineSchema,
    variance_note: z.string().trim().max(1000).default(""),
  })
  .refine((f) => f.counterpart_code !== f.account_code, {
    message: "The counterpart account must differ from the cash account.",
    path: ["counterpart_code"],
  })
  .refine(
    (f) =>
      !cashFlowLines[f.cash_flow_line].direction ||
      cashFlowLines[f.cash_flow_line].direction === f.direction,
    {
      message: "Select a cash flow classification that matches the direction (inflow or outflow).",
      path: ["cash_flow_line"],
    },
  );
export type CashForecast = z.infer<typeof forecastSchema>;

export const mappingSchema = z.object({
  account_code: code,
  inflow_line: cashFlowLineSchema,
  outflow_line: cashFlowLineSchema,
});
export type CashFlowMapping = z.infer<typeof mappingSchema>;

/** A bank or cash account of the Chart of Accounts. Its id is the GL account code. */
export type CashAccount = {
  id: string;
  name: string;
  currency: string;
  /** First posted General Ledger date, or null when the account has no posted history. */
  first_posting: string | null;
};
export type ClassificationSource = "override" | "mapping" | "default" | "forecast";
export type CashTransaction = {
  id: string;
  source: "ledger" | "forecast";
  account_id: string;
  description: string;
  /** Counterpart GL account; null for opening balances and FX adjustments. */
  counterpart_code: string | null;
  direction: "in" | "out";
  amount: number;
  /** Expected date for forecasts; posting date for ledger movements. */
  due_date: string;
  /** Posting date of actual cash; null for forecasts. */
  paid_date: string | null;
  status: "planned" | "paid" | "realized" | "cancelled";
  cash_flow_line: CashFlowLine;
  classified_by: ClassificationSource;
  variance_note: string;
  transfer_account_id: string | null;
  transfer_id?: string | null;
  forecast_amount?: number | null;
  forecast_date?: string | null;
  forecast_direction?: "in" | "out" | null;
  /** Opening balances and FX remeasurement: they change the balance but are not cash flows. */
  balance_adjustment?: true;
  journal?: { id: string; number: string | null; sequence: number };
};
export type CashData = {
  accounts: CashAccount[];
  transactions: CashTransaction[];
  mappings: CashFlowMapping[];
  glAccounts: {
    code: string;
    name: string;
    type: string;
    balanceType: "Debit" | "Credit";
    /** Asset account the Bank Feed treats as a bank or cash account. */
    cash: boolean;
    /** Lines the default rule assigns when the account is not mapped. */
    defaultLines: { in: CashFlowLine; out: CashFlowLine };
  }[];
  /** Bank Feed lines awaiting review. They are not actual cash until they are posted. */
  statementPending: { account: string; count: number; oldest: string }[];
};
export type Interval = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
export const reconciliationScopeSchema = z.object({
  companyId: z.string().uuid(),
  start: dateSchema,
  end: dateSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  /** GL code of one cash account, or null for every account in the currency. */
  accountId: code.nullable(),
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
export type GlCashCheck = {
  status: "verified" | "difference" | "unavailable";
  reason: string;
  glBalance: number | null;
  cashBalance: number | null;
  difference: number | null;
  glAccounts: string[];
};

/**
 * Actuals always count. Planned forecasts count only in a projection and only from asOf
 * onwards: overdue plans are pending items, never part of the projected base balance.
 * Realized and cancelled forecasts never count; the ledger holds what actually happened.
 */
function counts(t: CashTransaction, projected: boolean, asOf: string) {
  return t.status === "paid" || (projected && t.status === "planned" && t.due_date >= asOf);
}
const effectiveDate = (t: CashTransaction) => t.paid_date ?? t.due_date;
/** Both legs in scope: the transfer moves cash inside the scope and is not a flow. */
function internalTransfer(t: CashTransaction, scope: Set<string>) {
  return !!t.transfer_account_id && scope.has(t.transfer_account_id);
}
/** Planned forecasts whose expected date has passed; they need a new date or settlement. */
export function overduePlanned(
  accounts: CashAccount[],
  transactions: CashTransaction[],
  asOf: string,
) {
  const ids = new Set(accounts.map((a) => a.id));
  return transactions
    .filter((t) => ids.has(t.account_id) && t.status === "planned" && t.due_date < asOf)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}
export function summarize(
  accounts: CashAccount[],
  transactions: CashTransaction[],
  start: string,
  end: string,
  interval: Interval,
  projected: boolean,
  asOf = start,
) {
  const cents = (n: number) => Math.round(n * 100);
  const signed = (t: CashTransaction) => cents(t.amount) * (t.direction === "in" ? 1 : -1);
  const scope = new Set(accounts.map((a) => a.id));
  const eligible = transactions.filter(
    (t) => scope.has(t.account_id) && !internalTransfer(t, scope) && counts(t, projected, asOf),
  );
  let balance = eligible.filter((t) => effectiveDate(t) < start).reduce((s, t) => s + signed(t), 0);
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
  const byDate = new Map<string, CashTransaction[]>();
  for (const t of eligible) {
    const date = effectiveDate(t);
    if (date < start || date > end) continue;
    byDate.set(date, [...(byDate.get(date) ?? []), t]);
  }
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
    const entries = byDate.get(date) ?? [];
    const adjustments = entries
      .filter((t) => t.balance_adjustment)
      .reduce((s, t) => s + signed(t), 0);
    const inflows = entries
      .filter((t) => !t.balance_adjustment && t.direction === "in")
      .reduce((s, t) => s + cents(t.amount), 0);
    const outflows = entries
      .filter((t) => !t.balance_adjustment && t.direction === "out")
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

/** Gross direct-method lines. Unclassified movements remain visible. */
export function statement(
  accounts: CashAccount[],
  transactions: CashTransaction[],
  start: string,
  end: string,
  projected: boolean,
  asOf = start,
) {
  const scope = new Set(accounts.map((a) => a.id));
  const entries = transactions.filter((t) => {
    const date = effectiveDate(t);
    return (
      scope.has(t.account_id) &&
      date >= start &&
      date <= end &&
      !t.balance_adjustment &&
      !internalTransfer(t, scope) &&
      counts(t, projected, asOf)
    );
  });
  const lines = Object.entries(cashFlowLines).map(([key, definition]) => {
    const matching = entries.filter((t) => t.cash_flow_line === key);
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
    transfers: total("transfer"),
    unclassifiedCount: entries.filter((t) => t.cash_flow_line === "unclassified").length,
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
  const scope = new Set(accounts.map((a) => a.id));
  return expected.periods.map((p, i) => {
    const a = actual.periods[i]!;
    const sunday = new Date(p.label + "T12:00:00Z");
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    const weekEnd = sunday.toISOString().slice(0, 10);
    const inWeek = (date: string | null | undefined) =>
      !!date && date >= start && date <= end && date >= p.label && date <= weekEnd;
    const notes = transactions
      .filter(
        (t) =>
          scope.has(t.account_id) &&
          !!t.variance_note &&
          (inWeek(effectiveDate(t)) || inWeek(t.forecast_date)),
      )
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
