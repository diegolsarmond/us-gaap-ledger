import { load } from "./accounting.server";
import { load as loadCash } from "./cash-flow.server";
import { authorizeCompany } from "./companies.server";
import { flatten, type Source } from "./report-engine";
const labels: Record<string, string> = {
  customers: "Clientes",
  vendors: "Fornecedores",
  accounts: "Plano de contas",
  journals: "Lançamentos",
  inventory: "Estoque",
  projects: "Projetos",
  invoices: "Faturas / contas a receber",
  bills: "Contas a pagar",
  statements: "Extratos",
  stagingRows: "Transações importadas",
  taxes: "Impostos",
  auditLogs: "Auditoria",
  currencies: "Moedas",
  taxJurisdictions: "Jurisdições fiscais",
  paymentTerms: "Condições de pagamento",
  costCenters: "Centros de custo",
  expenseCategories: "Categorias de despesas",
  fiscalPeriods: "Períodos fiscais",
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
          `${labels[id] ?? id} · ${field === "costLots" ? "lotes" : "itens"}`,
          children,
        );
    }
  }
  add("cashTransactions", "Fluxo de caixa · movimentações", cash.transactions);
  add("cashAccounts", "Contas bancárias", cash.accounts);
  add("cashCategories", "Categorias de caixa", cash.categories);
  add("company", "Empresa ativa", [ledger.company]);
  return sources;
}
