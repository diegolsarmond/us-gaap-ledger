import { createFileRoute, Link } from "@tanstack/react-router";
import { useAccounting } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { acct, dash, pct, usd, formatDate } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/")({
  head: () =>
    pageHead(
      "Financial Operations Dashboard · LedgerX",
      "Real-time US GAAP financial ledger dashboard with double-entry audit trails and multi-currency tracking.",
    ),
  component: Dashboard,
});

function Dashboard() {
  const {
    activeCompany,
    cashOnHand,
    totalRevenue,
    totalCOGS,
    grossProfit,
    totalOpEx,
    totalFXVariance,
    netIncome,
    journals,
    isLedgerBalanced,
    bills,
    invoices,
    projects,
    userPersona,
  } = useAccounting();

  const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const netMarginPct = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0;

  const recentJournals = journals.slice(0, 6);
  const openInvoicesCount = invoices.filter(
    (i) => i.status === "Open" || i.status === "Overdue",
  ).length;
  const openBillsCount = bills.filter((b) => b.status === "Open").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
        <div>
          <PageTitle
            title={`${activeCompany.name} · Operations Overview`}
            description={`US GAAP Accrual Books · Fiscal Period ${activeCompany.activePeriod} · Functional Currency USD`}
          />
        </div>

        {/* Action Shortcuts for Staff & Admins */}
        {!userPersona.allowedReportsOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/invoices"
              className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs"
            >
              + New Invoice
            </Link>
            <Link
              to="/payables"
              className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs"
            >
              + Enter Bill
            </Link>
            <Link
              to="/journals"
              className="rounded-md bg-brand px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-90 shadow-2xs"
            >
              + Post Journal
            </Link>
          </div>
        )}
      </div>

      {/* Period Lock Banner if Locked */}
      {activeCompany.isPeriodClosed && (
        <div className="rounded-lg bg-down/[0.08] p-3 text-down ring-1 ring-down/20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12.5px]">
            <span className="size-2 rounded-full bg-down animate-pulse" />
            <span className="font-semibold">
              Fiscal Period {activeCompany.activePeriod} is Locked:
            </span>
            <span>
              Routine entries blocked. Only authorized CPA/Admin overrides with documented audit
              justifications are accepted.
            </span>
          </div>
          <Badge tone="down">LOCKED</Badge>
        </div>
      )}

      {/* Core KPIs */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Cash & Liquid Reserves"
          value={usd(cashOnHand)}
          hint="Operating & Reserve accounts"
          tone="up"
        />
        <Kpi
          label="Gross Revenue (YTD/MTD)"
          value={usd(totalRevenue)}
          hint={`${openInvoicesCount} open customer receivables`}
          tone="up"
        />
        <Kpi
          label="COGS & Direct Costs"
          value={usd(totalCOGS)}
          hint={`Gross Margin: ${pct(grossMarginPct)}`}
          tone="neutral"
        />
        <Kpi
          label="Net Operating Income"
          value={usd(netIncome)}
          hint={`Net Margin: ${pct(netMarginPct)}`}
          tone={netIncome >= 0 ? "up" : "down"}
        />
      </section>

      {/* Second Row: Ledger Status & Operational Highlights */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Recent Journal Entries */}
        <Panel
          className="lg:col-span-2"
          title="General Ledger Activity"
          subtitle={`Most recent double-entry journals (${journals.length} total entries posted)`}
          aside={
            <Badge tone={isLedgerBalanced ? "up" : "down"}>
              {isLedgerBalanced ? "Balanced · Δ $0.00" : "Unbalanced Δ"}
            </Badge>
          }
        >
          <Table>
            <thead>
              <tr className="border-b border-line/60">
                <Th>Entry ID</Th>
                <Th>Date</Th>
                <Th>Description / Memo</Th>
                <Th>Type</Th>
                <Th align="right">Debits</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {recentJournals.map((j) => {
                const totalDebits = j.lines.reduce((s, l) => s + l.debit, 0);
                return (
                  <tr
                    key={j.id}
                    className="border-b border-line/40 last:border-0 hover:bg-black/[0.01]"
                  >
                    <Td className="font-mono text-[11.5px] font-semibold">{j.id}</Td>
                    <Td className="text-ink3 text-[11.5px]">{formatDate(j.date)}</Td>
                    <Td className="text-ink2 font-medium max-w-[240px] truncate">{j.memo}</Td>
                    <Td className="text-ink3 text-[11.5px]">
                      <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10.5px] ring-1 ring-line">
                        {j.sourceType}
                      </span>
                    </Td>
                    <Td align="right" className="font-mono font-medium">
                      {usd(totalDebits)}
                    </Td>
                    <Td align="right">
                      <Badge tone={j.status === "Posted" ? "up" : "neutral"}>{j.status}</Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div className="p-3 border-t border-line/50 flex items-center justify-between text-[11.5px]">
            <span className="text-ink3">
              Every operational invoice, bill, and payment writes directly to this ledger.
            </span>
            <Link to="/journals" className="text-brand font-medium hover:underline">
              View Full General Ledger →
            </Link>
          </div>
        </Panel>

        {/* FX Variance & Multi-Currency Panel */}
        <Panel
          title="Foreign Exchange (Realized)"
          subtitle="Account 6300 · Realized FX Gain/Loss"
          aside={
            <Badge tone={totalFXVariance >= 0 ? "up" : "down"}>
              {totalFXVariance >= 0 ? "Net Gain" : "Net Loss"}
            </Badge>
          }
        >
          <div className="p-4 space-y-3">
            <p className="text-[12px] text-ink2">
              Bills settled in foreign currencies (MXN, GBP, EUR) compute exchange gain or loss upon
              bank wire settlement.
            </p>

            <div className="rounded-lg bg-ink/[0.03] p-3 ring-1 ring-line/60 space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-ink3">Baja Components (MXN Wire)</span>
                <span className="font-medium text-up">+$35.04 (Gain)</span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-ink3">Pemberton Freight (GBP Bill)</span>
                <span className="font-mono text-ink2">0.7900 Rate</span>
              </div>
              <div className="flex items-center justify-between text-[12.5px] font-semibold border-t border-line/60 pt-2">
                <span>Net Realized FX Variance</span>
                <span
                  className={totalFXVariance >= 0 ? "text-up font-mono" : "text-down font-mono"}
                >
                  {acct(totalFXVariance)}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                Active Projects Health ({projects.length})
              </p>
              <div className="space-y-1.5 text-[11.5px]">
                {projects.slice(0, 2).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between border-b border-line/40 pb-1"
                  >
                    <span className="text-ink2 truncate max-w-[170px]">{p.name}</span>
                    <span className="font-medium text-ink">{usd(p.budget)}</span>
                  </div>
                ))}
              </div>
              <Link
                to="/projects"
                className="mt-2 block text-right text-[11px] font-medium text-brand hover:underline"
              >
                View Project Profitability →
              </Link>
            </div>
          </div>
        </Panel>
      </div>

      {/* Operational Highlights: AR vs AP */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Panel
          title="Accounts Receivable Snapshot"
          subtitle={`${openInvoicesCount} invoices pending collection`}
          aside={
            <Link to="/invoices" className="text-[11.5px] text-brand font-medium hover:underline">
              Manage AR →
            </Link>
          }
        >
          <Table>
            <thead>
              <tr className="border-b border-line/60">
                <Th>Invoice</Th>
                <Th>Customer</Th>
                <Th>Due Date</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.slice(0, 4).map((i) => (
                <tr key={i.id} className="border-b border-line/40 last:border-0">
                  <Td className="font-mono text-[11.5px] font-medium">{i.id}</Td>
                  <Td className="text-ink2 text-[12px]">{i.customerName}</Td>
                  <Td className="text-ink3 text-[11.5px]">{formatDate(i.dueDate)}</Td>
                  <Td align="right" className="font-medium font-mono">
                    {usd(i.total)}
                  </Td>
                  <Td align="right">
                    <Badge
                      tone={i.status === "Paid" ? "up" : i.status === "Overdue" ? "down" : "brand"}
                    >
                      {i.status}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>

        <Panel
          title="Accounts Payable Snapshot"
          subtitle={`${openBillsCount} vendor obligations pending payment`}
          aside={
            <Link to="/payables" className="text-[11.5px] text-brand font-medium hover:underline">
              Manage AP →
            </Link>
          }
        >
          <Table>
            <thead>
              <tr className="border-b border-line/60">
                <Th>Bill / Ref</Th>
                <Th>Vendor</Th>
                <Th>Due Date</Th>
                <Th align="right">USD Base</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {bills.slice(0, 4).map((b) => (
                <tr key={b.id} className="border-b border-line/40 last:border-0">
                  <Td className="font-mono text-[11.5px] font-medium">{b.id}</Td>
                  <Td className="text-ink2 text-[12px]">{b.vendorName}</Td>
                  <Td className="text-ink3 text-[11.5px]">{formatDate(b.dueDate)}</Td>
                  <Td align="right" className="font-medium font-mono">
                    {usd(b.usdAmount)}
                  </Td>
                  <Td align="right">
                    <Badge tone={b.status === "Paid" ? "up" : "brand"}>{b.status}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      </div>
    </div>
  );
}
