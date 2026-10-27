import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting } from "@/lib/accounting-store";
import { reportRows } from "@/lib/financial-report";
import { PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";
export const Route = createFileRoute("/dre")({
  head: () =>
    pageHead(
      "Income Statement · LedgerX",
      "Revenue, COGS, operating expenses and other income and expenses.",
    ),
  component: IncomeStatementPage,
});
function IncomeStatementPage() {
  const { activeCompany, accounts, journals, projects } = useAccounting();
  const [projectId, setProjectId] = useState("");
  const rows = reportRows(accounts, journals, undefined, projectId);
  const types = ["Revenue", "COGS", "Operating Expense", "Other Income", "Other Expense"];
  const sections = types.map((type) => ({
    type,
    rows: rows.filter((a) => a.type === type),
    total: rows.filter((a) => a.type === type).reduce((s, a) => s + a.amount, 0),
  }));
  const [revenue = 0, cogs = 0, opex = 0, otherIncome = 0, otherExpense = 0] = sections.map(
    (s) => s.total,
  );
  const gross = revenue - cogs,
    operating = gross - opex,
    net = operating + otherIncome - otherExpense;
  const totals: (string | number)[][] = [
    ["Gross Profit", gross],
    ["Operating Income", operating],
    ["Net Income", net],
  ];
  return (
    <div className="space-y-4">
      <PageTitle
        title="Income Statement (Statement of Operations)"
        description={activeCompany.name + " · All saved journal dates"}
      />
      <div className="flex gap-3">
        <select
          aria-label="Project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">All Projects & Operations</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            exportToCsv(
              activeCompany.id + "_income_statement",
              ["Section", "Code", "Account", "Amount ($)"],
              [
                ...sections.flatMap((s) => [
                  ...s.rows.map((a) => [s.type, a.code, a.name, a.amount]),
                  [s.type, "", "Total", s.total],
                ]),
                ...totals.map((r) => [r[0] ?? "", "", "", r[1] ?? 0]),
              ],
            )
          }
        >
          Export CSV
        </button>
        <button onClick={() => window.print()}>Print</button>
      </div>
      {sections.map((s) => (
        <Panel
          key={s.type}
          title={s.type}
          subtitle={
            s.type === "COGS"
              ? "Direct costs"
              : s.type === "Operating Expense"
                ? "Selling, General & Administrative"
                : ""
          }
        >
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Account / Subgroup</Th>
                <Th align="right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((a) => (
                <tr key={a.code}>
                  <Td>{a.code}</Td>
                  <Td>
                    {a.name}
                    <div className="text-xs text-ink3">{a.subgroup}</div>
                  </Td>
                  <Td align="right">{usd(a.amount)}</Td>
                </tr>
              ))}
              <tr>
                <Td colSpan={2}>Total {s.type}</Td>
                <Td align="right">{usd(s.total)}</Td>
              </tr>
            </tbody>
          </Table>
        </Panel>
      ))}
      <Panel
        title="Results"
        subtitle="Contra revenue reduces revenue; distributions remain in equity."
      >
        <Table>
          <tbody>
            {totals.map((r) => (
              <tr key={String(r[0])}>
                <Td>{r[0]}</Td>
                <Td align="right">{usd(Number(r[1]))}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
