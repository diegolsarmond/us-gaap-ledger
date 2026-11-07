import { load } from "./accounting.server";
import { load as loadCash } from "./cash-flow.server";
import { authorizeCompany } from "./companies.server";
import { flatten, type Source } from "./report-engine";
import { effectiveDimensions, type DimensionValue } from "./dimensions";
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
  dimensions: "Management dimensions",
};
export async function loadSources(companyId: string): Promise<Source[]> {
  const auth = await authorizeCompany(companyId);
  const [ledger, cash] = await Promise.all([load(companyId), loadCash(companyId)]);
  const sources: Source[] = [];
  const dimensionFields = (values: DimensionValue[] = [], lineId?: string) =>
    Object.fromEntries(
      effectiveDimensions(values, lineId).map((v) => {
        const d = ledger.state.dimensions.find((d) => d.id === v.dimensionId);
        return [
          `dimension.${d?.code ?? v.dimensionId}`,
          d?.options.find((o) => o.id === v.valueId)?.name ?? v.valueId,
        ];
      }),
    );
  const add = (id: string, label: string, records: unknown[]) => {
    const rows = records.map((r) => flatten(r as Record<string, unknown>));
    sources.push({ id, label, fields: [...new Set(rows.flatMap(Object.keys))], rows });
  };
  for (const [id, records] of Object.entries(ledger.state)) {
    if (!Array.isArray(records) || (id === "auditLogs" && !auth.permissions.view_audit)) continue;
    add(
      id,
      labels[id] ?? id,
      records.map((r) => ({
        ...r,
        ...("customFields" in r
          ? Object.fromEntries(
              (r.customFields as { name: string; value: string; type: string }[]).map((f) => [
                "custom." + f.name,
                f.type === "Number" && f.value !== ""
                  ? Number(f.value)
                  : f.type === "Checkbox" && f.value !== ""
                    ? f.value === "true"
                    : f.value,
              ]),
            )
          : {}),
        ...dimensionFields("dimensionValues" in r ? (r.dimensionValues as DimensionValue[]) : []),
      })),
    );
    for (const field of [
      "lines",
      "items",
      "costLots",
      "payments",
      "bankAccounts",
      "customFields",
    ]) {
      const children = records.flatMap((r: Record<string, unknown>) =>
        Array.isArray(r[field])
          ? (r[field] as Record<string, unknown>[]).map((child) => ({
              ...child,
              parentId: r["id"],
              ...dimensionFields(
                r["dimensionValues"] as DimensionValue[] | undefined,
                String(child["id"] ?? ""),
              ),
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
  add("cashTransactions", "Cash flow · actuals and forecasts", cash.transactions);
  add("cashAccounts", "Bank and cash accounts", cash.accounts);
  add("cashMappings", "Cash flow mapping", cash.mappings);
  add("company", "Active company", [ledger.company]);
  return sources;
}
