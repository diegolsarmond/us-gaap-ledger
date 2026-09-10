import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/balance-sheet")({
  head: () =>
    pageHead(
      "Classified Balance Sheet · LedgerX",
      "US GAAP Statement of Financial Position verifying Assets equal Liabilities plus Stockholders' Equity."
    ),
  component: BalanceSheetPage,
});

function BalanceSheetPage() {
  const { activeCompany, accountBalances, netIncome } = useAccounting();
  const [asOfDate, setAsOfDate] = useState("2026-12-31");

  // Assets
  const cashOperating = accountBalances["1000"]?.net || 0;
  const cashReserve = accountBalances["1050"]?.net || 0;
  const totalCash = cashOperating + cashReserve;

  const arTrade = accountBalances["1100"]?.net || 0;
  const allowanceDoubtful = accountBalances["1200"]?.net || 0;
  const netAr = arTrade - allowanceDoubtful;

  const inventoryAsset = accountBalances["1300"]?.net || 0;
  const prepaids = accountBalances["1400"]?.net || 0;

  const totalCurrentAssets = totalCash + netAr + inventoryAsset + prepaids;
  const totalAssets = totalCurrentAssets; // No non-current assets in current MVP scope

  // Liabilities
  const apTrade = accountBalances["2000"]?.net || 0;
  const creditCardAp = accountBalances["2100"]?.net || 0;
  const salesTaxPayable = accountBalances["2200"]?.net || 0;
  const accruedPayroll = accountBalances["2300"]?.net || 0;

  const totalCurrentLiabilities = apTrade + creditCardAp + salesTaxPayable + accruedPayroll;
  const totalLiabilities = totalCurrentLiabilities;

  // Equity
  const ownersCapital = accountBalances["3000"]?.net || 0;
  const retainedEarnings = accountBalances["3100"]?.net || 0;
  const currentNetIncome = netIncome;

  const totalEquity = ownersCapital + retainedEarnings + currentNetIncome;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  const diff = Math.round(Math.abs(totalAssets - totalLiabilitiesAndEquity) * 100) / 100;
  const isBalanced = diff < 0.05;

  const handleExportCsv = () => {
    const headers = ["Financial Statement Section", "Account Code", "Line Description", "Amount ($)"];
    const rows: (string | number)[][] = [
      ["Current Assets", "1000/1050", "Cash & Cash Equivalents", totalCash],
      ["Current Assets", "1100", "Accounts Receivable, net", netAr],
      ["Current Assets", "1300", "Merchandise Inventory", inventoryAsset],
      ["Current Assets", "1400", "Prepaid Expenses & Deposits", prepaids],
      ["Total Assets", "", "TOTAL ASSETS", totalAssets],
      ["Current Liabilities", "2000", "Accounts Payable (Trade)", apTrade],
      ["Current Liabilities", "2100", "Credit Card Payable (Amex)", creditCardAp],
      ["Current Liabilities", "2200", "Sales Tax Payable", salesTaxPayable],
      ["Current Liabilities", "2300", "Accrued Payroll & Taxes", accruedPayroll],
      ["Total Liabilities", "", "TOTAL LIABILITIES", totalLiabilities],
      ["Stockholders' Equity", "3000", "Owner's Equity / Paid-in Capital", ownersCapital],
      ["Stockholders' Equity", "3100", "Retained Earnings (Beginning)", retainedEarnings],
      ["Stockholders' Equity", "P&L", "Current Period Net Income", currentNetIncome],
      ["Total Equity", "", "TOTAL EQUITY", totalEquity],
      ["Total Liabilities & Equity", "", "TOTAL LIABILITIES & STOCKHOLDERS' EQUITY", totalLiabilitiesAndEquity],
    ];

    exportToCsv(`${activeCompany.id}_balance_sheet`, headers, rows);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
        <div>
          <PageTitle
            title="Classified Balance Sheet"
            description={`Statement of Financial Position for ${activeCompany.name} · US GAAP Standard`}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[12px] bg-white px-2 py-1 rounded ring-1 ring-line">
            <span className="text-ink3">As of:</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="outline-none bg-transparent font-medium"
            />
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs"
          >
            Export (CSV)
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-brand px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-95 shadow-2xs"
          >
            Print Statement
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          label="Total Assets"
          value={usd(totalAssets)}
          hint="Current & Liquid resources"
          tone="up"
        />
        <Kpi
          label="Total Liabilities"
          value={usd(totalLiabilities)}
          hint="Trade payables & taxes owed"
          tone="neutral"
        />
        <Kpi
          label="Stockholders' / Member Equity"
          value={usd(totalEquity)}
          hint={`Including ${usd(currentNetIncome)} net income`}
          tone="up"
        />
      </section>

      {/* Balance Sheet Statement Table */}
      <Panel
        title={`Balance Sheet as of ${asOfDate}`}
        subtitle={`${activeCompany.name} · Prepared on Accrual Basis under US GAAP`}
        aside={
          <Badge tone={isBalanced ? "up" : "down"}>
            {isBalanced ? "Assets = Liabilities + Equity (Balanced)" : `Out of balance by ${usd(diff)}`}
          </Badge>
        }
      >
        <div className="p-4 space-y-6">
          {/* ASSETS SECTION */}
          <div>
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-ink border-b-2 border-line pb-1 mb-2">
              Assets
            </h3>
            <Table>
              <tbody>
                <tr className="border-b border-line/40">
                  <Td className="pl-4 font-semibold text-ink">Current Assets</Td>
                  <Td />
                </tr>
                <tr className="border-b border-line/30 hover:bg-black/[0.01]">
                  <Td className="pl-8 text-ink2">Cash and cash equivalents (Chase & Reserves)</Td>
                  <Td align="right" className="font-mono text-[12px]">
                    {usd(totalCash)}
                  </Td>
                </tr>
                <tr className="border-b border-line/30 hover:bg-black/[0.01]">
                  <Td className="pl-8 text-ink2">Accounts receivable, net of allowance</Td>
                  <Td align="right" className="font-mono text-[12px]">
                    {usd(netAr)}
                  </Td>
                </tr>
                <tr className="border-b border-line/30 hover:bg-black/[0.01]">
                  <Td className="pl-8 text-ink2">Merchandise inventory (valued at {activeCompany.costMethod})</Td>
                  <Td align="right" className="font-mono text-[12px]">
                    {usd(inventoryAsset)}
                  </Td>
                </tr>
                <tr className="border-b border-line/30 hover:bg-black/[0.01]">
                  <Td className="pl-8 text-ink2">Prepaid expenses and facility deposits</Td>
                  <Td align="right" className="font-mono text-[12px]">
                    {usd(prepaids)}
                  </Td>
                </tr>
                <tr className="border-t border-line/60 bg-ink/[0.02] font-semibold">
                  <Td className="pl-6 text-ink">Total Current Assets</Td>
                  <Td align="right" className="font-mono font-bold text-[12.5px]">
                    {usd(totalCurrentAssets)}
                  </Td>
                </tr>
                <tr className="border-t-2 border-line bg-ink/[0.04] font-bold text-[13px]">
                  <Td className="pl-4 text-ink uppercase">Total Assets</Td>
                  <Td align="right" className="font-mono text-brand text-[13.5px]">
                    {usd(totalAssets)}
                  </Td>
                </tr>
              </tbody>
            </Table>
          </div>

          {/* LIABILITIES SECTION */}
          <div>
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-ink border-b-2 border-line pb-1 mb-2">
              Liabilities & Stockholders' Equity
            </h3>
            <Table>
              <tbody>
                <tr className="border-b border-line/40">
                  <Td className="pl-4 font-semibold text-ink">Current Liabilities</Td>
                  <Td />
                </tr>
                <tr className="border-b border-line/30 hover:bg-black/[0.01]">
                  <Td className="pl-8 text-ink2">Accounts payable (Trade vendor obligations)</Td>
                  <Td align="right" className="font-mono text-[12px]">
                    {usd(apTrade)}
                  </Td>
                </tr>
                <tr className="border-b border-line/30 hover:bg-black/[0.01]">
                  <Td className="pl-8 text-ink2">Corporate credit card payable (Amex)</Td>
                  <Td align="right" className="font-mono text-[12px]">
                    {usd(creditCardAp)}
                  </Td>
                </tr>
                <tr className="border-b border-line/30 hover:bg-black/[0.01]">
                  <Td className="pl-8 text-ink2">Sales tax payable (State and county DOR)</Td>
                  <Td align="right" className="font-mono text-[12px]">
                    {usd(salesTaxPayable)}
                  </Td>
                </tr>
                <tr className="border-b border-line/30 hover:bg-black/[0.01]">
                  <Td className="pl-8 text-ink2">Accrued payroll and compensation</Td>
                  <Td align="right" className="font-mono text-[12px]">
                    {usd(accruedPayroll)}
                  </Td>
                </tr>
                <tr className="border-t border-line/60 bg-ink/[0.02] font-semibold">
                  <Td className="pl-6 text-ink">Total Current Liabilities</Td>
                  <Td align="right" className="font-mono font-bold text-[12.5px]">
                    {usd(totalLiabilities)}
                  </Td>
                </tr>

                {/* EQUITY SECTION */}
                <tr className="border-b border-line/40 pt-3">
                  <Td className="pl-4 font-semibold text-ink pt-3">Stockholders' / Member Equity</Td>
                  <Td />
                </tr>
                <tr className="border-b border-line/30 hover:bg-black/[0.01]">
                  <Td className="pl-8 text-ink2">Paid-in capital / Members' contribution</Td>
                  <Td align="right" className="font-mono text-[12px]">
                    {usd(ownersCapital)}
                  </Td>
                </tr>
                <tr className="border-b border-line/30 hover:bg-black/[0.01]">
                  <Td className="pl-8 text-ink2">Retained earnings (Beginning of period)</Td>
                  <Td align="right" className="font-mono text-[12px]">
                    {usd(retainedEarnings)}
                  </Td>
                </tr>
                <tr className="border-b border-line/30 hover:bg-black/[0.01]">
                  <Td className="pl-8 text-ink2">Current fiscal period net income (from P&L)</Td>
                  <Td align="right" className="font-mono text-[12px] text-up font-semibold">
                    {usd(currentNetIncome)}
                  </Td>
                </tr>
                <tr className="border-t border-line/60 bg-ink/[0.02] font-semibold">
                  <Td className="pl-6 text-ink">Total Stockholders' Equity</Td>
                  <Td align="right" className="font-mono font-bold text-[12.5px]">
                    {usd(totalEquity)}
                  </Td>
                </tr>

                {/* TOTAL LIABILITIES & EQUITY */}
                <tr className="border-t-2 border-line bg-ink/[0.04] font-bold text-[13px]">
                  <Td className="pl-4 text-ink uppercase">Total Liabilities & Equity</Td>
                  <Td align="right" className="font-mono text-brand text-[13.5px]">
                    {usd(totalLiabilitiesAndEquity)}
                  </Td>
                </tr>
              </tbody>
            </Table>
          </div>

          <div className="pt-2">
            <Note tone="brand">
              Fundamental US GAAP Balance Equation: Total Assets ($
              {totalAssets.toLocaleString()}) must equal Total Liabilities & Stockholders' Equity ($
              {totalLiabilitiesAndEquity.toLocaleString()}). Net income from operations seamlessly carries over into ending equity without spreadsheet reconciliation.
            </Note>
          </div>
        </div>
      </Panel>
    </div>
  );
}
