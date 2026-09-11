import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting, type PaymentTermParam } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import { exportToCsv } from "@/lib/format";
import {
  ArrowLeft,
  Plus,
  Search,
  Clock,
  Edit2,
  Trash2,
  Check,
  Download,
} from "lucide-react";

export const Route = createFileRoute("/parameters/payment-terms")({
  head: () =>
    pageHead(
      "Prazos & Condições de Pagamento · LedgerX",
      "Parametrização de prazos contratuais comerciais (Net 15, Net 30, Net 60, Descontos Financeiros).",
    ),
  component: PaymentTermsPage,
});

function PaymentTermsPage() {
  const modal = useModal();
  const {
    activeCompany,
    paymentTerms,
    addPaymentTerm,
    updatePaymentTerm,
    deletePaymentTerm,
  } = useAccounting();

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
    e.preventDefault();
    if (!code.trim() || !name.trim() || !days.trim()) {
      await modal.showAlert({
        title: "Campos Obrigatórios",
        message: "Por favor informe o Código, a Descrição e o Prazo em Dias.",
        tone: "warning",
      });
      return;
    }

    const numDays = parseInt(days, 10);
    if (isNaN(numDays) || numDays < 0) {
      await modal.showAlert({
        title: "Prazo Inválido",
        message: "O prazo em dias deve ser um número inteiro maior ou igual a 0.",
        tone: "warning",
      });
      return;
    }

    const discountPct = parseFloat(earlyDiscount) || 0;
    const numDiscDays = parseInt(discountDays, 10) || 0;
    const cleanCode = code.trim().toUpperCase();

    if (editingId) {
      updatePaymentTerm(editingId, {
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
        title: "Condição Comercial Atualizada",
        message: `Prazo "${name.trim()}" atualizado com sucesso.`,
        tone: "success",
      });
    } else {
      addPaymentTerm({
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
        title: "Condição Cadastrada",
        message: `Prazo "${name.trim()}" (${numDays} dias) adicionado com sucesso.`,
        tone: "success",
      });
    }

    setModalOpen(false);
  };

  const handleDelete = async (term: PaymentTermParam) => {
    const confirmed = await modal.showConfirm({
      title: `Excluir Condição de Pagamento?`,
      message: `Tem certeza que deseja remover a condição "${term.name}" (${term.code})?\n\nDocumentos financeiros já emitidos preservarão o vencimento original.`,
      tone: "error",
      confirmText: "Sim, Excluir",
      cancelText: "Cancelar",
    });

    if (confirmed) {
      deletePaymentTerm(term.id);
      await modal.showAlert({
        title: "Condição Removida",
        message: `A condição de pagamento ${term.code} foi excluída.`,
        tone: "success",
      });
    }
  };

  const handleToggleStatus = (term: PaymentTermParam) => {
    const nextStatus = term.status === "Active" ? "Inactive" : "Active";
    updatePaymentTerm(term.id, { status: nextStatus });
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
      `prazos-pagamento-${activeCompany.id}.csv`,
      ["Codigo", "Nome", "Dias_Prazo", "Desconto_Pontualidade_Pct", "Dias_Desconto", "Padrao_Cliente", "Padrao_Fornecedor", "Status"],
      paymentTerms.map((t) => [
        t.code,
        t.name,
        t.days.toString(),
        (t.earlyDiscountPercentage || 0).toString(),
        (t.discountDays || 0).toString(),
        t.isDefaultCustomer ? "Sim" : "Nao",
        t.isDefaultVendor ? "Sim" : "Nao",
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
              <ArrowLeft className="size-3.5" /> Voltar aos Parâmetros
            </Link>
          </div>
          <PageTitle
            title="Condições & Prazos Comerciais de Pagamento"
            description={`Políticas de crédito, vencimentos e descontos comerciais para ${activeCompany.name}`}
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
            <span>Novo Prazo Comercial</span>
          </button>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Prazos Ativos"
          value={activeCount.toString()}
          hint="Políticas em vigor"
        />
        <Kpi
          label="Padrão Clientes"
          value={paymentTerms.find((t) => t.isDefaultCustomer)?.code || "Nenhum"}
          hint="Aplicado em novas Invoices"
        />
        <Kpi
          label="Padrão Fornecedores"
          value={paymentTerms.find((t) => t.isDefaultVendor)?.code || "Nenhum"}
          hint="Aplicado em novas Bills"
        />
        <Kpi
          label="Descontos Pontualidade"
          value={paymentTerms.filter((t) => (t.earlyDiscountPercentage || 0) > 0).length.toString()}
          hint="Cláusulas 2/10 Net 30"
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink3" />
          <input
            type="text"
            placeholder="Buscar prazo ou código..."
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
        title={`Prazos Comerciais (${filteredTerms.length})`}
        badge={<Badge tone="brand">Credit Policy</Badge>}
      >
        <Table>
          <thead>
            <tr>
              <Th>Código</Th>
              <Th>Nome Descritivo</Th>
              <Th className="text-right">Dias de Prazo</Th>
              <Th>Desconto Pontualidade</Th>
              <Th>Padrão Clientes</Th>
              <Th>Padrão Fornecedores</Th>
              <Th>Status</Th>
              <Th className="text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {filteredTerms.map((t) => (
              <tr key={t.id} className="hover:bg-ink/[0.015]">
                <Td className="font-mono font-bold text-ink">
                  {t.code}
                </Td>
                <Td className="font-medium text-ink">{t.name}</Td>
                <Td className="text-right font-mono font-bold text-brand">
                  {t.days === 0 ? "Imediato" : `${t.days} dias`}
                </Td>
                <Td>
                  {t.earlyDiscountPercentage ? (
                    <span className="rounded bg-up/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-up">
                      {t.earlyDiscountPercentage}% em {t.discountDays} dias
                    </span>
                  ) : (
                    <span className="text-[11.5px] text-ink3">—</span>
                  )}
                </Td>
                <Td>
                  {t.isDefaultCustomer && (
                    <span className="inline-flex items-center gap-1 rounded bg-brand/10 px-2 py-0.5 text-[10.5px] font-semibold text-brand">
                      <Check className="size-3" /> Padrão AR
                    </span>
                  )}
                </Td>
                <Td>
                  {t.isDefaultVendor && (
                    <span className="inline-flex items-center gap-1 rounded bg-ink/10 px-2 py-0.5 text-[10.5px] font-semibold text-ink">
                      <Check className="size-3" /> Padrão AP
                    </span>
                  )}
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(t)}
                    title="Clique para alternar status"
                    className="cursor-pointer"
                  >
                    <Badge tone={t.status === "Active" ? "brand" : "neutral"}>
                      {t.status === "Active" ? "Ativo" : "Inativo"}
                    </Badge>
                  </button>
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(t)}
                      className="rounded p-1 text-ink3 hover:bg-canvas hover:text-ink transition-colors"
                      title="Editar Prazo"
                    >
                      <Edit2 className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      className="rounded p-1 text-ink3 hover:bg-down/10 hover:text-down transition-colors"
                      title="Excluir Prazo"
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
              {editingId ? "Editar Condição de Pagamento" : "Nova Condição Comercial"}
            </h2>
            <p className="text-[12px] text-ink3 mt-0.5">
              Definição de prazo em dias e regras de desconto antecipado para faturas.
            </p>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Código Identificador *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: NET_30"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono uppercase text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Prazo Total (Dias) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Ex: 30"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Nome / Descrição Comercial *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Net 30 Days (Vencimento em 30 dias)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[13px] focus:border-brand focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Desconto Antecipação (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Ex: 2.0"
                    value={earlyDiscount}
                    onChange={(e) => setEarlyDiscount(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Dias Limite p/ Desconto
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Ex: 10"
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
                    Definir como Padrão para Clientes (Invoices)
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
                    Definir como Padrão para Fornecedores (Bills)
                  </span>
                </label>
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
                  {editingId ? "Salvar Alterações" : "Cadastrar Condição"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
