import { createFileRoute } from "@tanstack/react-router";
import { useAccounting } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, dash, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/trial-balance")({
  head: () =>
    pageHead(
      "Adjusted Trial Balance · LedgerX",
      "US GAAP Trial Balance summarizing cumulative debit and credit ledger balances to prove double-entry mathematical equality.",
    ),
  component: TrialBalancePage,
});

function TrialBalancePage() {
  const {
    activeCompany,
    accounts,
    accountBalances,
    totalDebitSum,
    totalCreditSum,
    isLedgerBalanced,
  } = useAccounting();

  // For trial balance, compute un-netted debits and credits for each account from posted journals
  const trialRows = accounts.map((a) => {
    const bal = accountBalances[a.code] || { debit: 0, credit: 0, net: 0 };
    return {
      code: a.code,
      name: a.name,
      type: a.type,
      balanceType: a.balanceType,
      debit: bal.debit,
      credit: bal.credit,
      net: bal.net,
    };
  });

  const handleExportCsv = () => {
    const headers = [
      "Account Code",
      "Account Name",
      "Account Type",
      "Total Debits ($)",
      "Total Credits ($)",
      "Net Balance ($)",
    ];
    const rows = trialRows.map((r) => [r.code, r.name, r.type, r.debit, r.credit, r.net]);
    exportToCsv(`${activeCompany.id}_trial_balance`, headers, rows);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
        <PageTitle
          title="Adjusted Trial Balance"
          description={`Cumulative debit and credit verification for ${activeCompany.name} · Period ${activeCompany.activePeriod}`}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs"
          >
            Export Trial Balance (CSV)
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-brand px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-95 shadow-2xs"
          >
            Print
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          label="Total General Ledger Debits"
          value={usd(totalDebitSum)}
          hint="Sum of all debit journal postings"
          tone="neutral"
        />
        <Kpi
          label="Total General Ledger Credits"
          value={usd(totalCreditSum)}
          hint="Sum of all credit journal postings"
          tone="neutral"
        />
        <Kpi
          label="Mathematical Equality (Δ)"
          value={usd(Math.abs(totalDebitSum - totalCreditSum))}
          hint={isLedgerBalanced ? "Ledger is in perfect balance" : "Out of balance warning!"}
          tone={isLedgerBalanced ? "up" : "down"}
        />
      </section>

      {/* Trial Balance Table */}
      <Panel
        title={`Trial Balance as of Period ${activeCompany.activePeriod}`}
        subtitle={`${activeCompany.name} · US GAAP Standard Format`}
        aside={
          <Badge tone={isLedgerBalanced ? "up" : "down"}>
            {isLedgerBalanced ? "Debits = Credits (Balanced)" : "Discrepancy Detected"}
          </Badge>
        }
      >
        <div className="p-4">
          <Table>
            <thead>
              <tr className="border-b border-line/60">
                <Th>Account Code</Th>
                <Th>Account Name</Th>
                <Th>Classification</Th>
                <Th align="right">Debit ($)</Th>
                <Th align="right">Credit ($)</Th>
              </tr>
            </thead>
            <tbody>
              {trialRows.map((row) => (
                <tr
                  key={row.code}
                  className="border-b border-line/40 last:border-0 hover:bg-black/[0.01]"
                >
                  <Td className="font-mono text-[12px] font-semibold text-ink">{row.code}</Td>
                  <Td className="text-ink2 font-medium text-[12px]">{row.name}</Td>
                  <Td className="text-ink3 text-[11px]">{row.type}</Td>
                  <Td align="right" className="font-mono text-[12px]">
                    {dash(row.debit)}
                  </Td>
                  <Td align="right" className="font-mono text-[12px]">
                    {dash(row.credit)}
                  </Td>
                </tr>
              ))}

              {/* Totals Row */}
              <tr className="border-t-2 border-line bg-ink/[0.04] font-bold text-[13px]">
                <Td colSpan={3} className="pl-4 uppercase text-ink">
                  Total Ledger Debits & Credits
                </Td>
                <Td align="right" className="font-mono text-ink text-[13.5px]">
                  {usd(totalDebitSum)}
                </Td>
                <Td align="right" className="font-mono text-ink text-[13.5px]">
                  {usd(totalCreditSum)}
                </Td>
              </tr>
            </tbody>
          </Table>

          <div className="mt-4 border-t border-line/50 pt-3">
            <Note tone="brand">
              Under US GAAP, the Trial Balance proves the fundamental mechanical integrity of
              double-entry posting: every debit is equal and opposite to its credited line.
            </Note>
          </div>
        </div>
      </Panel>
    </div>
  );
}
