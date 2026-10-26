import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadCashAccountLinks } from "@/lib/accounting";
import {
  AccountingProvider,
  useAccounting,
  type Account,
  type AccountType,
} from "@/lib/accounting-store";
import { account as accountSchema } from "@/lib/accounting-model";
import { Badge, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import { ArrowLeft, Plus, Search } from "lucide-react";

export const Route = createFileRoute("/accounts")({
  head: () =>
    pageHead(
      "Chart of Accounts · LedgerX",
      "US GAAP standardized Chart of Accounts covering Assets, Liabilities, Equity, Revenue, COGS, and Expenses.",
    ),
  component: AccountsRoute,
});

function AccountsRoute() {
  return (
    <AccountingProvider>
      <AccountsPage />
    </AccountingProvider>
  );
}

function AccountsPage() {
  const modal = useModal();
  const {
    activeCompany,
    accounts,
    accountBalances,
    addAccount,
    updateAccount,
    deleteAccount,
    userPersona,
  } = useAccounting();
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const cashLinks = useQuery({
    queryKey: ["cash-flow-links", activeCompany.id],
    queryFn: () => loadCashAccountLinks({ data: { companyId: activeCompany.id } }),
  });

  // Screen View Mode: "list" | "create"
  const [view, setView] = useState<"list" | "create">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  // New Account Form State
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<AccountType>("Operating Expense");
  const [newBalanceType, setNewBalanceType] = useState<"Debit" | "Credit">("Debit");
  const [newDescription, setNewDescription] = useState("");

  function openForm(existing?: Account) {
    setEditingCode(existing?.code ?? null);
    setNewCode(existing?.code ?? "");
    setNewName(existing?.name ?? "");
    setNewType(existing?.type ?? "Operating Expense");
    setNewBalanceType(existing?.balanceType ?? "Debit");
    setNewDescription(existing?.description ?? "");
    setError("");
    setView("create");
  }

  async function removeAccount(existing: Account) {
    const confirmed = await modal.showConfirm({
      title: "Delete account?",
      message: `Delete ${existing.code} — ${existing.name}? Accounts with journal entries or linked records cannot be deleted.`,
      tone: "error",
      confirmText: "Delete",
      cancelText: "Cancel",
    });
    if (!confirmed) return;
    setError("");
    try {
      await deleteAccount(existing.code);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to delete the account.");
    }
  }

  const handleCreateAccount = async (e: React.FormEvent) => {
    try {
      e.preventDefault();
      setError("");
      const parsed = accountSchema.safeParse({
        code: newCode,
        name: newName,
        type: newType,
        balanceType: newBalanceType,
        description: newDescription.trim(),
      });
      if (!parsed.success) {
        setError(parsed.error.issues.map((issue) => issue.message).join(" "));
        return;
      }

      // Check duplicate
      if (
        !editingCode &&
        accounts.some((a) => a.code.trim().toLowerCase() === newCode.trim().toLowerCase())
      ) {
        await modal.showAlert({
          title: "Duplicate Account Code",
          message: `An account with code "${newCode}" already exists. Please use a unique code in the chart of accounts.`,
          tone: "warning",
        });
        return;
      }

      if (editingCode) {
        const { code: _, ...changes } = parsed.data;
        await updateAccount(editingCode, changes);
      } else await addAccount(parsed.data);

      const createdCode = newCode;
      const createdName = newName;

      setNewCode("");
      setNewName("");
      setNewDescription("");
      setView("list");

      await modal.showAlert({
        title: editingCode ? "Account updated" : "Account created",
        message: `Account "${createdCode} — ${createdName}" has been saved to the chart of accounts for ${activeCompany.name}.`,
        tone: "success",
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save the account.");
    }
  };

  const handleExportCsv = () => {
    const headers = [
      "Account Code",
      "Account Name",
      "Category / Type",
      "Normal Balance",
      "Description",
      "Current Net Balance ($)",
    ];
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

  const categories = [
    "ALL",
    "Asset",
    "Liability",
    "Equity",
    "Revenue",
    "COGS",
    "Operating Expense",
    "Other Income",
    "Other Expense",
  ];

  const filteredAccounts = accounts.filter((a) => {
    const matchesSearch =
      a.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "ALL" || a.type === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {view === "list" ? (
        /* ================= ACCOUNT LIST ================= */
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line/60 pb-3">
            <PageTitle
              title="Chart of Accounts (COA)"
              description={`Chart of accounts for ${activeCompany.name}`}
            />
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <Link
                to="/cash-flow"
                className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs transition-colors"
              >
                Cash Flow & Forecast
              </Link>
              <button
                type="button"
                onClick={handleExportCsv}
                className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs transition-colors cursor-pointer"
              >
                Export COA (CSV)
              </button>
              {userPersona.canCreateJournals && (
                <button
                  type="button"
                  onClick={() => openForm()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-brand/90 shadow-2xs transition-colors cursor-pointer"
                >
                  <Plus className="size-4" />
                  New Account
                </button>
              )}
            </div>
          </div>

          {/* Search and Category Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-ink3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by account code or name..."
                className="w-full rounded-md border border-line bg-white/90 py-1.5 pl-8 pr-3 text-[12px] text-ink outline-none ring-1 ring-transparent focus:border-brand focus:ring-brand/20 transition-all"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                    selectedCategory === cat
                      ? "bg-brand text-white"
                      : "bg-surface text-ink2 hover:bg-muted ring-1 ring-line"
                  }`}
                >
                  {cat === "ALL" ? "All Accounts" : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Master Table Full Width */}
          <Panel
            title="Master Chart of Accounts"
            subtitle={`${filteredAccounts.length} of ${accounts.length} accounts listed`}
          >
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr className="border-b border-line/60">
                    <Th>Code</Th>
                    <Th>Account Name</Th>
                    <Th>Classification</Th>
                    <Th>Normal Bal</Th>
                    <Th>Accounting Scope</Th>
                    <Th align="right">Current Net Balance</Th>
                    <Th>Cash flow / forecast links</Th>
                    {userPersona.canCreateJournals && <Th>Actions</Th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.length === 0 ? (
                    <tr>
                      <Td
                        colSpan={userPersona.canCreateJournals ? 8 : 7}
                        className="py-8 text-center text-[12px] text-ink3"
                      >
                        {accounts.length
                          ? "No accounts match the selected filter."
                          : "No accounts have been created for this company. Add your first account to get started; no demo data is provided."}
                      </Td>
                    </tr>
                  ) : (
                    filteredAccounts.map((a) => {
                      const net = accountBalances[a.code]?.net || 0;
                      return (
                        <tr
                          key={a.code}
                          className="border-b border-line/40 last:border-0 hover:bg-black/[0.01] transition-colors"
                        >
                          <Td className="font-mono text-[11.5px] font-semibold text-brand">
                            {a.code}
                          </Td>
                          <Td className="font-medium text-ink text-[12px]">{a.name}</Td>
                          <Td>
                            <Badge
                              tone={
                                a.type === "Asset"
                                  ? "up"
                                  : a.type === "Liability"
                                    ? "neutral"
                                    : a.type === "Equity"
                                      ? "brand"
                                      : a.type === "Revenue"
                                        ? "up"
                                        : "down"
                              }
                            >
                              {a.type}
                            </Badge>
                          </Td>
                          <Td className="text-[11.5px] text-ink3">{a.balanceType}</Td>
                          <Td className="text-ink3 text-[11.5px] max-w-[280px] truncate">
                            {a.description}
                          </Td>
                          <Td align="right" className="font-mono text-[12px] font-medium text-ink">
                            {usd(net)}
                          </Td>
                          <Td>
                            {cashLinks.isPending
                              ? "Loading…"
                              : cashLinks.isError
                                ? "Unavailable"
                                : (() => {
                                    const usage = cashLinks.data?.find((l) => l.code === a.code);
                                    return usage ? (
                                      <Link to="/cash-flow" className="text-brand underline">
                                        {usage.cashAccounts} bank · {usage.actual} actual ·{" "}
                                        {usage.planned} forecast · {usage.cancelled} cancelled
                                      </Link>
                                    ) : (
                                      "No cash links"
                                    );
                                  })()}
                          </Td>
                          {userPersona.canCreateJournals && (
                            <Td>
                              <div className="flex gap-3">
                                <button
                                  type="button"
                                  onClick={() => openForm(a)}
                                  className="text-brand underline"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void removeAccount(a)}
                                  className="text-red-700 underline"
                                >
                                  Delete
                                </button>
                              </div>
                            </Td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </div>
            <div className="p-4 border-t border-line/50">
              <Note tone="brand">
                Account codes are defined by the company. The 1000–6000 numbering range is a
                suggested structure. Balances are calculated from saved journal entries, including
                reversals. Bank accounts and cash flow categories are managed separately from this
                chart of accounts.
              </Note>
            </div>
          </Panel>
        </div>
      ) : (
        /* ================= ACCOUNT FORM ================= */
        <div className="space-y-4 max-w-4xl mx-auto">
          {/* Top Bar with Back Button */}
          <div className="flex items-center justify-between border-b border-line/60 pb-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setView("list")}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink2 hover:bg-muted transition-colors cursor-pointer shadow-2xs"
              >
                <ArrowLeft className="size-3.5" />
                Back to Account List
              </button>
              <div>
                <h1 className="text-[16px] font-semibold text-ink">
                  {editingCode ? "Edit Account" : "Create Account"}
                </h1>
                <p className="text-[12px] text-ink3">
                  Manage a general ledger account for {activeCompany.name}
                </p>
              </div>
            </div>
          </div>

          <Panel
            title="Account Details"
            subtitle="Company-specific accounts with validation and an audit trail"
          >
            <form onSubmit={handleCreateAccount} className="p-6 space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Account Code *
                  </label>
                  <input
                    type="text"
                    value={newCode}
                    readOnly={editingCode !== null}
                    maxLength={120}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="e.g., 6250 or 1050"
                    required
                    className="w-full rounded-md bg-canvas px-3 py-2 font-mono text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                  />
                  <p className="mt-1 text-[10.5px] text-ink3">
                    {editingCode && "The code cannot be changed to preserve linked records. "}
                    Recommended: 1000s (Assets), 2000s (Liabilities), 3000s (Equity), 4000s
                    (Revenue), 5000s (COGS), 6000s (Expenses).
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Normal Balance *
                  </label>
                  <select
                    value={newBalanceType}
                    onChange={(e) => setNewBalanceType(e.target.value as "Debit" | "Credit")}
                    className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  >
                    <option value="Debit">Debit (Dr) — Increases with debits</option>
                    <option value="Credit">Credit (Cr) — Increases with credits</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                  Account Name *
                </label>
                <input
                  type="text"
                  value={newName}
                  maxLength={120}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Software & Cloud Subscriptions, Business Insurance..."
                  required
                  className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                  US GAAP Classification *
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
                  className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                >
                  <option value="Asset">Asset — Current / Noncurrent Assets (1000s)</option>
                  <option value="Liability">
                    Liability — Current / Noncurrent Liabilities (2000s)
                  </option>
                  <option value="Equity">Equity — Equity and Share Capital (3000s)</option>
                  <option value="Revenue">Revenue — Operating Revenue / Sales (4000s)</option>
                  <option value="COGS">COGS — Cost of Goods / Services Sold (5000s)</option>
                  <option value="Operating Expense">
                    Operating Expense — Operating Expenses / SG&A (6000s)
                  </option>
                  <option value="Other Expense">
                    Other Expense — Other Expenses and Taxes (6300s)
                  </option>
                  <option value="Other Income">Other Income — Other Income</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                  Description and Accounting Scope
                </label>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe the purpose of transactions recorded in this account..."
                  className="w-full rounded-md bg-canvas p-3 text-[12.5px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-line/60">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className="rounded-md border border-line bg-surface px-4 py-2 text-[12.5px] font-medium text-ink2 hover:bg-muted transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-brand px-5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand/90 transition-colors cursor-pointer shadow-2xs"
                >
                  Save Account
                </button>
              </div>
            </form>
          </Panel>
        </div>
      )}
    </div>
  );
}
