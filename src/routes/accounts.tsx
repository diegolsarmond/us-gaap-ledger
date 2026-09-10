import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting, type AccountType } from "@/lib/accounting-store";
import { Badge, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, dash, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/accounts")({
  head: () =>
    pageHead(
      "Chart of Accounts · LedgerX",
      "US GAAP standardized Chart of Accounts covering Assets, Liabilities, Equity, Revenue, COGS, and Expenses."
    ),
  component: AccountsPage,
});

function AccountsPage() {
  const { activeCompany, accounts, accountBalances, addAccount, userPersona } = useAccounting();

  // New Account Form State
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<AccountType>("Operating Expense");
  const [newBalanceType, setNewBalanceType] = useState<"Debit" | "Credit">("Debit");
  const [newDescription, setNewDescription] = useState("");

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode || !newName) return;

    // Check duplicate
    if (accounts.some((a) => a.code === newCode)) {
      alert(`Account with code ${newCode} already exists.`);
      return;
    }

    addAccount({
      code: newCode,
      name: newName,
      type: newType,
      balanceType: newBalanceType,
      description: newDescription,
    });

    setNewCode("");
    setNewName("");
    setNewDescription("");
    alert(`Account ${newCode} — ${newName} successfully added to Chart of Accounts!`);
  };

  const handleExportCsv = () => {
    const headers = ["Account Code", "Account Name", "Category / Type", "Normal Balance", "Description", "Current Net Balance ($)"];
    const rows = accounts.map((a) => [
      a.code,
      a.name,
      a.type,
      a.balanceType,
      a.description,
      accountBalances[a.code]?.net || 0,
    ]);
    exportToCsv(`${activeCompany.id}_chart_of_accounts`, headers, rows);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
        <PageTitle
          title="Chart of Accounts (COA)"
          description={`General ledger master structure for ${activeCompany.name} · US GAAP Standard`}
        />
        <button
          type="button"
          onClick={handleExportCsv}
          className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs"
        >
          Export COA (CSV)
        </button>
      </div>

      {/* Main Grid: COA Table & Add Account */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* COA Register */}
        <div className="lg:col-span-8 space-y-3">
          <Panel
            title="Master Chart of Accounts"
            subtitle={`${accounts.length} active ledger accounts`}
          >
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr className="border-b border-line/60">
                    <Th>Code</Th>
                    <Th>Account Title</Th>
                    <Th>Classification</Th>
                    <Th>Normal Balance</Th>
                    <Th align="right">Current Balance</Th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => {
                    const bal = accountBalances[a.code]?.net || 0;
                    return (
                      <tr key={a.code} className="border-b border-line/40 last:border-0 hover:bg-black/[0.01]">
                        <Td className="font-mono text-[12px] font-bold text-ink">{a.code}</Td>
                        <Td className="text-ink2 font-medium text-[12px]">
                          {a.name}
                          {a.description && (
                            <span className="block text-[10px] text-ink3 font-normal">
                              {a.description}
                            </span>
                          )}
                        </Td>
                        <Td>
                          <Badge
                            tone={
                              a.type === "Asset"
                                ? "up"
                                : a.type === "Liability"
                                ? "down"
                                : a.type === "Revenue"
                                ? "brand"
                                : "neutral"
                            }
                          >
                            {a.type}
                          </Badge>
                        </Td>
                        <Td className="text-ink3 text-[11px] font-mono">{a.balanceType}</Td>
                        <Td align="right" className="font-mono font-medium text-[12px]">
                          {dash(bal)}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            <div className="p-4 border-t border-line/50">
              <Note tone="brand">
                US GAAP Classification Structure: 1000s Assets, 2000s Liabilities, 3000s Equity, 4000s Revenue, 5000s COGS, 6000s Operating Expenses, 6300 Realized FX Variance.
              </Note>
            </div>
          </Panel>
        </div>

        {/* Add Account Tool */}
        <div className="lg:col-span-4">
          {!userPersona.canCreateJournals ? (
            <Panel title="Client Portal Notice">
              <div className="p-6 text-center text-ink3 text-[12px]">
                <p>Client portal users can inspect the Chart of Accounts but cannot modify accounting structure.</p>
              </div>
            </Panel>
          ) : (
            <Panel title="Add Ledger Account" subtitle="Configure new sub-account">
              <form onSubmit={handleCreateAccount} className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Account Code
                    </label>
                    <input
                      type="text"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      placeholder="e.g. 6250"
                      required
                      className="mt-1 w-full rounded bg-white px-2.5 py-1.5 font-mono text-[12px] ring-1 ring-line outline-none focus:ring-brand"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Normal Balance
                    </label>
                    <select
                      value={newBalanceType}
                      onChange={(e) => setNewBalanceType(e.target.value as any)}
                      className="mt-1 w-full rounded bg-white px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none"
                    >
                      <option value="Debit">Debit (Dr)</option>
                      <option value="Credit">Credit (Cr)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                    Account Name
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Software & Cloud Subscriptions"
                    required
                    className="mt-1 w-full rounded bg-white px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none focus:ring-brand"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                    US GAAP Classification Type
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => {
                      const t = e.target.value as AccountType;
                      setNewType(t);
                      if (["Asset", "COGS", "Operating Expense", "Other Expense"].includes(t)) {
                        setNewBalanceType("Debit");
                      } else {
                        setNewBalanceType("Credit");
                      }
                    }}
                    className="mt-1 w-full rounded bg-white px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none"
                  >
                    <option value="Asset">Asset (1000s)</option>
                    <option value="Liability">Liability (2000s)</option>
                    <option value="Equity">Equity (3000s)</option>
                    <option value="Revenue">Revenue (4000s)</option>
                    <option value="COGS">Cost of Goods Sold (5000s)</option>
                    <option value="Operating Expense">Operating Expense (6000s)</option>
                    <option value="Other Expense">Other Expense (6300s)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                    Accounting Description
                  </label>
                  <textarea
                    rows={2}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Intended scope of transactions..."
                    className="mt-1 w-full rounded bg-white p-2 text-[11.5px] ring-1 ring-line outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-md bg-brand py-2 text-[12.5px] font-semibold text-primary-foreground hover:opacity-95 shadow-2xs"
                >
                  Create Account
                </button>
              </form>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
