import {
  ParameterScopeField,
  ParameterScopeLabel,
  useParameterScope,
} from "@/components/parameter-scope";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting, type FiscalPeriodParam } from "@/lib/parameters-context";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import { exportToCsv } from "@/lib/format";
import {
  ArrowLeft,
  Plus,
  Search,
  CalendarDays,
  Lock,
  Unlock,
  AlertTriangle,
  Edit2,
  Trash2,
  Download,
  ShieldAlert,
} from "lucide-react";

export const Route = createFileRoute("/parameters/fiscal-periods")({
  head: () =>
    pageHead(
      "Fiscal Periods & Calendar · LedgerX",
      "Monthly accounting close governance (hard and soft close) under US GAAP.",
    ),
  component: FiscalPeriodsPage,
});

function FiscalPeriodsPage() {
  const modal = useModal();
  const parameterScope = useParameterScope();
  const {
    activeCompany,
    fiscalPeriods,
    addFiscalPeriod,
    updateFiscalPeriod,
    deleteFiscalPeriod,
    userPersona,
  } = useAccounting();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [periodCode, setPeriodCode] = useState("");
  const [fiscalYear, setFiscalYear] = useState("FY2026");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [periodStatus, setPeriodStatus] = useState<"Open" | "Soft-Close" | "Locked">("Open");
  const [notes, setNotes] = useState("");

  const openCreateModal = () => {
    parameterScope.reset();
    setEditingId(null);
    setPeriodCode("");
    setFiscalYear(`FY${new Date().getFullYear()}`);
    setStartDate("");
    setEndDate("");
    setPeriodStatus("Open");
    setNotes("");
    setModalOpen(true);
  };

  const openEditModal = (p: FiscalPeriodParam) => {
    parameterScope.reset(p);
    setEditingId(p.id);
    setPeriodCode(p.periodCode);
    setFiscalYear(p.fiscalYear);
    setStartDate(p.startDate);
    setEndDate(p.endDate);
    setPeriodStatus(p.status);
    setNotes(p.notes || "");
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    try {
      e.preventDefault();
      if (!periodCode.trim() || !startDate || !endDate) {
        await modal.showAlert({
          title: "Required Fields",
          message: "Enter the period code, start date, and end date.",
          tone: "warning",
        });
        return;
      }

      if (!userPersona.canClosePeriod) {
        await modal.showAlert({
          title: "Restricted Access",
          message:
            "Only responsible accountants (CPAs) or administrators can change the fiscal calendar.",
          tone: "error",
        });
        return;
      }

      const cleanCode = periodCode.trim();

      if (editingId) {
        await updateFiscalPeriod(editingId, {
          ...parameterScope.value,
          periodCode: cleanCode,
          fiscalYear: fiscalYear.trim(),
          startDate,
          endDate,
          status: periodStatus,
          notes: notes.trim() || undefined,
        });
        await modal.showAlert({
          title: "Period Updated",
          message: `Settings for period ${cleanCode} updated successfully.`,
          tone: "success",
        });
      } else {
        await addFiscalPeriod({
          ...parameterScope.value,
          periodCode: cleanCode,
          fiscalYear: fiscalYear.trim(),
          startDate,
          endDate,
          status: periodStatus,
          notes: notes.trim() || undefined,
        });
        await modal.showAlert({
          title: "Period Created",
          message: `Fiscal period ${cleanCode} added to the calendar.`,
          tone: "success",
        });
      }

      setModalOpen(false);
    } catch {
      /* Persistence error is displayed by ParametersProvider. */
    }
  };

  const handleToggleStatus = async (p: FiscalPeriodParam) => {
    try {
      if (!userPersona.canClosePeriod) {
        await modal.showAlert({
          title: "Access Denied",
          message:
            "Only the responsible accountant (CPA) or an administrator can lock or unlock periods.",
          tone: "error",
        });
        return;
      }

      if (p.status === "Open") {
        const confirmLock = await modal.showConfirm({
          title: `Lock Period ${p.periodCode}?`,
          message: `Perform the accounting close and LOCK period ${p.periodCode}?\n\nNew entries will be blocked and adjustments will require a formal audit justification.`,
          tone: "warning",
          confirmText: "Yes, Lock Period",
          cancelText: "Cancel",
        });
        if (confirmLock) {
          await updateFiscalPeriod(p.id, {
            status: "Locked",
            closedBy: userPersona.name,
            closingDate: new Date().toISOString().split("T")[0]!,
            notes: p.notes
              ? `${p.notes} | Locked by ${userPersona.name}`
              : `Locked by ${userPersona.name}`,
          });
        }
      } else if (p.status === "Locked") {
        const reason = await modal.showPrompt({
          title: `Reopen Fiscal Period ${p.periodCode}`,
          message: "Enter the formal audit justification for reopening the period:",
          defaultValue: "Post-close adjustment requested by the CPA.",
          confirmText: "Reopen Period",
          cancelText: "Cancel",
        });
        if (reason) {
          await updateFiscalPeriod(p.id, {
            status: "Open",
            notes: `Reopened on ${new Date().toISOString().split("T")[0]}: ${reason}`,
          });
        }
      } else {
        // Soft-Close -> Locked
        await updateFiscalPeriod(p.id, {
          status: "Locked",
          closedBy: userPersona.name,
          closingDate: new Date().toISOString().split("T")[0]!,
        });
      }
    } catch {
      /* Persistence error is displayed by ParametersProvider. */
    }
  };

  const handleDelete = async (p: FiscalPeriodParam) => {
    try {
      if (!userPersona.canClosePeriod) {
        await modal.showAlert({
          title: "Access Denied",
          message: "Only administrators can delete calendar periods.",
          tone: "error",
        });
        return;
      }

      if (p.periodCode === activeCompany.activePeriod) {
        await modal.showAlert({
          title: "Active System Period",
          message: `Period ${p.periodCode} is the currently active fiscal period for the company and cannot be deleted.`,
          tone: "error",
        });
        return;
      }

      const confirmed = await modal.showConfirm({
        title: `Delete Period ${p.periodCode}?`,
        message: `Remove this period from the fiscal calendar?`,
        tone: "error",
        confirmText: "Yes, Delete",
        cancelText: "Cancel",
      });

      if (confirmed) {
        await deleteFiscalPeriod(p.id);
        await modal.showAlert({
          title: "Period Removed",
          message: `Period ${p.periodCode} was deleted from the calendar.`,
          tone: "success",
        });
      }
    } catch {
      /* Persistence error is displayed by ParametersProvider. */
    }
  };

  const filteredPeriods = fiscalPeriods.filter((p) => {
    const matchesSearch =
      p.periodCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.fiscalYear.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.notes && p.notes.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const lockedCount = fiscalPeriods.filter((p) => p.status === "Locked").length;
  const openCount = fiscalPeriods.filter((p) => p.status === "Open").length;
  const softCloseCount = fiscalPeriods.filter((p) => p.status === "Soft-Close").length;

  const handleExport = () => {
    exportToCsv(
      `fiscal-periods-${activeCompany.id}.csv`,
      [
        "Period",
        "Fiscal_Year",
        "Start_Date",
        "End_Date",
        "Status",
        "Closed_By",
        "Closing_Date",
        "Notes",
      ],
      fiscalPeriods.map((p) => [
        p.periodCode,
        p.fiscalYear,
        p.startDate,
        p.endDate,
        p.status,
        p.closedBy || "",
        p.closingDate || "",
        p.notes || "",
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
            title="Fiscal Periods & Calendar (Period Close)"
            description={`Accounting close governance and ledger integrity for ${activeCompany.name}`}
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
            <span>New Fiscal Period</span>
          </button>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Active Period"
          value={activeCompany.activePeriod}
          hint={activeCompany.isPeriodClosed ? "Locked" : "Open for entries"}
        />
        <Kpi
          label="Locked Periods"
          value={lockedCount.toString()}
          hint="Immutable under SOX rules"
        />
        <Kpi
          label="Under Review (Soft Close)"
          value={softCloseCount.toString()}
          hint="Preliminary review"
        />
        <Kpi label="Open" value={openCount.toString()} hint="Daily posting enabled" />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink3" />
          <input
            type="text"
            placeholder="Search period, fiscal year, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-line bg-white pl-9 pr-3 py-1.5 text-[12.5px] placeholder:text-ink3 focus:border-brand focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="text-ink3 font-medium">Status:</span>
          {["ALL", "Open", "Soft-Close", "Locked"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors cursor-pointer ${
                statusFilter === st
                  ? "bg-brand text-white font-semibold"
                  : "bg-white text-ink2 border border-line hover:bg-canvas"
              }`}
            >
              {st === "ALL"
                ? "All"
                : st === "Open"
                  ? "Open"
                  : st === "Soft-Close"
                    ? "Under Review"
                    : "Locked"}
            </button>
          ))}
        </div>
      </div>

      {/* Table Panel */}
      <Panel
        title={`Fiscal Period Calendar (${filteredPeriods.length})`}
        aside={<Badge tone="brand">US GAAP Hard Close</Badge>}
      >
        <Table>
          <thead>
            <tr className="border-b border-line/60">
              <Th className="whitespace-nowrap">Period</Th>
              <Th className="whitespace-nowrap">Fiscal Year</Th>
              <Th className="whitespace-nowrap">Start</Th>
              <Th className="whitespace-nowrap">End</Th>
              <Th className="whitespace-nowrap">Governance Status</Th>
              <Th className="whitespace-nowrap">Closed By</Th>
              <Th className="whitespace-nowrap">Closing Date</Th>
              <Th>Audit Notes</Th>
              <Th className="whitespace-nowrap">Scope / Companies</Th>
              <Th className="text-right whitespace-nowrap">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/40">
            {filteredPeriods.length === 0 ? (
              <tr>
                <Td colSpan={10} className="py-8 text-center text-ink3">
                  No fiscal periods found matching your filters.
                </Td>
              </tr>
            ) : (
              filteredPeriods.map((p) => {
                const isCurrent = p.periodCode === activeCompany.activePeriod;
                return (
                  <tr
                    key={p.id}
                    className={`hover:bg-ink/[0.015] transition-colors ${isCurrent ? "bg-brand/[0.02]" : ""}`}
                  >
                    <Td className="font-mono font-bold text-ink whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>{p.periodCode}</span>
                        {isCurrent && (
                          <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                            Current
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td className="font-mono text-[12px] text-ink2 whitespace-nowrap">{p.fiscalYear}</Td>
                    <Td className="font-mono text-[11.5px] text-ink3 whitespace-nowrap">{p.startDate}</Td>
                    <Td className="font-mono text-[11.5px] text-ink3 whitespace-nowrap">{p.endDate}</Td>
                    <Td className="whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(p)}
                        title="Click to change the period status"
                        className="inline-flex cursor-pointer transition-opacity hover:opacity-80"
                      >
                        <Badge
                          tone={
                            p.status === "Locked"
                              ? "down"
                              : p.status === "Soft-Close"
                                ? "neutral"
                                : "brand"
                          }
                        >
                          {p.status === "Locked" ? (
                            <>
                              <Lock className="size-3" /> Locked
                            </>
                          ) : p.status === "Soft-Close" ? (
                            <>
                              <AlertTriangle className="size-3" /> Under Review
                            </>
                          ) : (
                            <>
                              <Unlock className="size-3" /> Open
                            </>
                          )}
                        </Badge>
                      </button>
                    </Td>
                    <Td className="text-[12px] text-ink2 whitespace-nowrap">{p.closedBy || "—"}</Td>
                    <Td className="font-mono text-[11px] text-ink3 whitespace-nowrap">{p.closingDate || "—"}</Td>
                    <Td className="text-[11.5px] text-ink3 max-w-xs truncate" title={p.notes || undefined}>
                      {p.notes || "—"}
                    </Td>
                    <Td className="text-[12px] text-ink2 whitespace-nowrap">
                      <ParameterScopeLabel value={p} />
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(p)}
                          className="rounded p-1 text-ink3 hover:bg-canvas hover:text-ink transition-colors cursor-pointer"
                          title="Edit Period"
                        >
                          <Edit2 className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p)}
                          disabled={isCurrent}
                          className="rounded p-1 text-ink3 hover:bg-down/10 hover:text-down transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          title={isCurrent ? "The current period cannot be deleted" : "Delete Period"}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Panel>

      {/* Modal Form */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <h2 className="text-[16px] font-bold text-ink">
              {editingId ? `Edit Period ${periodCode}` : "New Fiscal Period"}
            </h2>
            <p className="text-[12px] text-ink3 mt-0.5">
              Manage accounting periods and cutoff dates for the general ledger.
            </p>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5">
              <ParameterScopeField control={parameterScope} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Code (YYYY-MM) *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 2027-01"
                    value={periodCode}
                    onChange={(e) => setPeriodCode(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Fiscal Year *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., FY2027"
                    value={fiscalYear}
                    onChange={(e) => setFiscalYear(e.target.value.toUpperCase())}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[12.5px] focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[12.5px] focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Governance Status
                </label>
                <select
                  value={periodStatus}
                  onChange={(e) => setPeriodStatus(e.target.value as any)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] focus:border-brand focus:outline-none"
                >
                  <option value="Open">Open (Entries allowed)</option>
                  <option value="Soft-Close">Under Review (Soft Close / CPA Review)</option>
                  <option value="Locked">Locked (Hard Close / Editing disabled)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Audit Notes / Justification
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g., Approved annual calendar or reason for adjustment."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] focus:border-brand focus:outline-none"
                />
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
                  {editingId ? "Save Changes" : "Create Period"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
