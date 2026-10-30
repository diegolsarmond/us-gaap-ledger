import { load } from "./accounting.server";
import { load as loadCash } from "./cash-flow.server";
import { authorizeCompany } from "./companies.server";
import { flatten, type Source } from "./report-engine";
const labels: Record<string, string> = {
  customers: "Customers",
  vendors: "Vendors",
  accounts: "Chart of accounts",
  journals: "Journal entries",
  inventory: "Inventory",
  projects: "Projects",
  invoices: "Invoices / accounts receivable",
  bills: "Accounts payable",
  statements: "Bank statements",
  stagingRows: "Imported transactions",
  taxes: "Taxes",
  auditLogs: "Audit logs",
  currencies: "Currencies",
  taxJurisdictions: "Tax jurisdictions",
  paymentTerms: "Payment terms",
  costCenters: "Cost centers",
  expenseCategories: "Expense categories",
  fiscalPeriods: "Fiscal periods",
};
export async function loadSources(companyId: string): Promise<Source[]> {
  const auth = await authorizeCompany(companyId);
  const [ledger, cash] = await Promise.all([load(companyId), loadCash(companyId)]);
  const sources: Source[] = [];
  const add = (id: string, label: string, records: unknown[]) => {
    const rows = records.map((r) => flatten(r as Record<string, unknown>));
    sources.push({ id, label, fields: [...new Set(rows.flatMap(Object.keys))], rows });
  };
  for (const [id, records] of Object.entries(ledger.state)) {
    if (!Array.isArray(records) || (id === "auditLogs" && !auth.permissions.view_audit)) continue;
    add(id, labels[id] ?? id, records);
    for (const field of ["lines", "items", "costLots"]) {
      const children = records.flatMap((r: Record<string, unknown>) =>
        Array.isArray(r[field])
          ? (r[field] as Record<string, unknown>[]).map((child) => ({
              ...child,
              parentId: r["id"],
            }))
          : [],
      );
      if (children.length)
        add(
          `${id}_${field}`,
          `${labels[id] ?? id} · ${field === "costLots" ? "lots" : "items"}`,
          children,
        );
    }
  }
  add("cashTransactions", "Cash flow · transactions", cash.transactions);
  add("cashAccounts", "Bank accounts", cash.accounts);
  add("cashCategories", "Cash categories", cash.categories);
  add("company", "Active company", [ledger.company]);
  return sources;
}
