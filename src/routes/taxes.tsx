import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/taxes")({
  head: () =>
    pageHead(
      "Sales Tax Collection & Filing · LedgerX",
      "State and county sales tax collection summary, taxable versus exempt proceeds, and payment receipt archives.",
    ),
  component: TaxesPage,
});

function TaxesPage() {
  const { activeCompany, taxes, invoices, accountBalances, recordTaxRemittance, userPersona } =
    useAccounting();

  // Manual Tax Calculator
  const [calcBase, setCalcBase] = useState("50000");
  const [calcStateRate, setCalcStateRate] = useState("6.0");
  const [calcCountyRate, setCalcCountyRate] = useState("1.0");

  const totalCalcRate = (Number(calcStateRate) || 0) + (Number(calcCountyRate) || 0);
  const calculatedTax = (Number(calcBase) || 0) * (totalCalcRate / 100);

  // Compute live tax collection stats from issued invoices
  const totalTaxableSales = invoices
    .filter((i) => !i.taxExempt)
    .reduce((s, i) => s + i.subtotal, 0);

  const totalExemptSales = invoices.filter((i) => i.taxExempt).reduce((s, i) => s + i.subtotal, 0);

  const totalSalesTaxCollected = invoices.reduce((s, i) => s + i.taxAmount, 0);
  const salesTaxPayableBalance = accountBalances["2200"]?.net || 0;

  const handleRemitPayment = (taxId: string) => {
    const fileName = window.prompt(
      "Enter payment confirmation file name or receipt number:",
      `Receipt_FL_DOR_Confirmation_${Date.now()}.pdf`,
    );
    if (!fileName) return;

    recordTaxRemittance(taxId, fileName);
    alert(`Remittance payment posted! Debited Sales Tax Payable (2200) and credited Cash (1000).`);
  };

  const handleExportCsv = () => {
    const headers = [
      "Jurisdiction",
      "Filing Period",
      "Taxable Base ($)",
      "Statutory Rate",
      "Due / Remitted ($)",
      "Status",
      "Receipt Attachment",
    ];
    const rows = taxes.map((t) => [
      t.jurisdiction,
      t.period,
      t.taxableBase,
      t.rate,
      t.dueAmount,
      t.status,
      t.receiptFileName || "Pending",
    ]);
    exportToCsv(`${activeCompany.id}_sales_tax_filing`, headers, rows);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
        <PageTitle
          title="Sales Tax Collection & Compliance Summary"
          description={`State and county manual tax ledger for ${activeCompany.name} · Account 2200`}
        />
        <button
          type="button"
          onClick={handleExportCsv}
          className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs"
        >
          Export Tax Summary (CSV)
        </button>
      </div>

      {/* KPI Row */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Sales Tax Payable Balance"
          value={usd(salesTaxPayableBalance)}
          hint="Account 2200 · Due to revenue departments"
          tone={salesTaxPayableBalance > 0 ? "neutral" : "up"}
        />
        <Kpi
          label="Taxable Gross Sales MTD"
          value={usd(totalTaxableSales)}
          hint="Non-exempt customer sales"
          tone="up"
        />
        <Kpi
          label="Tax-Exempt Customer Sales"
          value={usd(totalExemptSales)}
          hint="Exemption certificates on file"
          tone="neutral"
        />
        <Kpi
          label="Total Tax Collected MTD"
          value={usd(totalSalesTaxCollected)}
          hint="Held as fiduciary liability"
          tone="neutral"
        />
      </section>

      {/* Main Grid: Tax Filings Register & Manual Calculator */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Tax Returns & Remittances Table */}
        <div className="lg:col-span-8 space-y-3">
          <Panel
            title="State & Federal Tax Remittances"
            subtitle="Manual tax filing archive with statutory payment receipts"
          >
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr className="border-b border-line/60">
                    <Th>Taxing Jurisdiction</Th>
                    <Th>Period</Th>
                    <Th align="right">Taxable Base</Th>
                    <Th>Alíquota / Rate</Th>
                    <Th align="right">Tax Due</Th>
                    <Th>Payment Receipt</Th>
                    <Th align="right">Status</Th>
                    <Th align="center">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {taxes.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-line/40 last:border-0 hover:bg-black/[0.01]"
                    >
                      <Td className="font-medium text-ink text-[12px] max-w-[200px] truncate">
                        {t.jurisdiction}
                      </Td>
                      <Td className="font-mono text-ink3 text-[11.5px]">{t.period}</Td>
                      <Td align="right" className="font-mono text-[12px]">
                        {usd(t.taxableBase)}
                      </Td>
                      <Td className="text-ink2 text-[11px]">{t.rate}</Td>
                      <Td align="right" className="font-mono font-medium text-[12px]">
                        {usd(t.dueAmount)}
                      </Td>
                      <Td className="font-mono text-[11px] text-ink3">
                        {t.receiptFileName ? (
                          <span className="text-brand hover:underline cursor-pointer">
                            {t.receiptFileName}
                          </span>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td align="right">
                        <Badge tone={t.status === "Paid" ? "up" : "brand"}>{t.status}</Badge>
                      </Td>
                      <Td align="center">
                        {t.status !== "Paid" && !userPersona.allowedReportsOnly && (
                          <button
                            type="button"
                            onClick={() => handleRemitPayment(t.id)}
                            className="rounded bg-brand px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90 shadow-2xs"
                          >
                            Remit & Attach
                          </button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="p-4 border-t border-line/50">
              <Note tone="brand">
                US Tax Rule: Payments are executed manually on the Florida DOR or IRS e-Services
                portal. LedgerX registers the payable clearance and stores the official PDF
                confirmation receipt. No direct government transmissions are performed in the MVP.
              </Note>
            </div>
          </Panel>
        </div>

        {/* Manual Tax Estimator */}
        <div className="lg:col-span-4">
          <Panel title="Manual Sales Tax Estimator" subtitle="Jurisdiction calculation assistant">
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                  Gross Billable Base ($)
                </label>
                <input
                  type="number"
                  value={calcBase}
                  onChange={(e) => setCalcBase(e.target.value)}
                  className="mt-1 w-full rounded bg-white px-2.5 py-1.5 text-right font-mono text-[12px] ring-1 ring-line outline-none focus:ring-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                    State Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={calcStateRate}
                    onChange={(e) => setCalcStateRate(e.target.value)}
                    className="mt-1 w-full rounded bg-white px-2 py-1.5 text-right font-mono text-[12px] ring-1 ring-line"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                    County Discretionary (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={calcCountyRate}
                    onChange={(e) => setCalcCountyRate(e.target.value)}
                    className="mt-1 w-full rounded bg-white px-2 py-1.5 text-right font-mono text-[12px] ring-1 ring-line"
                  />
                </div>
              </div>

              <div className="rounded-lg bg-ink/[0.03] p-3 space-y-1.5 text-[12px] font-mono">
                <div className="flex justify-between">
                  <span className="font-sans text-ink3">Combined Rate:</span>
                  <span>{totalCalcRate.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between border-t border-line/60 pt-1 font-semibold text-[13px]">
                  <span className="font-sans text-ink">Estimated Tax:</span>
                  <span className="text-brand">{usd(calculatedTax)}</span>
                </div>
              </div>

              <div className="text-[11px] text-ink3 leading-relaxed">
                Sales tax is configured manually per invoice according to the customer delivery
                address state and municipal jurisdiction.
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
