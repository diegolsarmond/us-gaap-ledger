import {
  ParameterScopeField,
  ParameterScopeLabel,
  useParameterScope,
} from "@/components/parameter-scope";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting, type TaxJurisdictionParam } from "@/lib/parameters-context";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import { exportToCsv } from "@/lib/format";
import { ArrowLeft, Plus, Search, Scale, Edit2, Trash2, Building, Download } from "lucide-react";

export const Route = createFileRoute("/parameters/tax-jurisdictions")({
  head: () =>
    pageHead(
      "Tax Jurisdictions & Sales Tax · LedgerX",
      "Manage state and local sales tax rates, filing obligations, and liability accounts.",
    ),
  component: TaxJurisdictionsPage,
});

function TaxJurisdictionsPage() {
  const modal = useModal();
  const parameterScope = useParameterScope();
  const {
    activeCompany,
    taxJurisdictions,
    accounts,
    addTaxJurisdiction,
    updateTaxJurisdiction,
    deleteTaxJurisdiction,
  } = useAccounting();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [code, setCode] = useState("");
  const [state, setState] = useState("FL");
  const [name, setName] = useState("");
  const [rate, setRate] = useState("0");
  const [taxType, setTaxType] = useState<"State Sales Tax" | "Local Surcharge" | "Combined">(
    "State Sales Tax",
  );
  const [glAccountCode, setGlAccountCode] = useState("");
  const [filingFrequency, setFilingFrequency] = useState<"Monthly" | "Quarterly" | "Annual">(
    "Monthly",
  );
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");

  const liabilityAccounts = accounts.filter((a) => a.type === "Liability");

  const openCreateModal = () => {
    parameterScope.reset();
    setEditingId(null);
    setCode("");
    setState(activeCompany.state || "FL");
    setName("");
    setRate("6.0");
    setTaxType("State Sales Tax");
    setGlAccountCode("");
    setFilingFrequency("Monthly");
    setStatus("Active");
    setModalOpen(true);
  };

  const openEditModal = (tax: TaxJurisdictionParam) => {
    parameterScope.reset(tax);
    setEditingId(tax.id);
    setCode(tax.code);
    setState(tax.state);
    setName(tax.name);
    setRate(tax.rate.toString());
    setTaxType(tax.taxType);
    setGlAccountCode(tax.glAccountCode);
    setFilingFrequency(tax.filingFrequency);
    setStatus(tax.status);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    try {
      e.preventDefault();
      if (!code.trim() || !name.trim() || !rate.trim()) {
        await modal.showAlert({
          title: "Required Fields",
          message: "Enter the code, jurisdiction name, and tax rate.",
          tone: "warning",
        });
        return;
      }

      const rateNum = parseFloat(rate);
      if (isNaN(rateNum) || rateNum < 0) {
        await modal.showAlert({
          title: "Invalid Tax Rate",
          message: "The percentage rate must be positive or zero (exempt).",
          tone: "warning",
        });
        return;
      }

      const cleanCode = code.trim().toUpperCase();

      if (editingId) {
        await updateTaxJurisdiction(editingId, {
          ...parameterScope.value,
          code: cleanCode,
          state: state.toUpperCase(),
          name: name.trim(),
          rate: rateNum,
          taxType,
          glAccountCode,
          filingFrequency,
          status,
        });
        await modal.showAlert({
          title: "Jurisdiction Updated",
          message: `Tax settings for "${name.trim()}" updated successfully.`,
          tone: "success",
        });
      } else {
        await addTaxJurisdiction({
          ...parameterScope.value,
          code: cleanCode,
          state: state.toUpperCase(),
          name: name.trim(),
          rate: rateNum,
          taxType,
          glAccountCode,
          filingFrequency,
          status,
        });
        await modal.showAlert({
          title: "Jurisdiction Added",
          message: `Jurisdiction "${name.trim()}" added with a tax rate of ${rateNum}%.`,
          tone: "success",
        });
      }

      setModalOpen(false);
    } catch {
      /* Persistence error is displayed by ParametersProvider. */
    }
  };

  const handleDelete = async (tax: TaxJurisdictionParam) => {
    try {
      const confirmed = await modal.showConfirm({
        title: `Delete Tax Jurisdiction?`,
        message: `Delete tax rule "${tax.name}" (${tax.code})?\n\nPreviously issued invoices and tax assessments will retain their history.`,
        tone: "error",
        confirmText: "Yes, Delete Jurisdiction",
        cancelText: "Cancel",
      });

      if (confirmed) {
        await deleteTaxJurisdiction(tax.id);
        await modal.showAlert({
          title: "Jurisdiction Removed",
          message: `Jurisdiction ${tax.code} was deleted.`,
          tone: "success",
        });
      }
    } catch {
      /* Persistence error is displayed by ParametersProvider. */
    }
  };

  const handleToggleStatus = async (tax: TaxJurisdictionParam) => {
    try {
      const nextStatus = tax.status === "Active" ? "Inactive" : "Active";
      await updateTaxJurisdiction(tax.id, { status: nextStatus });
    } catch {
      /* Persistence error is displayed by ParametersProvider. */
    }
  };

  const filteredTaxes = taxJurisdictions.filter((t) => {
    const matchesSearch =
      t.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.state.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeRatesSum = taxJurisdictions
    .filter((t) => t.status === "Active")
    .reduce((s, t) => s + t.rate, 0);
  const activeCount = taxJurisdictions.filter((t) => t.status === "Active").length;
  const avgRate = activeCount > 0 ? (activeRatesSum / activeCount).toFixed(2) : "0.00";

  const handleExport = () => {
    exportToCsv(
      `tax-jurisdictions-${activeCompany.id}.csv`,
      [
        "Code",
        "State",
        "Name",
        "Tax_Rate_Pct",
        "Tax_Type",
        "GL_Account",
        "Filing Frequency",
        "Status",
      ],
      taxJurisdictions.map((t) => [
        t.code,
        t.state,
        t.name,
        t.rate.toString(),
        t.taxType,
        t.glAccountCode,
        t.filingFrequency,
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
            title="Tax Jurisdictions & Sales Tax Rates"
            description={`State and local tax tables for automatic calculations on invoices for ${activeCompany.name}`}
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
            <span>New Jurisdiction</span>
          </button>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Active Jurisdictions"
          value={activeCount.toString()}
          hint={`Company location: ${activeCompany.state}`}
        />
        <Kpi label="Average Tax Rate" value={`${avgRate}%`} hint="Active weighted average" />
        <Kpi label="Accrual Account" value="2200 - Sales Tax" hint="Current Liabilities" />
        <Kpi label="Default Nexus" value={activeCompany.state} hint="Primary Jurisdiction" />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink3" />
          <input
            type="text"
            placeholder="Search by code, agency, or state..."
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
        title={`Tax Jurisdiction Table (${filteredTaxes.length})`}
        aside={<Badge tone="brand">Sales Tax Nexus</Badge>}
      >
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>State</Th>
              <Th>Tax Agency / Jurisdiction</Th>
              <Th className="text-right">Tax Rate</Th>
              <Th>Type</Th>
              <Th>Liability Account</Th>
              <Th>Filing Frequency</Th>
              <Th>Status</Th>
              <Th>Scope / Companies</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filteredTaxes.map((t) => (
              <tr key={t.id} className="hover:bg-ink/[0.015]">
                <Td className="font-mono font-bold text-ink">{t.code}</Td>
                <Td>
                  <span className="rounded bg-panel px-2 py-0.5 font-mono text-[11px] font-semibold text-ink2 ring-1 ring-line">
                    {t.state}
                  </span>
                </Td>
                <Td className="font-medium text-ink">{t.name}</Td>
                <Td className="text-right font-mono font-bold text-brand">{t.rate.toFixed(2)}%</Td>
                <Td className="text-[11.5px] text-ink2">{t.taxType}</Td>
                <Td className="font-mono text-[11.5px] text-ink3">{t.glAccountCode}</Td>
                <Td className="text-[11.5px] text-ink2">{t.filingFrequency}</Td>
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
                      title="Edit Jurisdiction"
                    >
                      <Edit2 className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      className="rounded p-1 text-ink3 hover:bg-down/10 hover:text-down transition-colors"
                      title="Delete Jurisdiction"
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
              {editingId ? "Edit Tax Jurisdiction" : "New Tax Jurisdiction"}
            </h2>
            <p className="text-[12px] text-ink3 mt-0.5">
              Configure state sales tax rates in the US GAAP Ledger.
            </p>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5">
              <ParameterScopeField control={parameterScope} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Rule Code *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., FL-STATE"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono uppercase text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    State (2-Letter Code) *
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="e.g., FL"
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono uppercase text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Government Agency / Jurisdiction Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Florida Department of Revenue"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[13px] focus:border-brand focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Tax Rate (%) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 6.00"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Tax Type
                  </label>
                  <select
                    value={taxType}
                    onChange={(e) => setTaxType(e.target.value as any)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] focus:border-brand focus:outline-none"
                  >
                    <option value="State Sales Tax">State Sales Tax</option>
                    <option value="Local Surcharge">Local (County/City Surcharge)</option>
                    <option value="Combined">Combined (State + Local)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Liability Account (GL)
                  </label>
                  <select
                    value={glAccountCode}
                    onChange={(e) => setGlAccountCode(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[12px] font-mono focus:border-brand focus:outline-none"
                  >
                    {liabilityAccounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} - {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Filing Frequency
                  </label>
                  <select
                    value={filingFrequency}
                    onChange={(e) => setFilingFrequency(e.target.value as any)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] focus:border-brand focus:outline-none"
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Annual">Annual</option>
                  </select>
                </div>
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
                  {editingId ? "Save Changes" : "Add Jurisdiction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
