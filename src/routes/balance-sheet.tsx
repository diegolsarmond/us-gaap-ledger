import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AccountingProvider, useAccounting } from "@/lib/accounting-store";
import { reportRows } from "@/lib/financial-report";
import { PageTitle, Panel, Table, Td, Th, Note } from "@/components/ui-kit";
import { usd, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";
export const Route = createFileRoute("/balance-sheet")({
  head: () =>
    pageHead(
      "Classified Balance Sheet · LedgerX",
      "Company chart of accounts and classified balances.",
    ),
  component: () => (
    <AccountingProvider>
      <BalanceSheetPage />
    </AccountingProvider>
  ),
});
function BalanceSheetPage() {
  const { activeCompany, accounts, journals } = useAccounting();
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const rows = reportRows(accounts, journals, asOfDate);
  const sum = (type: string) =>
    rows.filter((a) => a.type === type).reduce((s, a) => s + a.amount, 0);
  const income =
    sum("Revenue") -
    sum("COGS") -
    sum("Operating Expense") +
    sum("Other Income") -
    sum("Other Expense");
  const assets = sum("Asset"),
    liabilities = sum("Liability"),
    equity = sum("Equity") + income;
  const sections = [
    { title: "Current Assets", type: "Asset", maturity: "Current" },
    { title: "Noncurrent Assets", type: "Asset", maturity: "Noncurrent" },
    { title: "Unclassified Assets — review required", type: "Asset", maturity: "Unclassified" },
    { title: "Current Liabilities", type: "Liability", maturity: "Current" },
    { title: "Noncurrent Liabilities", type: "Liability", maturity: "Noncurrent" },
    {
      title: "Unclassified Liabilities — review required",
      type: "Liability",
      maturity: "Unclassified",
    },
    { title: "Equity", type: "Equity", maturity: "" },
  ];
  const grouped = sections.map((s) => ({
    ...s,
    rows: rows.filter(
      (a) => a.type === s.type && (!s.maturity || (a.maturity || "Unclassified") === s.maturity),
    ),
  }));
  const totals: (string | number)[][] = [
    ["Total Assets", "", "", assets],
    ["Total Liabilities", "", "", liabilities],
    ["Current Net Income", "", "", income],
    ["Total Equity", "", "", equity],
    ["Liabilities & Equity", "", "", liabilities + equity],
  ];
  return (
    <div className="space-y-4">
      <PageTitle title="Classified Balance Sheet" description={activeCompany.name} />
      <div className="flex gap-3">
        <label>
          As of{" "}
          <input
            aria-label="As of"
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="rounded border p-2"
          />
        </label>
        <button
          onClick={() =>
            exportToCsv(
              activeCompany.id + "_balance_sheet",
              ["Section", "Code", "Account", "Amount ($)"],
              [
                ...grouped.flatMap((s) => s.rows.map((a) => [s.title, a.code, a.name, a.amount])),
                ...totals,
              ],
            )
          }
        >
          Export CSV
        </button>
        <button onClick={() => window.print()}>Print</button>
      </div>
      {grouped
        .filter((s) => s.rows.length)
        .map((s) => (
          <Panel key={s.title} title={s.title} subtitle={asOfDate}>
            <Table>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Account / Subgroup</Th>
                  <Th align="right">Balance</Th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((a) => (
                  <tr key={a.code}>
                    <Td>{a.code}</Td>
                    <Td>
                      {a.name}
                      {a.isContra ? " · Contra" : ""}
                      <div className="text-xs text-ink3">{a.subgroup}</div>
                    </Td>
                    <Td align="right">{usd(a.amount)}</Td>
                  </tr>
                ))}
                <tr>
                  <Td colSpan={2}>Total {s.title}</Td>
                  <Td align="right">{usd(s.rows.reduce((n, a) => n + a.amount, 0))}</Td>
                </tr>
              </tbody>
            </Table>
          </Panel>
        ))}
      <Panel title="Financial Position" subtitle={asOfDate}>
        <Table>
          <tbody>
            {totals.map((r) => (
              <tr key={String(r[0])}>
                <Td>{r[0]}</Td>
                <Td align="right">{usd(Number(r[3]))}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
      <Note tone={Math.abs(assets - liabilities - equity) < 0.01 ? "brand" : "neutral"}>
        Assets less liabilities and equity: {usd(assets - liabilities - equity)}. Unclassified
        accounts remain visible until reviewed. Contra accounts reduce their respective
        classification.
      </Note>
    </div>
  );
}
