const labels: Record<string, string> = {
  app_users: "Users",
  access_profiles: "Access profiles",
  cash_accounts: "Cash accounts",
  cash_transactions: "Cash transactions",
  Account: "Ledger account",
  Accounting: "Accounting",
  VendorAttachment: "Vendor attachment",
  currencies: "Currencies",
  taxJurisdictions: "Tax jurisdictions",
  paymentTerms: "Payment terms",
  costCenters: "Cost centers",
  expenseCategories: "Expense categories",
  fiscalPeriods: "Fiscal periods",
  id: "ID",
  name: "Name",
  email: "Email",
  active: "Active",
  code: "Code",
  type: "Type",
  balanceType: "Balance type",
  description: "Description",
  subgroup: "Subgroup",
  maturity: "Maturity classification",
  isContra: "Contra account",
  track1099: "Track for Form 1099",
  parentCode: "Parent account",
  profile_id: "Access profile",
  company_id: "Company",
  user_id: "User",
  company_ids: "Allowed companies",
  created_at: "Created at",
  updated_at: "Updated at",
  manage_users: "Manage users",
  manage_profiles: "Manage profiles",
  view_audit: "View audit log",
  write_cash: "Edit cash flow",
  system_admin: "System administrator",
  manage_companies: "Manage companies",
  write_accounting: "Edit accounting",
  close_periods: "Close periods",
  all_companies: "Access all companies",
  must_change_password: "Password change required",
  amount: "Value",
  currency: "Currency",
  date: "Date",
  status: "Status",
  memo: "Memo",
  account_id: "Account",
  accountCode: "Account code",
  notes: "Notes",
  opening_balance: "Opening balance",
  bank_name: "Bank",
  account_number: "Account number",
  Active: "Active",
  Inactive: "Inactive",
  Debit: "Debit",
  Credit: "Credit",
  Asset: "Asset",
  Liability: "Liability",
  Equity: "Equity",
  Revenue: "Revenue",
  COGS: "Cost of goods sold",
  "Operating Expense": "Operating expense",
  "Other Income": "Other income",
  "Other Expense": "Other expense",
  Current: "Current",
  Noncurrent: "Noncurrent",
  "Not Applicable": "Not applicable",
  Unclassified: "Unclassified",
  Open: "Open",
  Paid: "Paid",
  Overdue: "Overdue",
  Completed: "Completed",
  "On Hold": "On hold",
};
const actions: Record<string, string> = {
  LOGIN: "Sign-in",
  INSERT: "Creation",
  UPDATE: "Update",
  DELETE: "Deletion",
  create: "Creation",
  update: "Update",
  delete: "Deletion",
  UPDATE_COMPANY_ACCESS: "Company access update",
  installUsGaapCoa: "US GAAP chart of accounts installation",
  postJournalEntry: "Journal entry posting",
  reverseJournalEntry: "Journal entry reversal",
  togglePeriodLock: "Period lock update",
  adjustStock: "Stock adjustment",
  setCostMethod: "Cost method update",
  createInvoice: "Invoice creation",
  recordInvoicePayment: "Invoice payment received",
  createBill: "Bill creation",
  payBill: "Bill payment",
  createProject: "Project creation",
  importStatement: "Statement import",
  classifyStagingRow: "Transaction classification",
  recordTaxRemittance: "Tax remittance recording",
  resetParametersToDefault: "Restore default parameters",
};
const subjects: Record<string, string> = {
  Customer: "customer",
  Vendor: "vendor",
  Account: "ledger account",
  InventoryItem: "inventory item",
  Currency: "currency",
  TaxJurisdiction: "tax jurisdiction",
  PaymentTerm: "payment term",
  CostCenter: "cost center",
  ExpenseCategory: "expense category",
  FiscalPeriod: "fiscal period",
};
export function auditLabel(key: string): string {
  return (
    labels[key] ??
    key
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]/g, " ")
      .replace(/^./, (c) => c.toUpperCase())
  );
}
export function auditAction(action: string): string {
  if (actions[action]) return actions[action];
  const match = /^(add|update|delete)(.+)$/.exec(action);
  if (match?.[1] && match[2] && subjects[match[2]])
    return `${{ add: "Creation of", update: "Update of", delete: "Deletion of" }[match[1]]} ${subjects[match[2]]}`;
  return auditLabel(action);
}
export function parseAuditData(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
function flatten(
  value: unknown,
  prefix = "",
  result: Record<string, unknown> = {},
): Record<string, unknown> {
  if (value !== null && typeof value === "object" && Object.keys(value).length) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, result);
    }
  } else if (prefix || value !== null) result[prefix || "value"] = value;
  return result;
}
export function auditChanges(before: unknown, after: unknown) {
  const previous = flatten(before),
    next = flatten(after);
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])]
    .filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]))
    .map((key) => ({
      key,
      label: key
        .split(".")
        .map((part) =>
          /^\d+$/.test(part)
            ? `Item ${Number(part) + 1}`
            : part === "value"
              ? "Value"
              : auditLabel(part),
        )
        .join(" › "),
      before: previous[key],
      after: next[key],
    }));
}
export function auditValue(value: unknown): string {
  if (value === undefined || value === null) return "Not provided";
  if (value === "") return "Blank";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number")
    return value.toLocaleString("en-US", { maximumFractionDigits: 20 });
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value))
      return `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(0, 4)}`;
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:/.test(value) && !Number.isNaN(Date.parse(value)))
      return new Date(value).toLocaleString("en-US");
    return labels[value] ?? value;
  }
  return Array.isArray(value) ? "Empty list" : "No data";
}
