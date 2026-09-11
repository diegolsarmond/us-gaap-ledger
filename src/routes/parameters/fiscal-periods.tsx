import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting, type FiscalPeriodParam } from "@/lib/accounting-store";
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
      "Períodos & Calendário Fiscal · LedgerX",
      "Governança de fechamento contábil mensal (Hard & Soft Period Close) sob US GAAP.",
    ),
  component: FiscalPeriodsPage,
});

function FiscalPeriodsPage() {
  const modal = useModal();
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
    setEditingId(null);
    setPeriodCode("2027-01");
    setFiscalYear("FY2027");
    setStartDate("2027-01-01");
    setEndDate("2027-01-31");
    setPeriodStatus("Open");
    setNotes("");
    setModalOpen(true);
  };

  const openEditModal = (p: FiscalPeriodParam) => {
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
    e.preventDefault();
    if (!periodCode.trim() || !startDate || !endDate) {
      await modal.showAlert({
        title: "Campos Obrigatórios",
        message: "Por favor informe o Código do Período, Data Inicial e Data Final.",
        tone: "warning",
      });
      return;
    }

    if (!userPersona.canClosePeriod) {
      await modal.showAlert({
        title: "Acesso Restrito",
        message: "Apenas contadores responsáveis (CPA) ou administradores podem alterar o calendário fiscal.",
        tone: "error",
      });
      return;
    }

    const cleanCode = periodCode.trim();

    if (editingId) {
      updateFiscalPeriod(editingId, {
        periodCode: cleanCode,
        fiscalYear: fiscalYear.trim(),
        startDate,
        endDate,
        status: periodStatus,
        notes: notes.trim() || undefined,
      });
      await modal.showAlert({
        title: "Período Atualizado",
        message: `Parâmetros do período ${cleanCode} atualizados com sucesso.`,
        tone: "success",
      });
    } else {
      addFiscalPeriod({
        periodCode: cleanCode,
        fiscalYear: fiscalYear.trim(),
        startDate,
        endDate,
        status: periodStatus,
        notes: notes.trim() || undefined,
      });
      await modal.showAlert({
        title: "Período Criado",
        message: `Período fiscal ${cleanCode} adicionado ao calendário.`,
        tone: "success",
      });
    }

    setModalOpen(false);
  };

  const handleToggleStatus = async (p: FiscalPeriodParam) => {
    if (!userPersona.canClosePeriod) {
      await modal.showAlert({
        title: "Acesso Negado",
        message: "Apenas o contador responsável (CPA) ou administrador pode bloquear ou desbloquear períodos.",
        tone: "error",
      });
      return;
    }

    if (p.status === "Open") {
      const confirmLock = await modal.showConfirm({
        title: `Bloquear Período ${p.periodCode}?`,
        message: `Deseja executar o fechamento contábil e BLOQUEAR o período ${p.periodCode}?\n\nNovos lançamentos serão impedidos e ajustes exigirão justificativa formal de auditoria.`,
        tone: "warning",
        confirmText: "Sim, Bloquear Período",
        cancelText: "Cancelar",
      });
      if (confirmLock) {
        updateFiscalPeriod(p.id, {
          status: "Locked",
          closedBy: userPersona.name,
          closingDate: new Date().toISOString().split("T")[0]!,
          notes: p.notes ? `${p.notes} | Bloqueado por ${userPersona.name}` : `Bloqueado por ${userPersona.name}`,
        });
      }
    } else if (p.status === "Locked") {
      const reason = await modal.showPrompt({
        title: `Reabrir Período Fiscal ${p.periodCode}`,
        message: "Informe a justificativa formal de auditoria para reabertura do período:",
        defaultValue: "Ajuste pós-fechamento solicitado pelo CPA.",
        confirmText: "Reabrir Período",
        cancelText: "Cancelar",
      });
      if (reason) {
        updateFiscalPeriod(p.id, {
          status: "Open",
          notes: `Reaberto em ${new Date().toISOString().split("T")[0]}: ${reason}`,
        });
      }
    } else {
      // Soft-Close -> Locked
      updateFiscalPeriod(p.id, {
        status: "Locked",
        closedBy: userPersona.name,
        closingDate: new Date().toISOString().split("T")[0]!,
      });
    }
  };

  const handleDelete = async (p: FiscalPeriodParam) => {
    if (!userPersona.canClosePeriod) {
      await modal.showAlert({
        title: "Acesso Negado",
        message: "Apenas administradores podem excluir períodos do calendário.",
        tone: "error",
      });
      return;
    }

    if (p.periodCode === activeCompany.activePeriod) {
      await modal.showAlert({
        title: "Período Ativo do Sistema",
        message: `O período ${p.periodCode} é o período fiscal atualmente ativo para a empresa e não pode ser excluído.`,
        tone: "error",
      });
      return;
    }

    const confirmed = await modal.showConfirm({
      title: `Excluir Período ${p.periodCode}?`,
      message: `Tem certeza que deseja remover este período do calendário fiscal?`,
      tone: "error",
      confirmText: "Sim, Excluir",
      cancelText: "Cancelar",
    });

    if (confirmed) {
      deleteFiscalPeriod(p.id);
      await modal.showAlert({
        title: "Período Removido",
        message: `O período ${p.periodCode} foi excluído do calendário.`,
        tone: "success",
      });
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
      `periodos-fiscais-${activeCompany.id}.csv`,
      ["Periodo", "Exercicio", "Data_Inicio", "Data_Fim", "Status", "Fechado_Por", "Data_Fechamento", "Notas"],
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
              <ArrowLeft className="size-3.5" /> Voltar aos Parâmetros
            </Link>
          </div>
          <PageTitle
            title="Períodos & Calendário Fiscal (Period Close)"
            description={`Governança de fechamento contábil e proteção de integridade dos livros de ${activeCompany.name}`}
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
            <span>Novo Período Fiscal</span>
          </button>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Período Ativo"
          value={activeCompany.activePeriod}
          hint={activeCompany.isPeriodClosed ? "Bloqueado (Locked)" : "Aberto para lançamentos"}
        />
        <Kpi
          label="Períodos Bloqueados"
          value={lockedCount.toString()}
          hint="Imutáveis por regra SOX"
        />
        <Kpi
          label="Em Conferência (Soft)"
          value={softCloseCount.toString()}
          hint="Revisão preliminar"
        />
        <Kpi
          label="Abertos"
          value={openCount.toString()}
          hint="Escrituração diária ativa"
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink3" />
          <input
            type="text"
            placeholder="Buscar período, ano fiscal ou notas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-line bg-white pl-9 pr-3 py-1.5 text-[12.5px] placeholder:text-ink3 focus:border-brand focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="text-ink3 font-medium">Status:</span>
          {["ALL", "Open", "Soft-Close", "Locked"].map((st) => (
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
              {st === "ALL"
                ? "Todos"
                : st === "Open"
                  ? "Abertos"
                  : st === "Soft-Close"
                    ? "Conferência"
                    : "Bloqueados"}
            </button>
          ))}
        </div>
      </div>

      {/* Table Panel */}
      <Panel
        title={`Calendário de Períodos Fiscais (${filteredPeriods.length})`}
        badge={<Badge tone="brand">US GAAP Hard Close</Badge>}
      >
        <Table>
          <thead>
            <tr>
              <Th>Período</Th>
              <Th>Exercício</Th>
              <Th>Início</Th>
              <Th>Término</Th>
              <Th>Status de Governança</Th>
              <Th>Fechado Por</Th>
              <Th>Data Fechamento</Th>
              <Th>Notas de Auditoria</Th>
              <Th className="text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {filteredPeriods.map((p) => {
              const isCurrent = p.periodCode === activeCompany.activePeriod;
              return (
                <tr key={p.id} className={`hover:bg-ink/[0.015] ${isCurrent ? "bg-brand/[0.02]" : ""}`}>
                  <Td className="font-mono font-bold text-ink">
                    <div className="flex items-center gap-2">
                      <span>{p.periodCode}</span>
                      {isCurrent && (
                        <span className="rounded bg-brand/10 px-1.5 py-0.2 text-[10px] font-semibold text-brand">
                          Atual
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td className="font-mono text-[12px] text-ink2">{p.fiscalYear}</Td>
                  <Td className="font-mono text-[11.5px] text-ink3">{p.startDate}</Td>
                  <Td className="font-mono text-[11.5px] text-ink3">{p.endDate}</Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(p)}
                      title="Clique para alternar o status do período"
                      className="cursor-pointer"
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
                        <span className="flex items-center gap-1">
                          {p.status === "Locked" ? (
                            <>
                              <Lock className="size-3" /> Bloqueado
                            </>
                          ) : p.status === "Soft-Close" ? (
                            <>
                              <AlertTriangle className="size-3" /> Conferência
                            </>
                          ) : (
                            <>
                              <Unlock className="size-3" /> Aberto
                            </>
                          )}
                        </span>
                      </Badge>
                    </button>
                  </Td>
                  <Td className="text-[12px] text-ink2">{p.closedBy || "—"}</Td>
                  <Td className="font-mono text-[11px] text-ink3">{p.closingDate || "—"}</Td>
                  <Td className="text-[11.5px] text-ink3 max-w-xs truncate">{p.notes || "—"}</Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditModal(p)}
                        className="rounded p-1 text-ink3 hover:bg-canvas hover:text-ink transition-colors"
                        title="Editar Período"
                      >
                        <Edit2 className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p)}
                        disabled={isCurrent}
                        className="rounded p-1 text-ink3 hover:bg-down/10 hover:text-down transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={isCurrent ? "Período corrente não pode ser excluído" : "Excluir Período"}
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
              {editingId ? `Editar Período ${periodCode}` : "Novo Período Fiscal"}
            </h2>
            <p className="text-[12px] text-ink3 mt-0.5">
              Governança de competência e datas de corte para livros contábeis.
            </p>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Código (YYYY-MM) *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 2027-01"
                    value={periodCode}
                    onChange={(e) => setPeriodCode(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Exercício Fiscal *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: FY2027"
                    value={fiscalYear}
                    onChange={(e) => setFiscalYear(e.target.value.toUpperCase())}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Data de Início *
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
                    Data de Término *
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
                  Status de Governança
                </label>
                <select
                  value={periodStatus}
                  onChange={(e) => setPeriodStatus(e.target.value as any)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] focus:border-brand focus:outline-none"
                >
                  <option value="Open">Aberto (Lançamentos permitidos)</option>
                  <option value="Soft-Close">Em Conferência (Soft-Close / CPA review)</option>
                  <option value="Locked">Bloqueado (Hard Close / Travado contra edições)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Notas de Auditoria / Justificativa
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Calendário anual aprovado em ata ou motivo do ajuste."
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
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-ink px-4 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 transition-opacity"
                >
                  {editingId ? "Salvar Alterações" : "Criar Período"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
