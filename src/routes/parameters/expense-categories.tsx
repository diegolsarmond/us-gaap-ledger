import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting, type ExpenseCategoryParam } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import { exportToCsv } from "@/lib/format";
import {
  ArrowLeft,
  Plus,
  Search,
  Tag,
  Edit2,
  Trash2,
  BookmarkCheck,
  Download,
} from "lucide-react";

export const Route = createFileRoute("/parameters/expense-categories")({
  head: () =>
    pageHead(
      "Categorias de Despesas & Mapeamento Contábil · LedgerX",
      "De-para de despesas operacionais para contas do Plano de Contas US GAAP e regras de dedutibilidade fiscal.",
    ),
  component: ExpenseCategoriesPage,
});

function ExpenseCategoriesPage() {
  const modal = useModal();
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
    e.preventDefault();
    if (!code.trim() || !name.trim() || !glAccountCode.trim()) {
      await modal.showAlert({
        title: "Campos Obrigatórios",
        message: "Por favor informe o Código, o Nome da Categoria e a Conta Contábil de Débito.",
        tone: "warning",
      });
      return;
    }

    const cleanCode = code.trim().toUpperCase();

    if (editingId) {
      updateExpenseCategory(editingId, {
        code: cleanCode,
        name: name.trim(),
        glAccountCode,
        taxDeductibility,
        description: description.trim(),
        status,
      });
      await modal.showAlert({
        title: "Categoria Atualizada",
        message: `Mapeamento contábil da categoria "${name.trim()}" atualizado.`,
        tone: "success",
      });
    } else {
      addExpenseCategory({
        code: cleanCode,
        name: name.trim(),
        glAccountCode,
        taxDeductibility,
        description: description.trim(),
        status,
      });
      await modal.showAlert({
        title: "Categoria Cadastrada",
        message: `Categoria "${name.trim()}" vinculada à conta ${glAccountCode}.`,
        tone: "success",
      });
    }

    setModalOpen(false);
  };

  const handleDelete = async (cat: ExpenseCategoryParam) => {
    const confirmed = await modal.showConfirm({
      title: `Excluir Categoria de Despesa?`,
      message: `Deseja realmente excluir a categoria "${cat.name}" (${cat.code})?\n\nLançamentos já escriturados no diário manterão suas contas originais preservadas.`,
      tone: "error",
      confirmText: "Sim, Excluir Categoria",
      cancelText: "Cancelar",
    });

    if (confirmed) {
      deleteExpenseCategory(cat.id);
      await modal.showAlert({
        title: "Categoria Removida",
        message: `A categoria ${cat.code} foi excluída.`,
        tone: "success",
      });
    }
  };

  const handleToggleStatus = (cat: ExpenseCategoryParam) => {
    const nextStatus = cat.status === "Active" ? "Inactive" : "Active";
    updateExpenseCategory(cat.id, { status: nextStatus });
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
  const fullyDeductibleCount = expenseCategories.filter((c) => c.taxDeductibility === "100% Deductible").length;

  const handleExport = () => {
    exportToCsv(
      `categorias-despesas-${activeCompany.id}.csv`,
      ["Codigo", "Nome", "Conta_Contabil", "Dedutibilidade_Fiscal", "Descricao", "Status"],
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
              <ArrowLeft className="size-3.5" /> Voltar aos Parâmetros
            </Link>
          </div>
          <PageTitle
            title="Categorias de Despesas & Mapeamento Contábil"
            description={`Classificação ágil de contas a pagar (Bills) com direcionamento automático no Razão US GAAP de ${activeCompany.name}`}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-[12px] font-semibold text-ink2 transition-colors hover:bg-canvas hover:text-ink shadow-2xs"
          >
            <Download className="size-3.5" />
            <span>Exportar CSV</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 shadow-sm"
          >
            <Plus className="size-3.5" />
            <span>Nova Categoria</span>
          </button>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Categorias Ativas"
          value={activeCount.toString()}
          hint="Mapeamentos operacionais"
        />
        <Kpi
          label="100% Dedutíveis (IRS)"
          value={fullyDeductibleCount.toString()}
          hint="Dedução fiscal integral"
        />
        <Kpi
          label="Refeições & Representação"
          value={expenseCategories.filter((c) => c.taxDeductibility === "50% Meals & Ent.").length.toString()}
          hint="50% Limite fiscal IRS"
        />
        <Kpi
          label="Contas no Plano"
          value={accounts.length.toString()}
          hint="Plano de contas padronizado"
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink3" />
          <input
            type="text"
            placeholder="Buscar por código, nome ou conta contábil..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-line bg-white pl-9 pr-3 py-1.5 text-[12.5px] placeholder:text-ink3 focus:border-brand focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 text-[12px]">
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
              {st === "ALL" ? "Todos" : st === "Active" ? "Ativos" : "Inativos"}
            </button>
          ))}
        </div>
      </div>

      {/* Table Panel */}
      <Panel
        title={`Categorias Cadastradas (${filteredCategories.length})`}
        badge={<Badge tone="brand">GL Mapping</Badge>}
      >
        <Table>
          <thead>
            <tr>
              <Th>Código</Th>
              <Th>Nome Amigável da Categoria</Th>
              <Th>Conta US GAAP Vinculada</Th>
              <Th>Dedutibilidade Fiscal (IRS)</Th>
              <Th>Descrição</Th>
              <Th>Status</Th>
              <Th className="text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {filteredCategories.map((c) => {
              const acct = accounts.find((a) => a.code === c.glAccountCode);
              return (
                <tr key={c.id} className="hover:bg-ink/[0.015]">
                  <Td className="font-mono font-bold text-ink">
                    {c.code}
                  </Td>
                  <Td className="font-semibold text-ink">{c.name}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5 font-mono text-[12px]">
                      <span className="rounded bg-brand/10 px-1.5 py-0.5 font-bold text-brand">
                        {c.glAccountCode}
                      </span>
                      <span className="text-ink2">{acct ? acct.name : "Conta no Razão"}</span>
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
                      title="Clique para alternar status"
                      className="cursor-pointer"
                    >
                      <Badge tone={c.status === "Active" ? "brand" : "neutral"}>
                        {c.status === "Active" ? "Ativa" : "Inativa"}
                      </Badge>
                    </button>
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditModal(c)}
                        className="rounded p-1 text-ink3 hover:bg-canvas hover:text-ink transition-colors"
                        title="Editar Categoria"
                      >
                        <Edit2 className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        className="rounded p-1 text-ink3 hover:bg-down/10 hover:text-down transition-colors"
                        title="Excluir Categoria"
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
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <h2 className="text-[16px] font-bold text-ink">
              {editingId ? "Editar Categoria de Despesa" : "Nova Categoria de Despesa"}
            </h2>
            <p className="text-[12px] text-ink3 mt-0.5">
              Associação direta com a conta contábil para lançamentos automáticos no razão.
            </p>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Código Interno *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: EXP-CLOUD"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono uppercase text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Conta Contábil US GAAP *
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
                    {!expenseAccounts.some((a) => a.code === "6200") && (
                      <option value="6200">6200 - General & Admin Expense</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Nome Amigável da Despesa *
                </label>
                <input
                  type="text"
                  placeholder="Ex: SaaS & Infraestrutura Cloud"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[13px] focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Classificação Fiscal (IRS Deductibility)
                </label>
                <select
                  value={taxDeductibility}
                  onChange={(e) => setTaxDeductibility(e.target.value as any)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] focus:border-brand focus:outline-none"
                >
                  <option value="100% Deductible">100% Dedutível (Despesa Ordinária e Necessária)</option>
                  <option value="50% Meals & Ent.">50% Limite Dedutível (Refeições e Representação)</option>
                  <option value="Non-Deductible">Não Dedutível (Multas ou Despesas Pessoais)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Descrição dos Gastos Abrangidos
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Servidores em nuvem AWS, licenças Slack, Google Workspace e banco de dados."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] focus:border-brand focus:outline-none"
                >
                  <option value="Active">Ativa</option>
                  <option value="Inactive">Inativa</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-line px-3.5 py-1.5 text-[12.5px] font-semibold text-ink2 hover:bg-canvas transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-ink px-4 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 transition-opacity"
                >
                  {editingId ? "Salvar Alterações" : "Cadastrar Categoria"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
