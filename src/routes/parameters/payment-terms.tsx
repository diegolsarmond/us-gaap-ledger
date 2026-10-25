import {
  ParameterScopeField,
  ParameterScopeLabel,
  useParameterScope,
} from "@/components/parameter-scope";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting, type PaymentTermParam } from "@/lib/parameters-context";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import { exportToCsv } from "@/lib/format";
import { ArrowLeft, Plus, Search, Clock, Edit2, Trash2, Check, Download } from "lucide-react";

export const Route = createFileRoute("/parameters/payment-terms")({
  head: () =>
    pageHead(
      "Payment Terms & Conditions · LedgerX",
      "Manage contractual payment terms (Net 15, Net 30, Net 60, and early payment discounts).",
    ),
  component: PaymentTermsPage,
});

function PaymentTermsPage() {
  const modal = useModal();
  const parameterScope = useParameterScope();
  const { activeCompany, paymentTerms, addPaymentTerm, updatePaymentTerm, deletePaymentTerm } =
    useAccounting();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [days, setDays] = useState("30");
  const [earlyDiscount, setEarlyDiscount] = useState("0");
  const [discountDays, setDiscountDays] = useState("0");
  const [isDefaultCustomer, setIsDefaultCustomer] = useState(false);
  const [isDefaultVendor, setIsDefaultVendor] = useState(false);
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");

  const openCreateModal = () => {
    parameterScope.reset();
    setEditingId(null);
    setCode("");
    setName("");
    setDays("30");
    setEarlyDiscount("0");
    setDiscountDays("0");
    setIsDefaultCustomer(false);
    setIsDefaultVendor(false);
    setStatus("Active");
    setModalOpen(true);
  };

  const openEditModal = (term: PaymentTermParam) => {
    parameterScope.reset(term);
    setEditingId(term.id);
    setCode(term.code);
    setName(term.name);
    setDays(term.days.toString());
    setEarlyDiscount((term.earlyDiscountPercentage || 0).toString());
    setDiscountDays((term.discountDays || 0).toString());
    setIsDefaultCustomer(term.isDefaultCustomer);
    setIsDefaultVendor(term.isDefaultVendor);
    setStatus(term.status);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    try {
      e.preventDefault();
      if (!code.trim() || !name.trim() || !days.trim()) {
        await modal.showAlert({
          title: "Required Fields",
          message: "Enter the code, description, and payment term in days.",
          tone: "warning",
        });
        return;
      }

      const numDays = parseInt(days, 10);
      if (isNaN(numDays) || numDays < 0) {
        await modal.showAlert({
          title: "Invalid Payment Term",
          message: "The payment term must be a whole number of days greater than or equal to 0.",
          tone: "warning",
        });
        return;
      }

      const discountPct = parseFloat(earlyDiscount) || 0;
      const numDiscDays = parseInt(discountDays, 10) || 0;
      const cleanCode = code.trim().toUpperCase();

      if (editingId) {
        await updatePaymentTerm(editingId, {
          ...parameterScope.value,
          code: cleanCode,
          name: name.trim(),
          days: numDays,
          earlyDiscountPercentage: discountPct > 0 ? discountPct : undefined,
          discountDays: numDiscDays > 0 ? numDiscDays : undefined,
          isDefaultCustomer,
          isDefaultVendor,
          status,
        });
        await modal.showAlert({
          title: "Payment Term Updated",
          message: `Payment term "${name.trim()}" updated successfully.`,
          tone: "success",
        });
      } else {
        await addPaymentTerm({
          ...parameterScope.value,
          code: cleanCode,
          name: name.trim(),
          days: numDays,
          earlyDiscountPercentage: discountPct > 0 ? discountPct : undefined,
          discountDays: numDiscDays > 0 ? numDiscDays : undefined,
          isDefaultCustomer,
          isDefaultVendor,
          status,
        });
        await modal.showAlert({
          title: "Payment Term Added",
          message: `Payment term "${name.trim()}" (${numDays} days) added successfully.`,
          tone: "success",
        });
      }

      setModalOpen(false);
    } catch {
      /* Persistence error is displayed by ParametersProvider. */
    }
  };

  const handleDelete = async (term: PaymentTermParam) => {
    try {
      const confirmed = await modal.showConfirm({
        title: `Delete Payment Term?`,
        message: `Remove payment term "${term.name}" (${term.code})?\n\nPreviously issued financial documents will retain their original due dates.`,
        tone: "error",
        confirmText: "Yes, Delete",
        cancelText: "Cancel",
      });

      if (confirmed) {
        await deletePaymentTerm(term.id);
        await modal.showAlert({
          title: "Payment Term Removed",
          message: `Payment term ${term.code} was deleted.`,
          tone: "success",
        });
      }
    } catch {
      /* Persistence error is displayed by ParametersProvider. */
    }
  };

  const handleToggleStatus = async (term: PaymentTermParam) => {
    try {
      const nextStatus = term.status === "Active" ? "Inactive" : "Active";
      await updatePaymentTerm(term.id, { status: nextStatus });
    } catch {
      /* Persistence error is displayed by ParametersProvider. */
    }
  };

  const filteredTerms = paymentTerms.filter((t) => {
    const matchesSearch =
      t.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeCount = paymentTerms.filter((t) => t.status === "Active").length;

  const handleExport = () => {
    exportToCsv(
      `payment-terms-${activeCompany.id}.csv`,
      [
        "Code",
        "Name",
        "Payment_Days",
        "Early_Discount_Pct",
        "Discount_Days",
        "Customer_Default",
        "Vendor_Default",
        "Status",
      ],
      paymentTerms.map((t) => [
        t.code,
        t.name,
        t.days.toString(),
        (t.earlyDiscountPercentage || 0).toString(),
        (t.discountDays || 0).toString(),
        t.isDefaultCustomer ? "Yes" : "No",
        t.isDefaultVendor ? "Yes" : "No",
        t.status,
      ]),
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              to="/parameters"
              className="flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline"
            >
              <ArrowLeft className="size-3.5" /> Back to Parameters
            </Link>
          </div>
          <PageTitle
            title="Payment Terms & Credit Policies"
            description={`Credit policies, due dates, and early payment discounts for ${activeCompany.name}`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-[12px] font-semibold text-ink2 transition-colors hover:bg-canvas hover:text-ink shadow-2xs cursor-pointer"
          >
            <Download className="size-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 shadow-sm cursor-pointer"
          >
            <Plus className="size-3.5" />
            <span>New Payment Term</span>
          </button>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Active Payment Terms" value={activeCount.toString()} hint="Current policies" />
        <Kpi
          label="Customer Default"
          value={paymentTerms.find((t) => t.isDefaultCustomer)?.code || "None"}
          hint="Applied to new invoices"
        />
        <Kpi
          label="Vendor Default"
          value={paymentTerms.find((t) => t.isDefaultVendor)?.code || "None"}
          hint="Applied to new bills"
        />
        <Kpi
          label="Early Payment Discounts"
          value={paymentTerms.filter((t) => (t.earlyDiscountPercentage || 0) > 0).length.toString()}
          hint="2/10 Net 30 terms"
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink3" />
          <input
            type="text"
            placeholder="Search term or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-line bg-white pl-9 pr-3 py-1.5 text-[12.5px] placeholder:text-ink3 focus:border-brand focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="text-ink3 font-medium">Status:</span>
          {["ALL", "Active", "Inactive"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                statusFilter === st
                  ? "bg-brand text-white font-semibold"
                  : "bg-white text-ink2 border border-line hover:bg-canvas"
              }`}
            >
              {st === "ALL" ? "All" : st === "Active" ? "Active" : "Inactive"}
            </button>
          ))}
        </div>
      </div>

      {/* Table Panel */}
      <Panel
        title={`Payment Terms (${filteredTerms.length})`}
        aside={<Badge tone="brand">Credit Policy</Badge>}
      >
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Descriptive Name</Th>
              <Th className="text-right">Payment Term (Days)</Th>
              <Th>Early Payment Discount</Th>
              <Th>Customer Default</Th>
              <Th>Vendor Default</Th>
              <Th>Status</Th>
              <Th>Scope / Companies</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filteredTerms.map((t) => (
              <tr key={t.id} className="hover:bg-ink/[0.015]">
                <Td className="font-mono font-bold text-ink">{t.code}</Td>
                <Td className="font-medium text-ink">{t.name}</Td>
                <Td className="text-right font-mono font-bold text-brand">
                  {t.days === 0 ? "Immediate" : `${t.days} days`}
                </Td>
                <Td>
                  {t.earlyDiscountPercentage ? (
                    <span className="rounded bg-up/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-up">
                      {t.earlyDiscountPercentage}% within {t.discountDays} days
                    </span>
                  ) : (
                    <span className="text-[11.5px] text-ink3">—</span>
                  )}
                </Td>
                <Td>
                  {t.isDefaultCustomer && (
                    <span className="inline-flex items-center gap-1 rounded bg-brand/10 px-2 py-0.5 text-[10.5px] font-semibold text-brand">
                      <Check className="size-3" /> AR Default
                    </span>
                  )}
                </Td>
                <Td>
                  {t.isDefaultVendor && (
                    <span className="inline-flex items-center gap-1 rounded bg-ink/10 px-2 py-0.5 text-[10.5px] font-semibold text-ink">
                      <Check className="size-3" /> AP Default
                    </span>
                  )}
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(t)}
                    title="Click to change status"
                    className="cursor-pointer"
                  >
                    <Badge tone={t.status === "Active" ? "brand" : "neutral"}>
                      {t.status === "Active" ? "Active" : "Inactive"}
                    </Badge>
                  </button>
                </Td>
                <Td>
                  <ParameterScopeLabel value={t} />
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(t)}
                      className="rounded p-1 text-ink3 hover:bg-canvas hover:text-ink transition-colors"
                      title="Edit Payment Term"
                    >
                      <Edit2 className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      className="rounded p-1 text-ink3 hover:bg-down/10 hover:text-down transition-colors"
                      title="Delete Payment Term"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      {/* Modal Form */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <h2 className="text-[16px] font-bold text-ink">
              {editingId ? "Edit Payment Term" : "New Payment Term"}
            </h2>
            <p className="text-[12px] text-ink3 mt-0.5">
              Set invoice payment terms in days and early payment discount rules.
            </p>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5">
              <ParameterScopeField control={parameterScope} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Identifier Code *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., NET_30"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono uppercase text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Total Term (Days) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g., 30"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Name / Description *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Net 30 Days (Due in 30 days)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[13px] focus:border-brand focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Early Payment Discount (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="e.g., 2.0"
                    value={earlyDiscount}
                    onChange={(e) => setEarlyDiscount(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Discount Deadline (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g., 10"
                    value={discountDays}
                    onChange={(e) => setDiscountDays(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2 rounded-lg bg-panel p-3 border border-line">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDefaultCustomer}
                    onChange={(e) => setIsDefaultCustomer(e.target.checked)}
                    className="size-4 rounded text-brand focus:ring-brand"
                  />
                  <span className="text-[12px] font-medium text-ink">
                    Set as Default for Customers (Invoices)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDefaultVendor}
                    onChange={(e) => setIsDefaultVendor(e.target.checked)}
                    className="size-4 rounded text-brand focus:ring-brand"
                  />
                  <span className="text-[12px] font-medium text-ink">
                    Set as Default for Vendors (Bills)
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] focus:border-brand focus:outline-none"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-line px-3.5 py-1.5 text-[12.5px] font-semibold text-ink2 hover:bg-canvas transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-ink px-4 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 transition-opacity"
                >
                  {editingId ? "Save Changes" : "Add Payment Term"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
