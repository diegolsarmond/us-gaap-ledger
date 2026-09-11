import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting, type TaxJurisdictionParam } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import { exportToCsv } from "@/lib/format";
import {
  ArrowLeft,
  Plus,
  Search,
  Scale,
  Edit2,
  Trash2,
  Building,
  Download,
} from "lucide-react";

export const Route = createFileRoute("/parameters/tax-jurisdictions")({
  head: () =>
    pageHead(
      "Jurisdições Fiscais & Sales Tax · LedgerX",
      "Parametrização de alíquotas estaduais e locais de Sales Tax, obrigações de entrega e contas de passivo.",
    ),
  component: TaxJurisdictionsPage,
});

function TaxJurisdictionsPage() {
  const modal = useModal();
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
  const [rate, setRate] = useState("6.0");
  const [taxType, setTaxType] = useState<"State Sales Tax" | "Local Surcharge" | "Combined">("State Sales Tax");
  const [glAccountCode, setGlAccountCode] = useState("2200");
  const [filingFrequency, setFilingFrequency] = useState<"Monthly" | "Quarterly" | "Annual">("Monthly");
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");

  const liabilityAccounts = accounts.filter((a) => a.type === "Liability");

  const openCreateModal = () => {
    setEditingId(null);
    setCode("");
    setState(activeCompany.state || "FL");
    setName("");
    setRate("6.0");
    setTaxType("State Sales Tax");
    setGlAccountCode("2200");
    setFilingFrequency("Monthly");
    setStatus("Active");
    setModalOpen(true);
  };

  const openEditModal = (tax: TaxJurisdictionParam) => {
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
    e.preventDefault();
    if (!code.trim() || !name.trim() || !rate.trim()) {
      await modal.showAlert({
        title: "Campos Obrigatórios",
        message: "Por favor informe o Código, a Denominação da Jurisdição e a Alíquota.",
        tone: "warning",
      });
      return;
    }

    const rateNum = parseFloat(rate);
    if (isNaN(rateNum) || rateNum < 0) {
      await modal.showAlert({
        title: "Alíquota Inválida",
        message: "A alíquota percentual deve ser um valor positivo ou zero (isento).",
        tone: "warning",
      });
      return;
    }

    const cleanCode = code.trim().toUpperCase();

    if (editingId) {
      updateTaxJurisdiction(editingId, {
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
        title: "Jurisdição Atualizada",
        message: `Parâmetros fiscais de "${name.trim()}" atualizados com sucesso.`,
        tone: "success",
      });
    } else {
      addTaxJurisdiction({
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
        title: "Jurisdição Adicionada",
        message: `Jurisdição "${name.trim()}" cadastrada com alíquota de ${rateNum}%.`,
        tone: "success",
      });
    }

    setModalOpen(false);
  };

  const handleDelete = async (tax: TaxJurisdictionParam) => {
    const confirmed = await modal.showConfirm({
      title: `Excluir Jurisdição Fiscal?`,
      message: `Deseja realmente excluir a regra tributária "${tax.name}" (${tax.code})?\n\nFaturas e apurações emitidas no passado manterão o histórico inalterado.`,
      tone: "error",
      confirmText: "Sim, Excluir Jurisdição",
      cancelText: "Cancelar",
    });

    if (confirmed) {
      deleteTaxJurisdiction(tax.id);
      await modal.showAlert({
        title: "Jurisdição Removida",
        message: `A jurisdição ${tax.code} foi excluída.`,
        tone: "success",
      });
    }
  };

  const handleToggleStatus = (tax: TaxJurisdictionParam) => {
    const nextStatus = tax.status === "Active" ? "Inactive" : "Active";
    updateTaxJurisdiction(tax.id, { status: nextStatus });
  };

  const filteredTaxes = taxJurisdictions.filter((t) => {
    const matchesSearch =
      t.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.state.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeRatesSum = taxJurisdictions.filter((t) => t.status === "Active").reduce((s, t) => s + t.rate, 0);
  const activeCount = taxJurisdictions.filter((t) => t.status === "Active").length;
  const avgRate = activeCount > 0 ? (activeRatesSum / activeCount).toFixed(2) : "0.00";

  const handleExport = () => {
    exportToCsv(
      `jurisdicoes-fiscais-${activeCompany.id}.csv`,
      ["Codigo", "Estado", "Nome", "Aliquota_Pct", "Tipo_Tributo", "Conta_Contabil", "Periodicidade", "Status"],
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
              <ArrowLeft className="size-3.5" /> Voltar aos Parâmetros
            </Link>
          </div>
          <PageTitle
            title="Jurisdições Fiscais & Alíquotas de Sales Tax"
            description={`Tabelas de tributação estadual e local para cálculo automático nas faturas de ${activeCompany.name}`}
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
            <span>Nova Jurisdição</span>
          </button>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          label="Jurisdições Ativas"
          value={activeCount.toString()}
          hint={`Empresa sede: ${activeCompany.state}`}
        />
        <Kpi
          label="Alíquota Média"
          value={`${avgRate}%`}
          hint="Média ponderada ativa"
        />
        <Kpi
          label="Conta de Provisão"
          value="2200 - Sales Tax"
          hint="Passivo Circulante"
        />
        <Kpi
          label="Nexus Padrão"
          value={activeCompany.state}
          hint="Jurisdição Primária"
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink3" />
          <input
            type="text"
            placeholder="Buscar por código, órgão ou estado..."
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
        title={`Tabela de Jurisdições Fiscais (${filteredTaxes.length})`}
        badge={<Badge tone="brand">Sales Tax Nexus</Badge>}
      >
        <Table>
          <thead>
            <tr>
              <Th>Código</Th>
              <Th>Estado</Th>
              <Th>Órgão Fiscal / Jurisdição</Th>
              <Th className="text-right">Alíquota</Th>
              <Th>Tipo</Th>
              <Th>Conta de Passivo</Th>
              <Th>Periodicidade</Th>
              <Th>Status</Th>
              <Th className="text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {filteredTaxes.map((t) => (
              <tr key={t.id} className="hover:bg-ink/[0.015]">
                <Td className="font-mono font-bold text-ink">
                  {t.code}
                </Td>
                <Td>
                  <span className="rounded bg-panel px-2 py-0.5 font-mono text-[11px] font-semibold text-ink2 ring-1 ring-line">
                    {t.state}
                  </span>
                </Td>
                <Td className="font-medium text-ink">{t.name}</Td>
                <Td className="text-right font-mono font-bold text-brand">
                  {t.rate.toFixed(2)}%
                </Td>
                <Td className="text-[11.5px] text-ink2">{t.taxType}</Td>
                <Td className="font-mono text-[11.5px] text-ink3">
                  {t.glAccountCode}
                </Td>
                <Td className="text-[11.5px] text-ink2">{t.filingFrequency}</Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(t)}
                    title="Clique para alternar status"
                    className="cursor-pointer"
                  >
                    <Badge tone={t.status === "Active" ? "brand" : "neutral"}>
                      {t.status === "Active" ? "Ativa" : "Inativa"}
                    </Badge>
                  </button>
                </Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(t)}
                      className="rounded p-1 text-ink3 hover:bg-canvas hover:text-ink transition-colors"
                      title="Editar Jurisdição"
                    >
                      <Edit2 className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      className="rounded p-1 text-ink3 hover:bg-down/10 hover:text-down transition-colors"
                      title="Excluir Jurisdição"
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
              {editingId ? "Editar Jurisdição Fiscal" : "Nova Jurisdição Fiscal"}
            </h2>
            <p className="text-[12px] text-ink3 mt-0.5">
              Configuração de alíquotas estaduais para apuração de Sales Tax no US GAAP Ledger.
            </p>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Código da Regra *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: FL-STATE"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono uppercase text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Estado (Sigla 2 Letras) *
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="Ex: FL"
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono uppercase text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Nome do Órgão Governamental / Jurisdição *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Florida Department of Revenue"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[13px] focus:border-brand focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Alíquota (%) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 6.00"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Tipo de Imposto
                  </label>
                  <select
                    value={taxType}
                    onChange={(e) => setTaxType(e.target.value as any)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] focus:border-brand focus:outline-none"
                  >
                    <option value="State Sales Tax">Estadual (State Sales Tax)</option>
                    <option value="Local Surcharge">Local (County/City Surcharge)</option>
                    <option value="Combined">Combinado (State + Local)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Conta de Passivo (GL)
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
                    {!liabilityAccounts.some((a) => a.code === "2200") && (
                      <option value="2200">2200 - Sales Tax Payable</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Periodicidade Oficial
                  </label>
                  <select
                    value={filingFrequency}
                    onChange={(e) => setFilingFrequency(e.target.value as any)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] focus:border-brand focus:outline-none"
                  >
                    <option value="Monthly">Mensal (Monthly)</option>
                    <option value="Quarterly">Trimestral (Quarterly)</option>
                    <option value="Annual">Anual (Annual)</option>
                  </select>
                </div>
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
                  {editingId ? "Salvar Alterações" : "Cadastrar Jurisdição"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
