import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting, type CostCenterParam } from "@/lib/accounting-store";
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
      "Centros de Custo & Unidades · LedgerX",
      "Segmentação departamental analítica, limites orçamentários e governança de despesas.",
    ),
  component: CostCentersPage,
});

function CostCentersPage() {
  const modal = useModal();
  const {
    activeCompany,
    costCenters,
    addCostCenter,
    updateCostCenter,
    deleteCostCenter,
  } = useAccounting();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [manager, setManager] = useState("");
  const [annualBudget, setAnnualBudget] = useState("150000");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");

  const openCreateModal = () => {
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
    e.preventDefault();
    if (!code.trim() || !name.trim() || !manager.trim()) {
      await modal.showAlert({
        title: "Campos Obrigatórios",
        message: "Por favor informe o Código, Nome do Centro de Custo e Gestor Responsável.",
        tone: "warning",
      });
      return;
    }

    const budgetNum = parseFloat(annualBudget);
    if (isNaN(budgetNum) || budgetNum < 0) {
      await modal.showAlert({
        title: "Orçamento Inválido",
        message: "O orçamento anual deve ser um valor numérico positivo ou zero.",
        tone: "warning",
      });
      return;
    }

    const cleanCode = code.trim().toUpperCase();

    if (editingId) {
      updateCostCenter(editingId, {
        code: cleanCode,
        name: name.trim(),
        manager: manager.trim(),
        annualBudget: budgetNum,
        description: description.trim(),
        status,
      });
      await modal.showAlert({
        title: "Centro de Custo Atualizado",
        message: `Centro "${name.trim()}" atualizado com sucesso.`,
        tone: "success",
      });
    } else {
      addCostCenter({
        code: cleanCode,
        name: name.trim(),
        manager: manager.trim(),
        annualBudget: budgetNum,
        description: description.trim(),
        status,
      });
      await modal.showAlert({
        title: "Centro de Custo Cadastrado",
        message: `Centro "${name.trim()}" (${cleanCode}) adicionado com sucesso.`,
        tone: "success",
      });
    }

    setModalOpen(false);
  };

  const handleDelete = async (cc: CostCenterParam) => {
    const confirmed = await modal.showConfirm({
      title: `Excluir Centro de Custo?`,
      message: `Deseja excluir o centro "${cc.name}" (${cc.code})?\n\nRegistros e transações alocadas anteriormente continuarão no histórico contábil.`,
      tone: "error",
      confirmText: "Sim, Excluir Centro",
      cancelText: "Cancelar",
    });

    if (confirmed) {
      deleteCostCenter(cc.id);
      await modal.showAlert({
        title: "Centro Removido",
        message: `O centro de custo ${cc.code} foi excluído.`,
        tone: "success",
      });
    }
  };

  const handleToggleStatus = (cc: CostCenterParam) => {
    const nextStatus = cc.status === "Active" ? "Inactive" : "Active";
    updateCostCenter(cc.id, { status: nextStatus });
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
      `centros-de-custo-${activeCompany.id}.csv`,
      ["Codigo", "Nome", "Gestor", "Orcamento_Anual", "Descricao", "Status"],
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
              <ArrowLeft className="size-3.5" /> Voltar aos Parâmetros
            </Link>
          </div>
          <PageTitle
            title="Centros de Custo & Unidades de Negócio"
            description={`Segmentação analítica e controle de limites orçamentários departamentais para ${activeCompany.name}`}
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
            <span>Novo Centro de Custo</span>
          </button>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Centros Ativos"
          value={activeCenters.length.toString()}
          hint="Departamentos operacionais"
        />
        <Kpi
          label="Orçamento Consolidado"
          value={usd(totalAllocatedBudget)}
          hint="Teto anual aprovado"
        />
        <Kpi
          label="Média por Centro"
          value={activeCenters.length > 0 ? usd(totalAllocatedBudget / activeCenters.length) : "$0"}
          hint="Média ponderada anual"
        />
        <Kpi
          label="Moeda Orçamentária"
          value={activeCompany.baseCurrency}
          hint="US GAAP Functional Currency"
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink3" />
          <input
            type="text"
            placeholder="Buscar por código, nome ou gestor..."
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
        title={`Centros de Custo Cadastrados (${filteredCostCenters.length})`}
        badge={<Badge tone="brand">Departmental Units</Badge>}
      >
        <Table>
          <thead>
            <tr>
              <Th>Código</Th>
              <Th>Nome da Unidade / Departamento</Th>
              <Th>Gestor Responsável</Th>
              <Th className="text-right">Orçamento Anual</Th>
              <Th>Finalidade Operacional</Th>
              <Th>Status</Th>
              <Th className="text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {filteredCostCenters.map((c) => (
              <tr key={c.id} className="hover:bg-ink/[0.015]">
                <Td className="font-mono font-bold text-ink">
                  {c.code}
                </Td>
                <Td className="font-semibold text-ink">{c.name}</Td>
                <Td className="text-[12.5px] text-ink2">{c.manager}</Td>
                <Td className="text-right font-mono font-bold text-brand">
                  {usd(c.annualBudget)}
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
                      {c.status === "Active" ? "Ativo" : "Inativo"}
                    </Badge>
                  </button>
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(c)}
                      className="rounded p-1 text-ink3 hover:bg-canvas hover:text-ink transition-colors"
                      title="Editar Centro"
                    >
                      <Edit2 className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c)}
                      className="rounded p-1 text-ink3 hover:bg-down/10 hover:text-down transition-colors"
                      title="Excluir Centro"
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
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <h2 className="text-[16px] font-bold text-ink">
              {editingId ? "Editar Centro de Custo" : "Novo Centro de Custo"}
            </h2>
            <p className="text-[12px] text-ink3 mt-0.5">
              Segmentação gerencial para alocação analítica de custos e despesas.
            </p>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Código Estruturado *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: CC-100"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono uppercase text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Orçamento Anual ($) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    placeholder="Ex: 250000"
                    value={annualBudget}
                    onChange={(e) => setAnnualBudget(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Nome do Centro / Departamento *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Operações & Frota Marítima"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[13px] focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Gestor Responsável *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Dave Higgins (Diretor de Operações)"
                  value={manager}
                  onChange={(e) => setManager(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[13px] focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Descrição Operacional
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Atividades diárias de manutenção, abastecimento e equipes de pátio."
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
                  <option value="Active">Ativo</option>
                  <option value="Inactive">Inativo</option>
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
                  {editingId ? "Salvar Alterações" : "Cadastrar Centro"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
