import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, formatDate, exportToCsv, acct } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/payables")({
  head: () =>
    pageHead(
      "Bills & Accounts Payable · LedgerX",
      "Multi-currency vendor bills with automated realized foreign exchange gain and loss calculations.",
    ),
  component: PayablesPage,
});

function PayablesPage() {
  const { activeCompany, bills, accounts, inventory, projects, createBill, payBill, userPersona } =
    useAccounting();

  // Form State
  const [vendorName, setVendorName] = useState("Baja Components S.A.");
  const [billNumber, setBillNumber] = useState("BAJA-9940");
  const [date, setDate] = useState("2026-12-20");
  const [dueDate, setDueDate] = useState("2027-01-20");
  const [currency, setCurrency] = useState("MXN");
  const [fxRate, setFxRate] = useState("17.50");
  const [foreignAmount, setForeignAmount] = useState("87500");
  const [accountCode, setAccountCode] = useState("1300");
  const [projectId, setProjectId] = useState("proj-101");
  const [isInventory, setIsInventory] = useState(true);
  const [skuPurchased, setSkuPurchased] = useState("HR-1001");
  const [qtyPurchased, setQtyPurchased] = useState(25);
  const [feedback, setFeedback] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Pay Modal State
  const [payingBillId, setPayingBillId] = useState<string | null>(null);
  const [settlementRate, setSettlementRate] = useState("");
  const [payDate, setPayDate] = useState("2026-12-22");

  const effectiveRate = Number(fxRate) || 1.0;
  const numForeign = Number(foreignAmount) || 0;
  const calculatedUsd = Math.round((numForeign / effectiveRate) * 100) / 100;

  const totalOpenAp = bills.filter((b) => b.status === "Open").reduce((s, b) => s + b.usdAmount, 0);
  const totalPaidAp = bills.filter((b) => b.status === "Paid").reduce((s, b) => s + b.usdAmount, 0);

  const handleCreateBill = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!vendorName.trim()) {
      setFeedback({ msg: "Please enter vendor name.", type: "error" });
      return;
    }

    const result = createBill({
      vendorName,
      billNumber,
      date,
      dueDate,
      currency,
      fxRate: effectiveRate,
      foreignAmount: numForeign,
      items: [
        {
          id: `bi-${Date.now()}`,
          description: `Bill ${billNumber} — ${vendorName}`,
          accountCode,
          isInventory: accountCode === "1300" && isInventory,
          sku: accountCode === "1300" ? skuPurchased : undefined,
          qty: accountCode === "1300" ? qtyPurchased : undefined,
          amount: calculatedUsd,
          projectId: projectId || undefined,
        },
      ],
      projectId: projectId || undefined,
    });

    if (result.success) {
      setFeedback({ msg: `Vendor Bill ${result.billId} posted to AP!`, type: "success" });
      setBillNumber("");
    } else {
      setFeedback({ msg: result.error || "Failed to create bill.", type: "error" });
    }
  };

  const openPayModal = (bill: (typeof bills)[0]) => {
    setPayingBillId(bill.id);
    setSettlementRate(String(bill.fxRate));
  };

  const handleConfirmPay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingBillId) return;

    const rate = Number(settlementRate) || undefined;
    const res = payBill(payingBillId, payDate, rate);
    if (res.success) {
      setPayingBillId(null);
    } else {
      alert(res.error);
    }
  };

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

  const selectedPayingBill = bills.find((b) => b.id === payingBillId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
        <PageTitle
          title="Bills & Accounts Payable (AP)"
          description={`Vendor obligations, multi-currency invoices, and realized FX gain/loss for ${activeCompany.name}`}
        />
        <button
          type="button"
          onClick={handleExportCsv}
          className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs"
        >
          Export Payables (CSV)
        </button>
      </div>

      {/* KPI Row */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          label="Total Open Obligations (AP)"
          value={usd(totalOpenAp)}
          hint="Account 2000 · Due to vendors"
          tone="neutral"
        />
        <Kpi
          label="Disbursed & Settled MTD"
          value={usd(totalPaidAp)}
          hint="Cleared from Cash"
          tone="up"
        />
        <Kpi
          label="Foreign Currency Bills"
          value={bills.filter((b) => b.currency !== "USD").length.toString()}
          hint="MXN, GBP, EUR exposure"
          tone="neutral"
        />
      </section>

      {/* Main Grid: Bills Table & Create Form */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Bills Register */}
        <div className="lg:col-span-7 space-y-3">
          <Panel
            title="Vendor Bills Register"
            subtitle={`${bills.length} bills recorded in subledger`}
          >
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr className="border-b border-line/60">
                    <Th>Bill / Ref</Th>
                    <Th>Vendor</Th>
                    <Th>Currency / Orig</Th>
                    <Th>Due Date</Th>
                    <Th align="right">USD Base</Th>
                    <Th align="right">Status</Th>
                    <Th align="center">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b) => (
                    <tr
                      key={b.id}
                      className="border-b border-line/40 last:border-0 hover:bg-black/[0.01]"
                    >
                      <Td className="font-mono text-[11.5px] font-semibold">
                        {b.id}
                        <span className="block text-[10px] text-ink3">{b.billNumber}</span>
                      </Td>
                      <Td className="text-ink2 font-medium">
                        <p className="truncate max-w-[170px]">{b.vendorName}</p>
                      </Td>
                      <Td className="font-mono text-[11.5px]">
                        {b.currency} {b.foreignAmount.toLocaleString()}
                        {b.currency !== "USD" && (
                          <span className="block text-[10px] text-ink3">Rate: {b.fxRate}</span>
                        )}
                      </Td>
                      <Td className="text-ink3 text-[11.5px]">{formatDate(b.dueDate)}</Td>
                      <Td align="right" className="font-mono font-medium text-[12px]">
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
                      <Td align="right">
                        <Badge tone={b.status === "Paid" ? "up" : "brand"}>{b.status}</Badge>
                      </Td>
                      <Td align="center">
                        {b.status === "Open" && !userPersona.allowedReportsOnly && (
                          <button
                            type="button"
                            onClick={() => openPayModal(b)}
                            className="rounded bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand hover:bg-brand/20 ring-1 ring-brand/20 transition-colors"
                          >
                            Pay Bill
                          </button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Panel>
        </div>

        {/* Enter Bill Form */}
        <div className="lg:col-span-5">
          {!userPersona.canCreateJournals ? (
            <Panel title="Client Portal Notice">
              <div className="p-6 text-center text-ink3 text-[12.5px]">
                <p>
                  Client portal users can view vendor payables but cannot enter new trade bills.
                </p>
              </div>
            </Panel>
          ) : (
            <Panel
              title="Enter Vendor Bill"
              subtitle="Debits Expense or Inventory and credits Accounts Payable (2000)"
            >
              <form onSubmit={handleCreateBill} className="p-4 space-y-3">
                {feedback && (
                  <div
                    className={`rounded-md p-2.5 text-[12px] ring-1 ${
                      feedback.type === "success"
                        ? "bg-up/[0.08] text-up ring-up/20"
                        : "bg-down/[0.08] text-down ring-down/20"
                    }`}
                  >
                    {feedback.msg}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Vendor Name
                    </label>
                    <input
                      type="text"
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      placeholder="e.g. Baja Components"
                      required
                      className="mt-1 w-full rounded-md bg-white/90 px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none focus:ring-brand"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Invoice / Bill #
                    </label>
                    <input
                      type="text"
                      value={billNumber}
                      onChange={(e) => setBillNumber(e.target.value)}
                      placeholder="Ref # on bill"
                      required
                      className="mt-1 w-full rounded-md bg-white/90 px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none focus:ring-brand"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => {
                        const cur = e.target.value;
                        setCurrency(cur);
                        if (cur === "USD") setFxRate("1.0");
                        if (cur === "MXN") setFxRate("17.50");
                        if (cur === "GBP") setFxRate("0.79");
                        if (cur === "EUR") setFxRate("0.92");
                        if (cur === "CAD") setFxRate("1.36");
                      }}
                      className="mt-1 w-full rounded-md bg-white/90 px-2 py-1.5 text-[12px] ring-1 ring-line outline-none focus:ring-brand"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="MXN">MXN ($)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="CAD">CAD ($)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      FX Rate
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={fxRate}
                      disabled={currency === "USD"}
                      onChange={(e) => setFxRate(e.target.value)}
                      className="mt-1 w-full rounded-md bg-white/90 px-2 py-1.5 text-right font-mono text-[12px] ring-1 ring-line outline-none focus:ring-brand disabled:opacity-40"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Foreign Amount
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={foreignAmount}
                      onChange={(e) => setForeignAmount(e.target.value)}
                      required
                      className="mt-1 w-full rounded-md bg-white/90 px-2 py-1.5 text-right font-mono text-[12px] ring-1 ring-line outline-none focus:ring-brand"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Bill Date
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                      className="mt-1 w-full rounded-md bg-white/90 px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none focus:ring-brand"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      required
                      className="mt-1 w-full rounded-md bg-white/90 px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none focus:ring-brand"
                    />
                  </div>
                </div>

                {/* Account & Inventory Classification */}
                <div className="space-y-2 pt-2 border-t border-line/60">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Expense / Asset Debit Account
                    </label>
                    <select
                      value={accountCode}
                      onChange={(e) => setAccountCode(e.target.value)}
                      className="mt-1 w-full rounded-md bg-white/90 px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none"
                    >
                      {accounts
                        .filter(
                          (a) =>
                            a.type === "Asset" ||
                            a.type === "Operating Expense" ||
                            a.type === "COGS",
                        )
                        .map((a) => (
                          <option key={a.code} value={a.code}>
                            {a.code} · {a.name} ({a.type})
                          </option>
                        ))}
                    </select>
                  </div>

                  {accountCode === "1300" && (
                    <div className="rounded-lg bg-ink/[0.02] p-2.5 ring-1 ring-line/50 space-y-2">
                      <p className="text-[11px] font-semibold text-brand">
                        Inventory Purchase Lot Inflow
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-ink3">Target Catalog SKU</span>
                          <select
                            value={skuPurchased}
                            onChange={(e) => setSkuPurchased(e.target.value)}
                            className="w-full rounded bg-white px-2 py-1 text-[11.5px] ring-1 ring-line"
                          >
                            {inventory
                              .filter((i) => i.type === "Product")
                              .map((it) => (
                                <option key={it.sku} value={it.sku}>
                                  {it.sku} · {it.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div>
                          <span className="text-[10px] text-ink3">Units Added</span>
                          <input
                            type="number"
                            min="1"
                            value={qtyPurchased}
                            onChange={(e) => setQtyPurchased(Number(e.target.value))}
                            className="w-full rounded bg-white px-2 py-1 text-right font-mono text-[11.5px] ring-1 ring-line"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Project Allocation (Opt.)
                    </label>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      className="mt-1 w-full rounded-md bg-white/90 px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none"
                    >
                      <option value="">None (General Overhead)</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} — {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Conversion USD Base Preview */}
                <div className="rounded-lg bg-ink/[0.03] p-2.5 ring-1 ring-line/60 flex items-center justify-between text-[12.5px] font-mono">
                  <span className="text-ink3 font-sans">Recorded Base (USD):</span>
                  <span className="font-bold text-ink">{usd(calculatedUsd)}</span>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-md bg-brand py-2 text-[12.5px] font-semibold text-primary-foreground hover:opacity-95 shadow-2xs"
                >
                  Enter & Post Vendor Bill
                </button>
              </form>
            </Panel>
          )}
        </div>
      </div>

      {/* Foreign Currency Settlement Modal */}
      {payingBillId && selectedPayingBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl ring-1 ring-line space-y-4">
            <div className="flex items-center justify-between border-b border-line/60 pb-2">
              <h3 className="text-[14px] font-semibold text-ink">
                Settle Bill · {selectedPayingBill.id}
              </h3>
              <button
                type="button"
                onClick={() => setPayingBillId(null)}
                className="text-ink3 hover:text-ink font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="rounded-lg bg-ink/[0.03] p-3 text-[12px] space-y-1">
              <div className="flex justify-between">
                <span className="text-ink3">Vendor:</span>
                <span className="font-semibold">{selectedPayingBill.vendorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink3">Foreign Bill Amount:</span>
                <span className="font-mono">
                  {selectedPayingBill.currency} {selectedPayingBill.foreignAmount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink3">Original Booked USD:</span>
                <span className="font-mono">{usd(selectedPayingBill.usdAmount)}</span>
              </div>
            </div>

            <form onSubmit={handleConfirmPay} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                  Payment Date
                </label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  required
                  className="mt-1 w-full rounded bg-white px-2.5 py-1.5 text-[12px] ring-1 ring-line"
                />
              </div>

              {selectedPayingBill.currency !== "USD" && (
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                    Bank Settlement Exchange Rate ({selectedPayingBill.currency} per USD)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={settlementRate}
                    onChange={(e) => setSettlementRate(e.target.value)}
                    required
                    className="mt-1 w-full rounded bg-white px-2.5 py-1.5 text-right font-mono text-[12px] ring-1 ring-line focus:ring-brand"
                  />
                  <p className="mt-1 text-[11px] text-ink3">
                    If this rate differs from the bill rate ({selectedPayingBill.fxRate}), the
                    system will post a Realized FX Gain or Loss to Account 6300.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPayingBillId(null)}
                  className="rounded-md px-3 py-1.5 text-[12px] font-medium text-ink2 hover:bg-panel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-brand px-4 py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-95"
                >
                  Confirm Disbursement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
