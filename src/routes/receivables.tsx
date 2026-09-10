import { createFileRoute } from "@tanstack/react-router";
import { useAccounting } from "@/lib/accounting-store";
import { Badge, Kpi, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, formatDate, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/receivables")({
  head: () =>
    pageHead(
      "Accounts Receivable Aging · LedgerX",
      "Aging schedule of customer receivables categorizing balances by days past invoice due date."
    ),
  component: ReceivablesPage,
});

function ReceivablesPage() {
  const { activeCompany, invoices } = useAccounting();

  const openInvoices = invoices.filter((i) => i.status !== "Paid");

  // Calculate Aging Buckets based on current date (assume reference date: 2026-12-22)
  const refDate = new Date("2026-12-22").getTime();

  const categorized = openInvoices.map((inv) => {
    const dueTime = new Date(inv.dueDate).getTime();
    const diffDays = Math.floor((refDate - dueTime) / (1000 * 60 * 60 * 24));

    let bucket: "Current" | "1-30 Days" | "31-60 Days" | "61-90 Days" | "90+ Days" = "Current";
    if (diffDays > 90) bucket = "90+ Days";
    else if (diffDays > 60) bucket = "61-90 Days";
    else if (diffDays > 30) bucket = "31-60 Days";
    else if (diffDays > 0) bucket = "1-30 Days";

    return { ...inv, diffDays, bucket };
  });

  const totalAR = openInvoices.reduce((s, i) => s + i.total, 0);
  const currentTotal = categorized.filter((i) => i.bucket === "Current").reduce((s, i) => s + i.total, 0);
  const b1_30 = categorized.filter((i) => i.bucket === "1-30 Days").reduce((s, i) => s + i.total, 0);
  const b31_60 = categorized.filter((i) => i.bucket === "31-60 Days").reduce((s, i) => s + i.total, 0);
  const b61_plus = categorized.filter((i) => i.bucket === "61-90 Days" || i.bucket === "90+ Days").reduce((s, i) => s + i.total, 0);

  const handleExportCsv = () => {
    const headers = ["Invoice ID", "Customer", "Issue Date", "Due Date", "Days Past Due", "Aging Bucket", "Amount (USD)", "Status"];
    const rows = categorized.map((i) => [
      i.id,
      i.customerName,
      i.date,
      i.dueDate,
      i.diffDays > 0 ? i.diffDays : 0,
      i.bucket,
      i.total,
      i.status,
    ]);
    exportToCsv(`${activeCompany.id}_ar_aging`, headers, rows);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
        <PageTitle
          title="Accounts Receivable Aging Position"
          description={`Customer credit aging analysis for ${activeCompany.name} as of December 22, 2026`}
        />
        <button
          type="button"
          onClick={handleExportCsv}
          className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs"
        >
          Export Aging Schedule (CSV)
        </button>
      </div>

      {/* KPI Buckets */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Current (Not Due)"
          value={usd(currentTotal)}
          hint="Within regular payment terms"
          tone="up"
        />
        <Kpi
          label="1-30 Days Overdue"
          value={usd(b1_30)}
          hint="First reminder cycle"
          tone={b1_30 > 0 ? "neutral" : "up"}
        />
        <Kpi
          label="31-60 Days Overdue"
          value={usd(b31_60)}
          hint="Secondary follow-up"
          tone={b31_60 > 0 ? "down" : "neutral"}
        />
        <Kpi
          label="61+ Days Overdue"
          value={usd(b61_plus)}
          hint="CECL reserve consideration"
          tone={b61_plus > 0 ? "down" : "neutral"}
        />
      </section>

      {/* Aging Table */}
      <Panel
        title="Customer Aging Detail"
        subtitle={`${openInvoices.length} open customer balances totaling ${usd(totalAR)}`}
      >
        <Table>
          <thead>
            <tr className="border-b border-line/60">
              <Th>Customer</Th>
              <Th>Invoice #</Th>
              <Th>Due Date</Th>
              <Th>Aging Category</Th>
              <Th align="right">Days Overdue</Th>
              <Th align="right">Open Balance</Th>
            </tr>
          </thead>
          <tbody>
            {categorized.map((inv) => (
              <tr key={inv.id} className="border-b border-line/40 last:border-0 hover:bg-black/[0.01]">
                <Td className="font-medium text-ink">
                  {inv.customerName}
                  {inv.taxExempt && (
                    <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-brand">
                      Tax Exempt
                    </span>
                  )}
                </Td>
                <Td className="font-mono text-[11.5px] text-ink2">{inv.id}</Td>
                <Td className="text-ink3 text-[11.5px]">{formatDate(inv.dueDate)}</Td>
                <Td>
                  <Badge
                    tone={
                      inv.bucket === "Current"
                        ? "up"
                        : inv.bucket === "1-30 Days"
                        ? "brand"
                        : "down"
                    }
                  >
                    {inv.bucket}
                  </Badge>
                </Td>
                <Td align="right" className="font-mono text-[11.5px] text-ink3">
                  {inv.diffDays > 0 ? `${inv.diffDays}d` : "Current"}
                </Td>
                <Td align="right" className="font-mono font-medium text-[12.5px]">
                  {usd(inv.total)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
