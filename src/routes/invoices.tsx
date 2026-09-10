import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting, type InvoiceItem } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, formatDate, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/invoices")({
  head: () =>
    pageHead(
      "Invoices & Accounts Receivable · LedgerX",
      "Issue product and service invoices with manual sales tax, tax-exempt certification, and automatic COGS relief."
    ),
  component: InvoicesPage,
});

function InvoicesPage() {
  const {
    activeCompany,
    invoices,
    inventory,
    projects,
    createInvoice,
    recordInvoicePayment,
    userPersona,
  } = useAccounting();

  // Invoice creation form state
  const [customerName, setCustomerName] = useState("Northgate Supply Co.");
  const [customerEin, setCustomerEin] = useState("");
  const [date, setDate] = useState("2026-12-22");
  const [dueDate, setDueDate] = useState("2027-01-21");
  const [kind, setKind] = useState<"Product" | "Service">("Product");
  const [projectId, setProjectId] = useState("");
  const [taxExempt, setTaxExempt] = useState(false);
  const [taxRate, setTaxRate] = useState("7.0");

  const [formItems, setFormItems] = useState<
    { sku: string; description: string; qty: number; unitPrice: number }[]
  >([{ sku: "HR-1001", description: "Marine Hardware Stainless Kit", qty: 10, unitPrice: 124.0 }]);

  const [feedback, setFeedback] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Computations
  const subtotal = formItems.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const effectiveTaxRate = taxExempt ? 0 : Number(taxRate) || 0;
  const taxAmount = Math.round(((subtotal * effectiveTaxRate) / 100) * 100) / 100;
  const totalAmount = subtotal + taxAmount;

  const totalOpen = invoices
    .filter((i) => i.status === "Open")
    .reduce((s, i) => s + i.total, 0);
  const totalOverdue = invoices
    .filter((i) => i.status === "Overdue")
    .reduce((s, i) => s + i.total, 0);
  const totalPaid = invoices
    .filter((i) => i.status === "Paid")
    .reduce((s, i) => s + i.total, 0);

  const handleAddItemRow = () => {
    setFormItems([
      ...formItems,
      { sku: "HR-2010", description: "316 Marine Fastener Set", qty: 20, unitPrice: 18.5 },
    ]);
  };

  const handleUpdateItem = (
    index: number,
    field: "sku" | "description" | "qty" | "unitPrice",
    val: string | number
  ) => {
    const next = [...formItems];
    const current = { ...next[index]! };

    if (field === "sku") {
      current.sku = String(val);
      const match = inventory.find((i) => i.sku === val);
      if (match) {
        current.description = match.name;
        current.unitPrice = match.unitPrice;
      }
    } else if (field === "description") {
      current.description = String(val);
    } else if (field === "qty") {
      current.qty = Number(val) || 0;
    } else if (field === "unitPrice") {
      current.unitPrice = Number(val) || 0;
    }

    next[index] = current;
    setFormItems(next);
  };

  const handleRemoveItem = (idx: number) => {
    if (formItems.length <= 1) return;
    setFormItems(formItems.filter((_, i) => i !== idx));
  };

  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!customerName.trim()) {
      setFeedback({ msg: "Please enter customer legal name.", type: "error" });
      return;
    }

    const invoiceLines: InvoiceItem[] = formItems.map((it, idx) => ({
      id: `it-${Date.now()}-${idx}`,
      description: it.description,
      sku: it.sku,
      isProduct: kind === "Product",
      qty: Number(it.qty) || 1,
      unitPrice: Number(it.unitPrice) || 0,
      taxable: !taxExempt,
    }));

    const result = createInvoice({
      customerName,
      customerEin: customerEin || undefined,
      date,
      dueDate,
      kind,
      items: invoiceLines,
      subtotal,
      taxRate: effectiveTaxRate,
      taxAmount,
      total: totalAmount,
      taxExempt,
      projectId: projectId || undefined,
    });

    if (result.success) {
      setFeedback({ msg: `Invoice ${result.invoiceId} successfully issued and posted to General Ledger!`, type: "success" });
      setCustomerName("");
      setCustomerEin("");
    } else {
      setFeedback({ msg: result.error || "Failed to create invoice.", type: "error" });
    }
  };

  const handleRecordPayment = (invId: string) => {
    const paymentDate = new Date().toISOString().split("T")[0]!;
    const res = recordInvoicePayment(invId, paymentDate);
    if (!res.success) {
      alert(res.error);
    }
  };

  const handleExportCsv = () => {
    const headers = ["Invoice ID", "Customer", "Date", "Due Date", "Kind", "Subtotal", "Tax Rate %", "Tax Amount", "Total", "Status"];
    const rows = invoices.map((i) => [
      i.id,
      i.customerName,
      i.date,
      i.dueDate,
      i.kind,
      i.subtotal,
      i.taxRate,
      i.taxAmount,
      i.total,
      i.status,
    ]);
    exportToCsv(`${activeCompany.id}_invoices`, headers, rows);
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
        <PageTitle
          title="Invoices & Accounts Receivable"
          description={`Trade invoicing and receivables management for ${activeCompany.name} · US GAAP Standard`}
        />
        <button
          type="button"
          onClick={handleExportCsv}
          className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs"
        >
          Export Invoices (CSV)
        </button>
      </div>

      {/* KPI Row */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          label="Open Receivables (AR)"
          value={usd(totalOpen)}
          hint="Account 1100 · Current terms"
          tone="neutral"
        />
        <Kpi
          label="Overdue Receivables"
          value={usd(totalOverdue)}
          hint="Past payment due date"
          tone={totalOverdue > 0 ? "down" : "neutral"}
        />
        <Kpi
          label="Collections Received MTD"
          value={usd(totalPaid)}
          hint="Cleared to Cash (Account 1000)"
          tone="up"
        />
      </section>

      {/* Main Grid: Invoices Table & Create Form */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Invoices List */}
        <div className="lg:col-span-7 space-y-3">
          <Panel
            title="Invoices Register"
            subtitle={`${invoices.length} invoices issued`}
            aside={<span className="text-[11.5px] text-ink3">State Sales Tax by State</span>}
          >
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr className="border-b border-line/60">
                    <Th>Invoice</Th>
                    <Th>Customer</Th>
                    <Th>Type</Th>
                    <Th>Due Date</Th>
                    <Th align="right">Amount</Th>
                    <Th align="right">Status</Th>
                    <Th align="center">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-line/40 last:border-0 hover:bg-black/[0.01]">
                      <Td className="font-mono text-[11.5px] font-semibold">{inv.id}</Td>
                      <Td className="text-ink2 font-medium">
                        <p className="truncate max-w-[180px]">{inv.customerName}</p>
                        {inv.taxExempt && (
                          <span className="text-[10px] text-brand font-medium">Tax-Exempt</span>
                        )}
                      </Td>
                      <Td className="text-ink3 text-[11.5px]">{inv.kind}</Td>
                      <Td className="text-ink3 text-[11.5px]">{formatDate(inv.dueDate)}</Td>
                      <Td align="right" className="font-mono font-medium text-[12px]">
                        {usd(inv.total)}
                      </Td>
                      <Td align="right">
                        <Badge
                          tone={
                            inv.status === "Paid"
                              ? "up"
                              : inv.status === "Overdue"
                              ? "down"
                              : "brand"
                          }
                        >
                          {inv.status}
                        </Badge>
                      </Td>
                      <Td align="center">
                        {inv.status !== "Paid" && !userPersona.allowedReportsOnly && (
                          <button
                            type="button"
                            onClick={() => handleRecordPayment(inv.id)}
                            className="rounded bg-up/10 px-2 py-1 text-[11px] font-semibold text-up hover:bg-up/20 ring-1 ring-up/25 transition-colors"
                          >
                            Receive $
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

        {/* Create Invoice Form */}
        <div className="lg:col-span-5">
          {!userPersona.canCreateJournals ? (
            <Panel title="Client Portal Notice">
              <div className="p-6 text-center text-ink3 text-[12.5px]">
                <p>Client portal users can review invoices but cannot generate new billing entries.</p>
              </div>
            </Panel>
          ) : (
            <Panel
              title="Issue & Post Invoice"
              subtitle="Automatically creates AR, Revenue, Tax, and COGS journal entries"
            >
              <form onSubmit={handleCreateInvoice} className="p-4 space-y-3">
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

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                    Customer Legal Name
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Acme Marine Logistics LLC"
                    required
                    className="mt-1 w-full rounded-md bg-white/90 px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none focus:ring-brand"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Invoice Type
                    </label>
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.target.value as any)}
                      className="mt-1 w-full rounded-md bg-white/90 px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none focus:ring-brand"
                    >
                      <option value="Product">Product (Relieves Inventory & COGS)</option>
                      <option value="Service">Service (Labor/Consulting only)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Project Allocation
                    </label>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      className="mt-1 w-full rounded-md bg-white/90 px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none focus:ring-brand"
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

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Issue Date
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
                      Payment Due Date
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

                {/* Items */}
                <div className="space-y-2 pt-2 border-t border-line/60">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Invoice Line Items
                    </span>
                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      className="text-[11px] font-semibold text-brand hover:underline"
                    >
                      + Add Item
                    </button>
                  </div>

                  {formItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg bg-ink/[0.02] p-2.5 ring-1 ring-line/50 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-1">
                        {kind === "Product" ? (
                          <select
                            value={item.sku}
                            onChange={(e) => handleUpdateItem(idx, "sku", e.target.value)}
                            className="w-full rounded bg-white px-2 py-1 text-[11.5px] ring-1 ring-line"
                          >
                            {inventory
                              .filter((i) => i.type === "Product")
                              .map((it) => (
                                <option key={it.sku} value={it.sku}>
                                  {it.sku} · {it.name} (Qty: {it.qtyOnHand})
                                </option>
                              ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => handleUpdateItem(idx, "description", e.target.value)}
                            placeholder="Service Description"
                            className="w-full rounded bg-white px-2 py-1 text-[11.5px] ring-1 ring-line"
                          />
                        )}
                        {formItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-[11px] text-down px-1 font-bold hover:opacity-80"
                          >
                            ×
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-ink3">Quantity</span>
                          <input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) => handleUpdateItem(idx, "qty", Number(e.target.value))}
                            className="w-full rounded bg-white px-2 py-1 text-right font-mono text-[11.5px] ring-1 ring-line"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-ink3">Unit Price ($)</span>
                          <input
                            type="number"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) =>
                              handleUpdateItem(idx, "unitPrice", Number(e.target.value))
                            }
                            className="w-full rounded bg-white px-2 py-1 text-right font-mono text-[11.5px] ring-1 ring-line"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Sales Tax Options */}
                <div className="rounded-lg bg-ink/[0.02] p-2.5 ring-1 ring-line/50 space-y-2">
                  <label className="flex items-center gap-2 text-[12px] text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={taxExempt}
                      onChange={(e) => setTaxExempt(e.target.checked)}
                      className="size-3.5 rounded accent-brand"
                    />
                    <span className="font-medium">Customer is Tax-Exempt (Form ST-3 on file)</span>
                  </label>

                  {!taxExempt && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11.5px] text-ink2">State/County Tax Rate:</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.1"
                          value={taxRate}
                          onChange={(e) => setTaxRate(e.target.value)}
                          className="w-20 rounded bg-white px-2 py-1 text-right font-mono text-[11.5px] ring-1 ring-line"
                        />
                        <span className="text-[11.5px] text-ink3">%</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Totals Summary */}
                <div className="rounded-lg bg-ink/[0.03] p-2.5 ring-1 ring-line/60 space-y-1 text-[12px] font-mono">
                  <div className="flex justify-between">
                    <span className="text-ink3 font-sans">Subtotal:</span>
                    <span>{usd(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink3 font-sans">
                      Sales Tax ({effectiveTaxRate}%):
                    </span>
                    <span>{usd(taxAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-line/60 pt-1 font-semibold text-[13px]">
                    <span className="text-ink font-sans">Total Amount:</span>
                    <span className="text-brand">{usd(totalAmount)}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-md bg-brand py-2 text-[12.5px] font-semibold text-primary-foreground hover:opacity-95 shadow-2xs"
                >
                  Issue & Post Invoice
                </button>

                <Note tone="brand">
                  US GAAP: Automatically debits Accounts Receivable (1100) and credits Revenue (4000/4100) + Tax (2200). Product sales relieve inventory lots under {activeCompany.costMethod}.
                </Note>
              </form>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
