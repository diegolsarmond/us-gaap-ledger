import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AccountingProvider, useAccounting } from "@/lib/accounting-store";
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
  component: () => (
    <AccountingProvider>
      <IncomeStatementPage />
    </AccountingProvider>
  ),
});
function IncomeStatementPage() {
  const { activeCompany, accounts, journals, projects, dimensions, costCenters } = useAccounting();
  const [costCenterId, setCostCenterId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [dimensionFilters, setDimensionFilters] = useState<Record<string, string>>({});
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rows = reportRows(accounts, journals, undefined, projectId, {
    from,
    to,
    costCenterId,
    dimensions: dimensionFilters,
  });
  const group = dimensions.find((d) => d.id === groupBy);
  const columns = group
    ? [
        ...group.options.map((o) => ({ id: o.id, name: o.name })),
        { id: "__unclassified", name: "Unclassified" },
      ].map((o) => ({
        ...o,
        rows: reportRows(accounts, journals, undefined, projectId, {
          from,
          to,
          costCenterId,
          dimensions: { ...dimensionFilters, [group.id]: o.id },
        }),
      }))
    : [];
  // Respect any value filter on the grouping dimension; all columns still sum to Total.
  const visibleColumns = columns.filter(
    (c) => !dimensionFilters[groupBy] || c.id === dimensionFilters[groupBy],
  );
  const columnTotal = (column: (typeof columns)[number], type: string) =>
    column.rows.filter((a) => a.type === type).reduce((sum, a) => sum + a.amount, 0);
  const resultTotal = (column: (typeof columns)[number], label: string) => {
    const gross = columnTotal(column, "Revenue") - columnTotal(column, "COGS");
    const operating = gross - columnTotal(column, "Operating Expense");
    return label === "Gross Profit"
      ? gross
      : label === "Operating Income"
        ? operating
        : operating + columnTotal(column, "Other Income") - columnTotal(column, "Other Expense");
  };
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
        description={activeCompany.name + " · Posted revenue and expenses by management dimension"}
      />
      <div className="flex flex-wrap gap-3 text-sm">
        <label>
          From
          <input
            aria-label="From date"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="ml-2 rounded border border-line p-2"
          />
        </label>
        <label>
          To
          <input
            aria-label="To date"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="ml-2 rounded border border-line p-2"
          />
        </label>
        <label>
          Display columns by
          <select
            aria-label="Display columns by"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="ml-2 rounded border border-line p-2"
          >
            <option value="">Total only</option>
            {dimensions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
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
        <label>
          Cost center
          <select
            className="ml-2 rounded border border-line p-2"
            value={costCenterId}
            onChange={(e) => setCostCenterId(e.target.value)}
          >
            <option value="">All cost centers</option>
            <option value="__unassigned">Unassigned</option>
            {costCenters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
                {c.status === "Inactive" ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() =>
            exportToCsv(
              activeCompany.id + "_income_statement",
              ["Section", "Code", "Account", ...visibleColumns.map((c) => c.name), "Total ($)"],
              [
                ...sections.flatMap((s) => [
                  ...s.rows.map((a) => [
                    s.type,
                    a.code,
                    a.name,
                    ...visibleColumns.map(
                      (c) => c.rows.find((r) => r.code === a.code)?.amount ?? 0,
                    ),
                    a.amount,
                  ]),
                  [
                    s.type,
                    "",
                    "Total",
                    ...visibleColumns.map((c) => columnTotal(c, s.type)),
                    s.total,
                  ],
                ]),
                ...totals.map((r) => [
                  r[0] ?? "",
                  "",
                  "",
                  ...visibleColumns.map((c) => resultTotal(c, String(r[0]))),
                  r[1] ?? 0,
                ]),
              ],
            )
          }
        >
          Export CSV
        </button>
        <button onClick={() => window.print()}>Print</button>
      </div>
      <div className="flex flex-wrap gap-3">
        {dimensions.map((d) => (
          <label key={d.id} className="text-xs">
            {d.name}
            <select
              aria-label={`Filter ${d.name}`}
              className="ml-2 rounded border border-line p-2"
              value={dimensionFilters[d.id] ?? ""}
              onChange={(e) => setDimensionFilters({ ...dimensionFilters, [d.id]: e.target.value })}
            >
              <option value="">All values</option>
              <option value="__unclassified">Unclassified</option>
              {d.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ))}
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
                {visibleColumns.map((c) => (
                  <Th key={c.id} align="right">
                    {c.name}
                  </Th>
                ))}
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
                  {visibleColumns.map((c) => (
                    <Td key={c.id} align="right">
                      {usd(c.rows.find((r) => r.code === a.code)?.amount ?? 0)}
                    </Td>
                  ))}
                  <Td align="right">{usd(a.amount)}</Td>
                </tr>
              ))}
              <tr>
                <Td colSpan={2}>Total {s.type}</Td>
                {visibleColumns.map((c) => (
                  <Td key={c.id} align="right">
                    {usd(columnTotal(c, s.type))}
                  </Td>
                ))}
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
          <thead>
            <tr>
              <Th>Result</Th>
              {visibleColumns.map((c) => (
                <Th key={c.id} align="right">
                  {c.name}
                </Th>
              ))}
              <Th align="right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {totals.map((r) => (
              <tr key={String(r[0])}>
                <Td>{r[0]}</Td>
                {visibleColumns.map((c) => (
                  <Td key={c.id} align="right">
                    {usd(resultTotal(c, String(r[0])))}
                  </Td>
                ))}
                <Td align="right">{usd(Number(r[1]))}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
