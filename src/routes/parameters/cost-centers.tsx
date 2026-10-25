import {
  ParameterScopeField,
  ParameterScopeLabel,
  useParameterScope,
} from "@/components/parameter-scope";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting, type CostCenterParam } from "@/lib/parameters-context";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import { exportToCsv, usd } from "@/lib/format";
import {
  ArrowLeft,
  Plus,
  Search,
  Building2,
  Edit2,
  Trash2,
  DollarSign,
  Download,
} from "lucide-react";

export const Route = createFileRoute("/parameters/cost-centers")({
  head: () =>
    pageHead(
      "Cost Centers & Units · LedgerX",
      "Departmental cost allocation, budget limits, and expense governance.",
    ),
  component: CostCentersPage,
});

function CostCentersPage() {
  const modal = useModal();
  const parameterScope = useParameterScope();
  const { activeCompany, costCenters, addCostCenter, updateCostCenter, deleteCostCenter } =
    useAccounting();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [manager, setManager] = useState("");
  const [annualBudget, setAnnualBudget] = useState("0");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");

  const openCreateModal = () => {
    parameterScope.reset();
    setEditingId(null);
    setCode("");
    setName("");
    setManager("");
    setAnnualBudget("150000");
    setDescription("");
    setStatus("Active");
    setModalOpen(true);
  };

  const openEditModal = (cc: CostCenterParam) => {
    parameterScope.reset(cc);
    setEditingId(cc.id);
    setCode(cc.code);
    setName(cc.name);
    setManager(cc.manager);
    setAnnualBudget(cc.annualBudget.toString());
    setDescription(cc.description);
    setStatus(cc.status);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    try {
      e.preventDefault();
      if (!code.trim() || !name.trim() || !manager.trim()) {
        await modal.showAlert({
          title: "Required Fields",
          message: "Enter the code, cost center name, and responsible manager.",
          tone: "warning",
        });
        return;
      }

      const budgetNum = parseFloat(annualBudget);
      if (isNaN(budgetNum) || budgetNum < 0) {
        await modal.showAlert({
          title: "Invalid Budget",
          message: "The annual budget must be a positive number or zero.",
          tone: "warning",
        });
        return;
      }

      const cleanCode = code.trim().toUpperCase();

      if (editingId) {
        await updateCostCenter(editingId, {
          ...parameterScope.value,
          code: cleanCode,
          name: name.trim(),
          manager: manager.trim(),
          annualBudget: budgetNum,
          description: description.trim(),
          status,
        });
        await modal.showAlert({
          title: "Cost Center Updated",
          message: `Cost center "${name.trim()}" updated successfully.`,
          tone: "success",
        });
      } else {
        await addCostCenter({
          ...parameterScope.value,
          code: cleanCode,
          name: name.trim(),
          manager: manager.trim(),
          annualBudget: budgetNum,
          description: description.trim(),
          status,
        });
        await modal.showAlert({
          title: "Cost Center Added",
          message: `Cost center "${name.trim()}" (${cleanCode}) added successfully.`,
          tone: "success",
        });
      }

      setModalOpen(false);
    } catch {
      /* Persistence error is displayed by ParametersProvider. */
    }
  };

  const handleDelete = async (cc: CostCenterParam) => {
    try {
      const confirmed = await modal.showConfirm({
        title: `Delete Cost Center?`,
        message: `Delete cost center "${cc.name}" (${cc.code})?\n\nPreviously allocated records and transactions will remain in the accounting history.`,
        tone: "error",
        confirmText: "Yes, Delete Cost Center",
        cancelText: "Cancel",
      });

      if (confirmed) {
        await deleteCostCenter(cc.id);
        await modal.showAlert({
          title: "Cost Center Removed",
          message: `Cost center ${cc.code} was deleted.`,
          tone: "success",
        });
      }
    } catch {
      /* Persistence error is displayed by ParametersProvider. */
    }
  };

  const handleToggleStatus = async (cc: CostCenterParam) => {
    try {
      const nextStatus = cc.status === "Active" ? "Inactive" : "Active";
      await updateCostCenter(cc.id, { status: nextStatus });
    } catch {
      /* Persistence error is displayed by ParametersProvider. */
    }
  };

  const filteredCostCenters = costCenters.filter((c) => {
    const matchesSearch =
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.manager.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeCenters = costCenters.filter((c) => c.status === "Active");
  const totalAllocatedBudget = activeCenters.reduce((s, c) => s + c.annualBudget, 0);

  const handleExport = () => {
    exportToCsv(
      `cost-centers-${activeCompany.id}.csv`,
      ["Code", "Name", "Manager", "Annual_Budget", "Description", "Status"],
      costCenters.map((c) => [
        c.code,
        c.name,
        c.manager,
        c.annualBudget.toString(),
        c.description,
        c.status,
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
            title="Cost Centers & Business Units"
            description={`Cost allocation and departmental budget control for ${activeCompany.name}`}
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
            <span>New Cost Center</span>
          </button>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Active Cost Centers"
          value={activeCenters.length.toString()}
          hint="Operating departments"
        />
        <Kpi
          label="Consolidated Budget"
          value={usd(totalAllocatedBudget)}
          hint="Approved annual limit"
        />
        <Kpi
          label="Average per Cost Center"
          value={activeCenters.length > 0 ? usd(totalAllocatedBudget / activeCenters.length) : "$0"}
          hint="Annual weighted average"
        />
        <Kpi
          label="Budget Currency"
          value={activeCompany.baseCurrency}
          hint="US GAAP Functional Currency"
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink3" />
          <input
            type="text"
            placeholder="Search by code, name, or manager..."
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
        title={`Registered Cost Centers (${filteredCostCenters.length})`}
        aside={<Badge tone="brand">Departmental Units</Badge>}
      >
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Unit / Department Name</Th>
              <Th>Responsible Manager</Th>
              <Th className="text-right">Annual Budget</Th>
              <Th>Operational Purpose</Th>
              <Th>Status</Th>
              <Th>Scope / Companies</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filteredCostCenters.map((c) => (
              <tr key={c.id} className="hover:bg-ink/[0.015]">
                <Td className="font-mono font-bold text-ink">{c.code}</Td>
                <Td className="font-semibold text-ink">{c.name}</Td>
                <Td className="text-[12.5px] text-ink2">{c.manager}</Td>
                <Td className="text-right font-mono font-bold text-brand">{usd(c.annualBudget)}</Td>
                <Td className="text-[12px] text-ink3 max-w-xs truncate">{c.description || "—"}</Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(c)}
                    title="Click to change status"
                    className="cursor-pointer"
                  >
                    <Badge tone={c.status === "Active" ? "brand" : "neutral"}>
                      {c.status === "Active" ? "Active" : "Inactive"}
                    </Badge>
                  </button>
                </Td>
                <Td>
                  <ParameterScopeLabel value={c} />
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(c)}
                      className="rounded p-1 text-ink3 hover:bg-canvas hover:text-ink transition-colors"
                      title="Edit Cost Center"
                    >
                      <Edit2 className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c)}
                      className="rounded p-1 text-ink3 hover:bg-down/10 hover:text-down transition-colors"
                      title="Delete Cost Center"
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
              {editingId ? "Edit Cost Center" : "New Cost Center"}
            </h2>
            <p className="text-[12px] text-ink3 mt-0.5">
              Allocate costs and expenses by management unit.
            </p>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5">
              <ParameterScopeField control={parameterScope} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Structured Code *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., CC-100"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono uppercase text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Annual Budget ($) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="e.g., 250000"
                    value={annualBudget}
                    onChange={(e) => setAnnualBudget(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Cost Center / Department Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Operations & Marine Fleet"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[13px] focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Responsible Manager *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Dave Higgins (Operations Director)"
                  value={manager}
                  onChange={(e) => setManager(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[13px] focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Operational Description
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g., Daily maintenance, fueling, and yard crew activities."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] focus:border-brand focus:outline-none"
                />
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
                  {editingId ? "Save Changes" : "Add Cost Center"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
