import { z } from "zod";
export const trialFilters = z
  .object({
    companyId: z.string().uuid(),
    start: z.string().date(),
    end: z.string().date(),
    costCenter: z.string().max(200).default(""),
    accountType: z.string().max(100).default(""),
    search: z.string().max(200).default(""),
    showZero: z.boolean().default(false),
    view: z.enum(["Standard", "Detailed"]).default("Detailed"),
    account: z.string().max(100).optional(),
    page: z.coerce.number().int().min(0).default(0),
    export: z.enum(["csv", "xlsx", "pdf"]).optional(),
  })
  .refine((v) => v.start <= v.end, "Start date must precede end date");
export type TrialFilters = z.infer<typeof trialFilters>;
export interface TrialRow {
  code: string;
  name: string;
  type: string;
  parent: string | null;
  opening_debit: string;
  opening_credit: string;
  period_debit: string;
  period_credit: string;
  closing_debit: string;
  closing_credit: string;
}
export interface TrialActivity {
  id: string;
  number: string;
  date: string;
  description: string;
  reference: string;
  source: string;
  debit: string;
  credit: string;
  running: string;
  currency: string;
  original_debit: string;
  original_credit: string;
}
export interface TrialReport {
  company: string;
  currency: string;
  generated: string;
  filters: TrialFilters;
  periods: {
    id: string;
    periodCode: string;
    fiscalYear: string;
    startDate: string;
    endDate: string;
    status: string;
  }[];
  centers: { id: string; name: string; code: string }[];
  groups: { code: string; name: string; descendants: string[] }[];
  accounts: TrialRow[];
  quickBooksBalances?: {
    code: string;
    name: string;
    date: string;
    currency: string;
    amount: string;
  }[];
  total_debit: string;
  total_credit: string;
  difference: string;
  status: string;
  subset_debit: string;
  subset_credit: string;
  subset_difference: string;
  activity?: TrialActivity[];
  activity_count?: number;
  account_row?: TrialRow;
}
// Values returned by NUMERIC remain decimal strings throughout calculations and exports.
export function exactSum(values: string[]): string {
  let sum = 0n;
  for (const value of values) {
    const negative = value.startsWith("-");
    const [w, f = ""] = value.replace(/^-/, "").split(".");
    sum += (negative ? -1n : 1n) * (BigInt(w!) * 10000n + BigInt(f.padEnd(4, "0")));
  }
  const sign = sum < 0n ? "-" : "";
  const n = sum < 0n ? -sum : sum;
  return `${sign}${n / 10000n}.${String(n % 10000n).padStart(4, "0")}`;
}
export function displayAmount(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}
