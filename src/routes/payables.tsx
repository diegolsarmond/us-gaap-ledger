import { resolvePostingAccount } from "@/lib/posting-accounts";
import { TradeSettlement } from "@/components/trade-settlement";
import { TradeAging } from "@/components/trade-aging";
import { TransactionRateFields } from "@/components/transaction-rate-fields";
import { useTransactionQuote } from "@/lib/use-transaction-quote";
import { money, outstanding, paymentCashFlow } from "@/lib/transaction-fx";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { DimensionFields, DimensionLabels } from "@/components/dimension-fields";
import type { DimensionValue } from "@/lib/dimensions";
import { AccountingProvider, useAccounting } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, formatDate, acct, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import { ArrowLeft, Plus, Search } from "lucide-react";

export const Route = createFileRoute("/payables")({
  head: () =>
    pageHead(
      "Accounts Payable & Multi-Currency · LedgerX",
      "Manage vendor obligations, currency exchange rates, foreign payables, and realized FX gain/loss entries under US GAAP.",
    ),
  component: () => (
    <AccountingProvider>
      <PayablesPage />
    </AccountingProvider>
  ),
});

function PayablesPage() {
  const modal = useModal();
  const {
    activeCompany,
    bills,
    vendors,
    paymentTerms,
    expenseCategories,
    postingAccounts,
    accounts,
    projects,
    inventory,
    dimensions,
    costCenters,
    createBill,
    userPersona,
    currencies,
  } = useAccounting();

  const inventoryAccountCode = resolvePostingAccount(accounts, postingAccounts, "13000", "1300");
  // Screen View Mode
  const [view, setView] = useState<"list" | "create">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState<string>("ALL");

  // Bill creation form state
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState(
    () =>
      currencies.find((c) => c.code === "USD" && c.status === "Active")?.code ??
      currencies.find((c) => c.status === "Active")?.code ??
      "",
  );
  const issueQuote = useTransactionQuote(currency, date);
  const fxRateInput = issueQuote.rate;
  const [foreignAmount, setForeignAmount] = useState("0");
  const [accountCode, setAccountCode] = useState("");
  const [isInventory, setIsInventory] = useState(false);
  const [skuPurchased, setSkuPurchased] = useState("");
  const [qtyPurchased, setQtyPurchased] = useState(0);
  const [costCenterId, setCostCenterId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [dimensionValues, setDimensionValues] = useState<DimensionValue[]>([]);

  const [payingBillId, setPayingBillId] = useState<string | null>(null);

  // Computations
  const numForeign = Number(foreignAmount) || 0;
  const effectiveRate = currency === "USD" ? 1.0 : Number(fxRateInput);
  const calculatedUsd = money(numForeign * effectiveRate);

  const totalOpenAp = bills
    .filter((b) => b.status !== "Paid")
    .reduce((s, b) => s + outstanding(b).functional, 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const totalPaidAp = bills.reduce(
    (s, b) => s + (b.payments || []).reduce((t, p) => t + paymentCashFlow(p, currentMonth), 0),
    0,
  );

  const handleCurrencyChange = (curr: string) => setCurrency(curr);

  const handleCreateBill = async (e: React.FormEvent) => {
    try {
      e.preventDefault();

      if (!vendorName.trim()) {
        await modal.showAlert({
          title: "Required Field",
          message: "Please select or provide the Vendor Name.",
          tone: "warning",
        });
        return;
      }

      const result = await createBill({
        dimensionValues,
        costCenterId: costCenterId || undefined,
        vendorId: vendorId || undefined,
        vendorName: vendorName.trim(),
        billNumber: billNumber.trim(),
        date,
        dueDate,
        currency,
        fxRate: effectiveRate,
        transactionCurrency: currency,
        transactionAmount: numForeign,
        functionalCurrency: "USD",
        exchangeRateValue: effectiveRate,
        exchangeRateSource: issueQuote.source,
        exchangeRateDate: issueQuote.rateDate,
        foreignAmount: numForeign,
        items: [
          {
            id: "bill-item",
            description: `Bill ${billNumber} — ${vendorName}`,
            accountCode,
            isInventory: [inventoryAccountCode].includes(accountCode) && isInventory,
            sku: [inventoryAccountCode].includes(accountCode) ? skuPurchased : undefined,
            qty: [inventoryAccountCode].includes(accountCode) ? qtyPurchased : undefined,
            amount: calculatedUsd,
            projectId: projectId || undefined,
          },
        ],
        projectId: projectId || undefined,
      });

      if (result.success) {
        const bId = result.billId;
        setBillNumber("");
        setDimensionValues([]);
        setView("list");
        await modal.showAlert({
          title: "Vendor Bill Recorded",
          message: `Bill ${bId} successfully recorded in Accounts Payable (AP)!\n\nGeneral Ledger Entries:\n• Credit Accounts Payable (${resolvePostingAccount(accounts, postingAccounts, "20100", "2000")}): ${usd(calculatedUsd)}\n• Debit Account ${accountCode}: ${usd(calculatedUsd)}`,
          tone: "success",
        });
      } else {
        await modal.showAlert({
          title: "Error Recording Bill",
          message: result.error || "Unable to record vendor payable.",
          tone: "error",
        });
      }
    } catch {
      /* The company provider displays the server error and preserves the form. */
    }
  };

  const openPayModal = (bill: (typeof bills)[0]) => setPayingBillId(bill.id);

  const handleExportCsv = () => {
    const headers = [
      "Bill ID",
      "Vendor",
      "Ref Number",
      "Date",
      "Due Date",
      "Currency",
      "Foreign Amount",
      "FX Rate",
      "USD Base",
      "Status",
      "Realized FX Diff",
    ];
    const rows = bills.map((b) => [
      b.id,
      b.vendorName,
      b.billNumber,
      b.date,
      b.dueDate,
      b.currency,
      b.foreignAmount,
      b.fxRate,
      b.usdAmount,
      b.status,
      b.realizedFxDiff ?? 0,
    ]);
    exportToCsv(`${activeCompany.id}_vendor_bills`, headers, rows);
  };

  const filteredBills = bills.filter((b) => {
    const matchesSearch =
      b.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.vendorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.billNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCurr = currencyFilter === "ALL" || b.currency === currencyFilter;
    return matchesSearch && matchesCurr;
  });

  return (
    <div className="space-y-4">
      {view === "list" ? (
        /* ================= TELA DE LISTAGEM ================= */
        <div className="space-y-4">
          <TradeAging kind="AP" />
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line/60 pb-3">
            <PageTitle
              title="Bills & Accounts Payable (AP)"
              description={`Vendor obligations, multi-currency invoices, and realized FX gain/loss for ${activeCompany.name}`}
            />
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={handleExportCsv}
                className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs transition-colors cursor-pointer"
              >
                Export Payables (CSV)
              </button>
              {userPersona.canCreateJournals && (
                <button
                  type="button"
                  onClick={() => setView("create")}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-brand/90 shadow-2xs transition-colors cursor-pointer"
                >
                  <Plus className="size-4" />
                  Record New Bill
                </button>
              )}
            </div>
          </div>

          {/* KPI Row */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi
              label="Total Open Obligations (AP)"
              value={usd(totalOpenAp)}
              hint={`Account ${resolvePostingAccount(accounts, postingAccounts, "20100", "2000")} · Due to vendors`}
              tone={totalOpenAp > 0 ? "neutral" : "up"}
            />
            <Kpi
              label="Disbursements Cleared MTD"
              value={usd(totalPaidAp)}
              hint="Cash disbursements paid"
              tone="neutral"
            />
            <Kpi
              label="Foreign Currency Bills"
              value={bills.filter((b) => b.currency !== "USD").length.toString()}
              hint="Bills issued in currencies other than USD"
              tone="neutral"
            />
          </section>

          {/* Search & Currency Filter */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-ink3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by vendor or bill number..."
                className="w-full rounded-md border border-line bg-white/90 py-1.5 pl-8 pr-3 text-[12px] text-ink outline-none ring-1 ring-transparent focus:border-brand focus:ring-brand/20 transition-all"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                "ALL",
                ...new Set([
                  ...currencies.filter((c) => c.status === "Active").map((c) => c.code),
                  ...bills.map((b) => b.currency),
                ]),
              ].map((curr) => (
                <button
                  key={curr}
                  type="button"
                  onClick={() => setCurrencyFilter(curr)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                    currencyFilter === curr
                      ? "bg-brand text-white"
                      : "bg-surface text-ink2 hover:bg-muted ring-1 ring-line"
                  }`}
                >
                  {curr === "ALL" ? "All Currencies" : curr}
                </button>
              ))}
            </div>
          </div>

          {/* Vendor Bills Register Full Width */}
          <Panel
            title="Vendor Bills Register"
            subtitle={`${filteredBills.length} of ${bills.length} bills in vendor subledger`}
          >
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr className="border-b border-line/60">
                    <Th>Bill ID</Th>
                    <Th>Ref Number</Th>
                    <Th>Vendor Legal Name</Th>
                    <Th>Currency / Orig</Th>
                    <Th>Issue Date</Th>
                    <Th>Due Date</Th>
                    <Th align="right">USD Base</Th>
                    <Th align="center">Status</Th>
                    <Th align="center">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBills.length === 0 ? (
                    <tr>
                      <Td colSpan={9} className="py-8 text-center text-[12px] text-ink3">
                        No bills found matching the selected filter.
                      </Td>
                    </tr>
                  ) : (
                    filteredBills.map((b) => (
                      <tr
                        key={b.id}
                        className="border-b border-line/40 last:border-0 hover:bg-black/[0.01] transition-colors"
                      >
                        <Td className="font-mono text-[11.5px] font-semibold text-brand">{b.id}</Td>
                        <Td className="font-mono text-[11px] text-ink3">{b.billNumber}</Td>
                        <Td className="text-ink font-medium text-[12px]">
                          {b.vendorName}
                          <DimensionLabels dimensions={dimensions} value={b.dimensionValues} />
                        </Td>
                        <Td className="font-mono text-[11.5px]">
                          {b.currency} {b.foreignAmount.toLocaleString()}
                          {b.currency !== "USD" && (
                            <span className="block text-[10px] text-ink3">Rate: {b.fxRate}</span>
                          )}
                        </Td>
                        <Td className="text-ink3 text-[11.5px]">{formatDate(b.date)}</Td>
                        <Td className="text-ink3 text-[11.5px]">{formatDate(b.dueDate)}</Td>
                        <Td align="right" className="font-mono font-semibold text-[12px]">
                          {usd(b.usdAmount)}
                          {b.realizedFxDiff !== undefined && (
                            <span
                              className={`block text-[10px] font-sans ${
                                b.realizedFxDiff >= 0
                                  ? "text-up font-semibold"
                                  : "text-down font-semibold"
                              }`}
                            >
                              FX: {acct(b.realizedFxDiff)}
                            </span>
                          )}
                        </Td>
                        <Td align="center">
                          <Badge tone={b.status === "Paid" ? "up" : "down"}>{b.status}</Badge>
                        </Td>
                        <Td align="center">
                          {b.status !== "Paid" && !userPersona.allowedReportsOnly && (
                            <button
                              type="button"
                              onClick={() => openPayModal(b)}
                              className="rounded bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand hover:bg-brand/20 ring-1 ring-brand/25 transition-colors cursor-pointer shadow-2xs"
                            >
                              Pay Bill
                            </button>
                          )}
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </div>
            <div className="p-4 border-t border-line/50">
              <Note tone="brand">
                US GAAP ASC 830 (Foreign Currency Matters): Foreign currency payables are recorded
                at the spot exchange rate on the transaction date. Upon settlement, any exchange
                rate difference generates Realized Foreign Exchange Gain/Loss using the configured
                account.
              </Note>
            </div>
          </Panel>
        </div>
      ) : (
        /* ================= TELA DE CADASTRO ================= */
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
                Back to Accounts Payable
              </button>
              <div>
                <h1 className="text-[16px] font-semibold text-ink">Record Vendor Bill</h1>
                <p className="text-[12px] text-ink3">
                  Vendor obligation entry and General Ledger expense accrual (AP)
                </p>
              </div>
            </div>
          </div>

          <Panel
            title="Vendor Bill Details"
            subtitle="Enter invoice document details and classify the associated expense or asset"
          >
            <form onSubmit={handleCreateBill} className="p-6 space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Vendor Display Name *
                  </label>
                  <select
                    aria-label="Registered vendor"
                    className="mb-2 w-full rounded-md border border-line p-2 text-sm"
                    required
                    value={vendorId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setVendorId(id);
                      const vendor = vendors.find((v) => v.id === id);
                      if (!vendor) return;
                      setVendorName(vendor.displayName);
                      setAccountCode(vendor.defaultExpenseAccountCode);
                      // Currency is selected on each bill, independently of the vendor.
                      const term =
                        paymentTerms.find(
                          (t) => t.id === vendor.paymentTermId && t.status === "Active",
                        ) ?? paymentTerms.find((t) => t.isDefaultVendor && t.status === "Active");
                      const due = new Date(date + "T00:00:00Z");
                      due.setUTCDate(due.getUTCDate() + (term?.days ?? 0));
                      setDueDate(due.toISOString().slice(0, 10));
                    }}
                  >
                    <option value="">Select registered vendor</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.displayName}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    readOnly
                    value={vendorName}
                    onChange={(e) => {
                      setVendorName(e.target.value);
                      setVendorId("");
                    }}
                    placeholder="Ex: Grainger Industrial Supply, AWS Cloud..."
                    required
                    className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Bill / Invoice # (Reference Number) *
                  </label>
                  <input
                    type="text"
                    value={billNumber}
                    onChange={(e) => setBillNumber(e.target.value)}
                    placeholder="Ex: INV-2026-9901"
                    required
                    className="w-full rounded-md bg-canvas px-3 py-2 font-mono text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <TransactionRateFields
                    currency={currency}
                    date={date}
                    onCurrency={handleCurrencyChange}
                    quote={issueQuote}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Original Amount ({currency}) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={foreignAmount}
                    onChange={(e) => setForeignAmount(e.target.value)}
                    required
                    className="w-full rounded-md bg-canvas px-3 py-2 text-right font-mono text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    USD Equivalent
                  </label>
                  <div className="w-full rounded-md bg-ink/[0.04] px-3 py-2 text-right font-mono font-semibold text-[13px] border border-line text-brand">
                    {usd(calculatedUsd)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Bill Date *
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      setDate(nextDate);
                      if (!nextDate) return;
                      const contact = vendors.find((c) => c.id === vendorId);
                      const term =
                        paymentTerms.find(
                          (t) => t.id === contact?.paymentTermId && t.status === "Active",
                        ) ?? paymentTerms.find((t) => t.isDefaultVendor && t.status === "Active");
                      const due = new Date(nextDate + "T00:00:00Z");
                      due.setUTCDate(due.getUTCDate() + (term?.days ?? 0));
                      setDueDate(due.toISOString().slice(0, 10));
                    }}
                    required
                    className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Due Date *
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                    className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Project Allocation
                  </label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  >
                    <option value="">General Expense (G&A)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="block text-sm">
                Expense category
                <select
                  className="w-full rounded border border-line p-2"
                  defaultValue=""
                  onChange={(e) => {
                    const category = expenseCategories.find((c) => c.id === e.target.value);
                    if (category) {
                      setAccountCode(category.glAccountCode);
                      setIsInventory(false);
                    }
                  }}
                >
                  <option value="">Select category (optional)</option>
                  {expenseCategories
                    .filter((c) => c.status === "Active")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              {/* Expense Account Classification */}
              <label className="block text-sm">
                Cost center
                <select
                  className="w-full rounded border border-line p-2"
                  value={costCenterId}
                  onChange={(e) => setCostCenterId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {costCenters
                    .filter((c) => c.status === "Active")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <DimensionFields
                dimensions={dimensions}
                document="bills"
                value={dimensionValues}
                onChange={setDimensionValues}
              />
              <div className="rounded-lg bg-surface p-4 border border-line space-y-3">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                  Expense / Asset Account Classification
                </label>
                <select
                  value={accountCode}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAccountCode(val);
                    if ([inventoryAccountCode].includes(val)) setIsInventory(true);
                    else setIsInventory(false);
                  }}
                  className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand font-mono"
                >
                  <option value="">Select a general ledger account</option>
                  <optgroup label="Operating Expenses (OpEx)">
                    {accounts
                      .filter((a) => a.type === "Operating Expense" || a.type === "Other Expense")
                      .map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} · {a.name} ({a.type})
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Inventory & Costs (Assets / COGS)">
                    {accounts
                      .filter((a) => a.type === "COGS" || [inventoryAccountCode].includes(a.code))
                      .map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                  </optgroup>
                </select>

                {[inventoryAccountCode].includes(accountCode) && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2 border-t border-line/60">
                    <div>
                      <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                        Link to Inventory SKU
                      </label>
                      <select
                        value={skuPurchased}
                        onChange={(e) => setSkuPurchased(e.target.value)}
                        className="w-full rounded-md bg-canvas px-2.5 py-1.5 text-[12px] border border-line outline-none focus:border-brand"
                      >
                        {inventory
                          .filter((i) => i.type === "Product")
                          .map((i) => (
                            <option key={i.sku} value={i.sku}>
                              {i.sku} · {i.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                        Quantity Purchased
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={qtyPurchased}
                        onChange={(e) => setQtyPurchased(Number(e.target.value) || 1)}
                        className="w-full rounded-md bg-canvas px-2.5 py-1.5 text-right font-mono text-[12px] border border-line outline-none focus:border-brand"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
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
                  className="rounded-md bg-brand px-6 py-2 text-[12.5px] font-semibold text-white hover:bg-brand/90 transition-colors cursor-pointer shadow-2xs"
                >
                  Save & Post to Ledger (AP)
                </button>
              </div>
            </form>
          </Panel>
        </div>
      )}

      {payingBillId && (
        <TradeSettlement
          key={payingBillId}
          kind="AP"
          documentId={payingBillId}
          onClose={() => setPayingBillId(null)}
        />
      )}
    </div>
  );
}
