import type { CashFlowLine, CashFlowMapping } from "./cash-flow-model";

export type ClassifiableAccount = {
  code: string;
  name: string;
  type: string;
  detailType?: string | undefined;
  subgroup?: string | undefined;
  maturity?: string | undefined;
  sourceAccount?: { type: string } | undefined;
};
type Lines = { in: CashFlowLine; out: CashFlowLine };

const same = (line: CashFlowLine): Lines => ({ in: line, out: line });

/**
 * Default US GAAP (ASC 230) direct-method line for cash moving against a counterpart account.
 * It is a starting point: a company maps its accounts in Cash flow mapping, and a single
 * movement can be reclassified. Bank and cash counterparts are handled by the caller as
 * internal transfers.
 */
export function defaultCashFlowLines(account: ClassifiableAccount): Lines {
  const text = [account.name, account.detailType, account.subgroup, account.sourceAccount?.type]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const has = (pattern: RegExp) => pattern.test(text);
  switch (account.type) {
    case "Revenue":
      return { in: "customers", out: "customers" };
    case "Other Income":
      if (has(/interest/)) return { in: "interest_received", out: "interest_received" };
      if (has(/dividend/)) return { in: "dividends_received", out: "dividends_received" };
      return { in: "other_operating_in", out: "opex" };
    case "COGS":
      return has(/freight|logistic|shipping|delivery/)
        ? { in: "suppliers", out: "logistics" }
        : same("suppliers");
    case "Operating Expense":
    case "Other Expense":
      if (has(/interest/)) return { in: "opex", out: "interest_paid" };
      if (has(/payroll|salar|wage|staff|employee|benefit|bonus/))
        return { in: "opex", out: "payroll" };
      if (has(/income tax|sales tax|\btax/)) return { in: "opex", out: "taxes" };
      if (has(/freight|logistic|shipping|delivery|postage/))
        return { in: "opex", out: "logistics" };
      return { in: "other_operating_in", out: "opex" };
    case "Asset":
      if (has(/receivable|a\/r/)) return { in: "customers", out: "customers" };
      if (has(/inventor|stock/)) return { in: "suppliers", out: "suppliers" };
      if (has(/prepaid|deposit|escrow|insurance/)) return { in: "other_operating_in", out: "opex" };
      if (
        account.maturity === "Noncurrent" ||
        has(/fixed asset|equipment|property|real st|building|vehicle|furniture|land|machinery/)
      )
        return { in: "asset_sales", out: "capex" };
      return { in: "investment_returns", out: "investments" };
    case "Liability":
      if (has(/credit card/)) return { in: "borrowings", out: "suppliers" };
      if (has(/payroll|wage|salar/)) return { in: "other_operating_in", out: "payroll" };
      if (has(/tax/)) return { in: "other_operating_in", out: "taxes" };
      if (has(/deposit|unearned|deferred revenue|customer/))
        return { in: "customers", out: "customers" };
      if (
        account.maturity === "Noncurrent" ||
        has(/loan|note|debt|line of credit|mortgage|borrow|long-term/)
      )
        return { in: "borrowings", out: "debt_principal" };
      if (has(/payable|a\/p/)) return { in: "other_operating_in", out: "suppliers" };
      return { in: "other_operating_in", out: "opex" };
    case "Equity":
      if (has(/treasury|repurchase|buyback/)) return { in: "capital", out: "buybacks" };
      return { in: "capital", out: "dividends_paid" };
    default:
      return same("unclassified");
  }
}

/** Line for a movement: an explicit mapping wins over the default rule. */
export function classifyCashMovement(
  direction: "in" | "out",
  counterpart: ClassifiableAccount | undefined,
  mapping: CashFlowMapping | undefined,
): { line: CashFlowLine; by: "mapping" | "default" } {
  if (mapping)
    return { line: direction === "in" ? mapping.inflow_line : mapping.outflow_line, by: "mapping" };
  if (!counterpart) return { line: "unclassified", by: "default" };
  return { line: defaultCashFlowLines(counterpart)[direction], by: "default" };
}
