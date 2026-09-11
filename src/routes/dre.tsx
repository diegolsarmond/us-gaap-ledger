import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, pct, acct, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/dre")({
  head: () =>
    pageHead(
      "Income Statement (P&L) · LedgerX",
      "US GAAP Statement of Operations detailing revenues, cost of goods sold, gross margin, operating expenses, and realized FX gain/loss.",
    ),
  component: IncomeStatementPage,
});

function IncomeStatementPage() {
  const {
    activeCompany,
    accountBalances,
    totalRevenue,
    totalCOGS,
    grossProfit,
    totalOpEx,
    operatingIncome,
    totalFXVariance,
    netIncome,
    projects,
  } = useAccounting();

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const serviceRevenue = accountBalances["4000"]?.net || 0;
  const productRevenue = accountBalances["4100"]?.net || 0;
  const cogs = accountBalances["5000"]?.net || 0;
  const sellingExpense = accountBalances["6100"]?.net || 0;
  const adminExpense = accountBalances["6200"]?.net || 0;

  const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const operatingMarginPct = totalRevenue > 0 ? (operatingIncome / totalRevenue) * 100 : 0;
  const netMarginPct = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0;

  const handleExportCsv = () => {
    const headers = ["P&L Section", "Account Line", "Amount ($)"];
    const rows: (string | number)[][] = [
      ["Revenues", "4000 · Service & Consulting Revenue", serviceRevenue],
      ["Revenues", "4100 · Product Sales Revenue", productRevenue],
      ["Total Revenues", "TOTAL REVENUE", totalRevenue],
      ["Cost of Goods Sold", "5000 · Cost of Goods Sold (COGS)", cogs],
      ["Gross Profit", "GROSS PROFIT", grossProfit],
      ["Operating Expenses", "6100 · Selling & Marketing", sellingExpense],
      ["Operating Expenses", "6200 · General & Administrative", adminExpense],
      ["Total Operating Expenses", "TOTAL OPERATING EXPENSES", totalOpEx],
      ["Operating Income", "OPERATING INCOME", operatingIncome],
      ["Other Income / Expense", "6300 · Realized Foreign Exchange Gain / Loss", totalFXVariance],
      ["Net Income", "NET INCOME", netIncome],
    ];

    exportToCsv(`${activeCompany.id}_income_statement`, headers, rows);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line/60 pb-3">
        <PageTitle
          title="Income Statement (Statement of Operations)"
          description={`US GAAP Accrual Statement of Profit & Loss for ${activeCompany.name} · Period ${activeCompany.activePeriod}`}
        />
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="rounded-md bg-white px-2.5 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line outline-none max-w-full"
          >
            <option value="">All Projects & Operations</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleExportCsv}
            className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs cursor-pointer"
          >
            Export P&L (CSV)
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-brand px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-95 shadow-2xs cursor-pointer"
          >
            Print
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Total Net Revenue"
          value={usd(totalRevenue)}
          hint="Services & Merchandise"
          tone="up"
        />
        <Kpi
          label="Gross Profit"
          value={usd(grossProfit)}
          hint={`${pct(grossMarginPct)} gross margin`}
          tone="up"
        />
        <Kpi
          label="Operating Income (EBIT)"
          value={usd(operatingIncome)}
          hint={`${pct(operatingMarginPct)} operating margin`}
          tone={operatingIncome >= 0 ? "up" : "down"}
        />
        <Kpi
          label="Net Operating Income"
          value={usd(netIncome)}
          hint={`${pct(netMarginPct)} net margin`}
          tone={netIncome >= 0 ? "up" : "down"}
        />
      </section>

      {/* Statement Panel */}
      <Panel
        title={`Statement of Operations · Period Ended ${activeCompany.activePeriod}`}
        subtitle={`${activeCompany.name} · Functional Currency USD · ${activeCompany.basis} Basis`}
        aside={<Badge tone={netIncome >= 0 ? "up" : "down"}>Net Margin: {pct(netMarginPct)}</Badge>}
      >
        <div className="p-4">
          <Table>
            <thead>
              <tr className="border-b border-line/60">
                <Th>Accounting Line / Account Code</Th>
                <Th align="right">Credit / Revenue</Th>
                <Th align="right">Debit / Cost</Th>
                <Th align="right">Net Subtotal</Th>
              </tr>
            </thead>
            <tbody>
              {/* REVENUES */}
              <tr className="border-b border-line/40 bg-ink/[0.01]">
                <Td className="font-semibold text-ink pl-4">Revenues</Td>
                <Td />
                <Td />
                <Td />
              </tr>
              <tr className="border-b border-line/30 hover:bg-black/[0.01]">
                <Td className="pl-8 text-ink2">4000 · Service & Consulting Revenue</Td>
                <Td align="right" className="font-mono text-[12px]">
                  {usd(serviceRevenue)}
                </Td>
                <Td align="right" className="font-mono text-[12px] text-ink3">
                  —
                </Td>
                <Td align="right" className="font-mono text-[12px]">
                  {usd(serviceRevenue)}
                </Td>
              </tr>
              <tr className="border-b border-line/30 hover:bg-black/[0.01]">
                <Td className="pl-8 text-ink2">4100 · Product Sales Revenue</Td>
                <Td align="right" className="font-mono text-[12px]">
                  {usd(productRevenue)}
                </Td>
                <Td align="right" className="font-mono text-[12px] text-ink3">
                  —
                </Td>
                <Td align="right" className="font-mono text-[12px]">
                  {usd(productRevenue)}
                </Td>
              </tr>
              <tr className="border-b border-line/50 bg-ink/[0.02] font-semibold">
                <Td className="pl-6 text-ink">Total Operating Revenues</Td>
                <Td align="right" className="font-mono">
                  {usd(totalRevenue)}
                </Td>
                <Td align="right" className="text-ink3">
                  —
                </Td>
                <Td align="right" className="font-mono font-bold">
                  {usd(totalRevenue)}
                </Td>
              </tr>

              {/* COGS */}
              <tr className="border-b border-line/40 bg-ink/[0.01]">
                <Td className="font-semibold text-ink pl-4 pt-2">Cost of Goods Sold (COGS)</Td>
                <Td />
                <Td />
                <Td />
              </tr>
              <tr className="border-b border-line/30 hover:bg-black/[0.01]">
                <Td className="pl-8 text-ink2">
                  5000 · Direct Merchandise Costs ({activeCompany.costMethod})
                </Td>
                <Td align="right" className="text-ink3">
                  —
                </Td>
                <Td align="right" className="font-mono text-[12px]">
                  {usd(cogs)}
                </Td>
                <Td align="right" className="font-mono text-[12px] text-down">
                  ({usd(cogs)})
                </Td>
              </tr>
              <tr className="border-b-2 border-line bg-ink/[0.03] font-bold">
                <Td className="pl-6 text-ink uppercase">Gross Profit</Td>
                <Td />
                <Td />
                <Td align="right" className="font-mono font-bold text-ink text-[13px]">
                  {usd(grossProfit)}
                </Td>
              </tr>

              {/* OPERATING EXPENSES */}
              <tr className="border-b border-line/40 bg-ink/[0.01]">
                <Td className="font-semibold text-ink pl-4 pt-2">Operating Expenses</Td>
                <Td />
                <Td />
                <Td />
              </tr>
              <tr className="border-b border-line/30 hover:bg-black/[0.01]">
                <Td className="pl-8 text-ink2">6100 · Selling & Marketing</Td>
                <Td align="right" className="text-ink3">
                  —
                </Td>
                <Td align="right" className="font-mono text-[12px]">
                  {usd(sellingExpense)}
                </Td>
                <Td align="right" className="font-mono text-[12px]">
                  ({usd(sellingExpense)})
                </Td>
              </tr>
              <tr className="border-b border-line/30 hover:bg-black/[0.01]">
                <Td className="pl-8 text-ink2">
                  6200 · General & Administrative (Rent, Legal, Software)
                </Td>
                <Td align="right" className="text-ink3">
                  —
                </Td>
                <Td align="right" className="font-mono text-[12px]">
                  {usd(adminExpense)}
                </Td>
                <Td align="right" className="font-mono text-[12px]">
                  ({usd(adminExpense)})
                </Td>
              </tr>
              <tr className="border-b border-line/50 bg-ink/[0.02] font-semibold">
                <Td className="pl-6 text-ink">Total Operating Expenses</Td>
                <Td align="right" className="text-ink3">
                  —
                </Td>
                <Td align="right" className="font-mono">
                  {usd(totalOpEx)}
                </Td>
                <Td align="right" className="font-mono font-bold text-down">
                  ({usd(totalOpEx)})
                </Td>
              </tr>

              {/* OPERATING INCOME */}
              <tr className="border-b border-line/60 bg-ink/[0.03] font-semibold">
                <Td className="pl-6 text-ink">Operating Income (EBIT)</Td>
                <Td />
                <Td />
                <Td align="right" className="font-mono font-bold">
                  {usd(operatingIncome)}
                </Td>
              </tr>

              {/* OTHER INCOME / EXPENSE */}
              <tr className="border-b border-line/40 bg-ink/[0.01]">
                <Td className="font-semibold text-ink pl-4 pt-2">Other Income & Expenses</Td>
                <Td />
                <Td />
                <Td />
              </tr>
              <tr className="border-b border-line/30 hover:bg-black/[0.01]">
                <Td className="pl-8 text-ink2">6300 · Realized Foreign Exchange Gain / Loss</Td>
                <Td align="right" className="font-mono text-[12px]">
                  {totalFXVariance > 0 ? usd(totalFXVariance) : "—"}
                </Td>
                <Td align="right" className="font-mono text-[12px]">
                  {totalFXVariance < 0 ? usd(Math.abs(totalFXVariance)) : "—"}
                </Td>
                <Td
                  align="right"
                  className={`font-mono text-[12px] font-semibold ${totalFXVariance >= 0 ? "text-up" : "text-down"}`}
                >
                  {acct(totalFXVariance)}
                </Td>
              </tr>

              {/* NET INCOME */}
              <tr className="border-t-2 border-line bg-ink/[0.05] font-bold text-[13.5px]">
                <Td className="pl-4 text-ink uppercase">Net Operating Income</Td>
                <Td />
                <Td />
                <Td
                  align="right"
                  className={`font-mono text-[14px] ${netIncome >= 0 ? "text-up" : "text-down"}`}
                >
                  {usd(netIncome)}
                </Td>
              </tr>
            </tbody>
          </Table>

          <div className="mt-4 border-t border-line/50 pt-3">
            <Note tone="brand">
              Statement generated directly from General Ledger journal lines. Sales taxes collected
              are excluded from revenue and held in Account 2200 (Sales Tax Payable) until remitted.
            </Note>
          </div>
        </div>
      </Panel>
    </div>
  );
}
