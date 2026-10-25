import {
  ParameterScopeField,
  ParameterScopeLabel,
  useParameterScope,
} from "@/components/parameter-scope";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting, type ExpenseCategoryParam } from "@/lib/parameters-context";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import { exportToCsv } from "@/lib/format";
import { ArrowLeft, Plus, Search, Tag, Edit2, Trash2, BookmarkCheck, Download } from "lucide-react";

export const Route = createFileRoute("/parameters/expense-categories")({
  head: () =>
    pageHead(
      "Expense Categories & Account Mapping · LedgerX",
      "Map operating expenses to US GAAP accounts and tax deductibility rules.",
    ),
  component: ExpenseCategoriesPage,
});

function ExpenseCategoriesPage() {
  const modal = useModal();
  const parameterScope = useParameterScope();
  const {
    activeCompany,
    expenseCategories,
    accounts,
    addExpenseCategory,
    updateExpenseCategory,
    deleteExpenseCategory,
  } = useAccounting();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [glAccountCode, setGlAccountCode] = useState("6200");
  const [taxDeductibility, setTaxDeductibility] = useState<
    "100% Deductible" | "50% Meals & Ent." | "Non-Deductible"
  >("100% Deductible");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");

  // Filter accounts for expenses and COGS
  const expenseAccounts = accounts.filter(
    (a) => a.type === "Operating Expense" || a.type === "COGS" || a.type === "Other Expense",
  );

  const openCreateModal = () => {
    parameterScope.reset();
    setEditingId(null);
    setCode("");
    setName("");
    setGlAccountCode("6200");
    setTaxDeductibility("100% Deductible");
    setDescription("");
    setStatus("Active");
    setModalOpen(true);
  };

  const openEditModal = (cat: ExpenseCategoryParam) => {
    parameterScope.reset(cat);
    setEditingId(cat.id);
    setCode(cat.code);
    setName(cat.name);
    setGlAccountCode(cat.glAccountCode);
    setTaxDeductibility(cat.taxDeductibility);
    setDescription(cat.description);
    setStatus(cat.status);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    try {
      e.preventDefault();
      if (!code.trim() || !name.trim() || !glAccountCode.trim()) {
        await modal.showAlert({
          title: "Required Fields",
          message: "Enter the code, category name, and debit account.",
          tone: "warning",
        });
        return;
      }

      const cleanCode = code.trim().toUpperCase();

      if (editingId) {
        await updateExpenseCategory(editingId, {
          ...parameterScope.value,
          code: cleanCode,
          name: name.trim(),
          glAccountCode,
          taxDeductibility,
          description: description.trim(),
          status,
        });
        await modal.showAlert({
          title: "Category Updated",
          message: `Account mapping for category "${name.trim()}" updated.`,
          tone: "success",
        });
      } else {
        await addExpenseCategory({
          ...parameterScope.value,
          code: cleanCode,
          name: name.trim(),
          glAccountCode,
          taxDeductibility,
          description: description.trim(),
          status,
        });
        await modal.showAlert({
          title: "Category Added",
          message: `Category "${name.trim()}" linked to account ${glAccountCode}.`,
          tone: "success",
        });
      }

      setModalOpen(false);
    } catch {
      /* Persistence error is displayed by ParametersProvider. */
    }
  };

  const handleDelete = async (cat: ExpenseCategoryParam) => {
    try {
      const confirmed = await modal.showConfirm({
        title: `Delete Expense Category?`,
        message: `Delete category "${cat.name}" (${cat.code})?\n\nExisting journal entries will retain their original accounts.`,
        tone: "error",
        confirmText: "Yes, Delete Category",
        cancelText: "Cancel",
      });

      if (confirmed) {
        await deleteExpenseCategory(cat.id);
        await modal.showAlert({
          title: "Category Removed",
          message: `Category ${cat.code} was deleted.`,
          tone: "success",
        });
      }
    } catch {
      /* Persistence error is displayed by ParametersProvider. */
    }
  };

  const handleToggleStatus = async (cat: ExpenseCategoryParam) => {
    try {
      const nextStatus = cat.status === "Active" ? "Inactive" : "Active";
      await updateExpenseCategory(cat.id, { status: nextStatus });
    } catch {
      /* Persistence error is displayed by ParametersProvider. */
    }
  };

  const filteredCategories = expenseCategories.filter((c) => {
    const matchesSearch =
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.glAccountCode.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeCount = expenseCategories.filter((c) => c.status === "Active").length;
  const fullyDeductibleCount = expenseCategories.filter(
    (c) => c.taxDeductibility === "100% Deductible",
  ).length;

  const handleExport = () => {
    exportToCsv(
      `categorias-despesas-${activeCompany.id}.csv`,
      ["Code", "Name", "GL_Account", "Tax_Deductibility", "Description", "Status"],
      expenseCategories.map((c) => [
        c.code,
        c.name,
        c.glAccountCode,
        c.taxDeductibility,
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
            title="Expense Categories & Account Mapping"
            description={`Classify vendor bills with automatic mapping to the US GAAP general ledger for ${activeCompany.name}`}
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
            <span>New Category</span>
          </button>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Active Categories" value={activeCount.toString()} hint="Operational mappings" />
        <Kpi
          label="100% Deductible (IRS)"
          value={fullyDeductibleCount.toString()}
          hint="Full tax deduction"
        />
        <Kpi
          label="Meals & Entertainment"
          value={expenseCategories
            .filter((c) => c.taxDeductibility === "50% Meals & Ent.")
            .length.toString()}
          hint="50% IRS tax limit"
        />
        <Kpi
          label="Chart of Accounts Entries"
          value={accounts.length.toString()}
          hint="Standard chart of accounts"
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink3" />
          <input
            type="text"
            placeholder="Search by code, name, or account..."
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
        title={`Registered Categories (${filteredCategories.length})`}
        aside={<Badge tone="brand">GL Mapping</Badge>}
      >
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Category Display Name</Th>
              <Th>Linked US GAAP Account</Th>
              <Th>Tax Deductibility (IRS)</Th>
              <Th>Description</Th>
              <Th>Status</Th>
              <Th>Scope / Companies</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filteredCategories.map((c) => {
              const acct = accounts.find((a) => a.code === c.glAccountCode);
              return (
                <tr key={c.id} className="hover:bg-ink/[0.015]">
                  <Td className="font-mono font-bold text-ink">{c.code}</Td>
                  <Td className="font-semibold text-ink">{c.name}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5 font-mono text-[12px]">
                      <span className="rounded bg-brand/10 px-1.5 py-0.5 font-bold text-brand">
                        {c.glAccountCode}
                      </span>
                      <span className="text-ink2">
                        {acct ? acct.name : "General Ledger Account"}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                        c.taxDeductibility === "100% Deductible"
                          ? "bg-up/10 text-up font-semibold"
                          : c.taxDeductibility === "50% Meals & Ent."
                            ? "bg-amber-50 text-amber-700 font-semibold"
                            : "bg-down/10 text-down font-semibold"
                      }`}
                    >
                      {c.taxDeductibility}
                    </span>
                  </Td>
                  <Td className="text-[12px] text-ink3 max-w-xs truncate">
                    {c.description || "—"}
                  </Td>
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
                        title="Edit Category"
                      >
                        <Edit2 className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        className="rounded p-1 text-ink3 hover:bg-down/10 hover:text-down transition-colors"
                        title="Delete Category"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>

      {/* Modal Form */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <h2 className="text-[16px] font-bold text-ink">
              {editingId ? "Edit Expense Category" : "New Expense Category"}
            </h2>
            <p className="text-[12px] text-ink3 mt-0.5">
              Link directly to a general ledger account for automatic journal entries.
            </p>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5">
              <ParameterScopeField control={parameterScope} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Internal Code *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., EXP-CLOUD"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono uppercase text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    US GAAP Account *
                  </label>
                  <select
                    value={glAccountCode}
                    onChange={(e) => setGlAccountCode(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[12px] focus:border-brand focus:outline-none"
                  >
                    {expenseAccounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} - {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Expense Display Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g., SaaS & Cloud Infrastructure"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[13px] focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Tax Classification (IRS Deductibility)
                </label>
                <select
                  value={taxDeductibility}
                  onChange={(e) => setTaxDeductibility(e.target.value as any)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] focus:border-brand focus:outline-none"
                >
                  <option value="100% Deductible">
                    100% Deductible (Ordinary and Necessary Expense)
                  </option>
                  <option value="50% Meals & Ent.">
                    50% Deduction Limit (Meals and Entertainment)
                  </option>
                  <option value="Non-Deductible">
                    Non-Deductible (Fines or Personal Expenses)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Description of Covered Expenses
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g., AWS cloud servers, Slack licenses, Google Workspace, and databases."
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
                  {editingId ? "Save Changes" : "Add Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
