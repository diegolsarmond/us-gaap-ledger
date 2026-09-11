import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting, type CurrencyParam } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import { exportToCsv } from "@/lib/format";
import {
  ArrowLeft,
  Plus,
  Search,
  Coins,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Calculator,
  RefreshCw,
  Download,
} from "lucide-react";

export const Route = createFileRoute("/parameters/currencies")({
  head: () =>
    pageHead(
      "Moedas & Câmbio (FX Rates) · LedgerX",
      "Parametrização de moedas estrangeiras, taxas de câmbio frente ao USD e tipo de cotação.",
    ),
  component: CurrenciesPage,
});

function CurrenciesPage() {
  const modal = useModal();
  const {
    activeCompany,
    currencies,
    addCurrency,
    updateCurrency,
    deleteCurrency,
    userPersona,
  } = useAccounting();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);

  // Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [exchangeRate, setExchangeRate] = useState("1.0000");
  const [quotationType, setQuotationType] = useState<"Fixed" | "Float" | "Central Bank">("Float");
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");

  // Currency Converter Simulator
  const [convertAmount, setConvertAmount] = useState<string>("1000");
  const [convertFromCode, setConvertFromCode] = useState<string>("EUR");

  const openCreateModal = () => {
    setEditingCode(null);
    setCode("");
    setName("");
    setSymbol("");
    setExchangeRate("1.0000");
    setQuotationType("Float");
    setStatus("Active");
    setModalOpen(true);
  };

  const openEditModal = (curr: CurrencyParam) => {
    setEditingCode(curr.code);
    setCode(curr.code);
    setName(curr.name);
    setSymbol(curr.symbol);
    setExchangeRate(curr.exchangeRateToUsd.toString());
    setQuotationType(curr.quotationType);
    setStatus(curr.status);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim() || !exchangeRate.trim()) {
      await modal.showAlert({
        title: "Campos Obrigatórios",
        message: "Por favor preencha o Código ISO, o Nome da Moeda e a Taxa de Câmbio.",
        tone: "warning",
      });
      return;
    }

    const rateNum = parseFloat(exchangeRate);
    if (isNaN(rateNum) || rateNum <= 0) {
      await modal.showAlert({
        title: "Taxa Inválida",
        message: "A taxa de câmbio deve ser um número positivo.",
        tone: "warning",
      });
      return;
    }

    const isoCode = code.trim().toUpperCase();

    if (!editingCode && currencies.some((c) => c.code === isoCode)) {
      await modal.showAlert({
        title: "Moeda Já Cadastrada",
        message: `A moeda com código ${isoCode} já existe na tabela de taxas.`,
        tone: "warning",
      });
      return;
    }

    if (editingCode) {
      updateCurrency(editingCode, {
        name: name.trim(),
        symbol: symbol.trim() || "$",
        exchangeRateToUsd: rateNum,
        quotationType,
        status,
      });
      await modal.showAlert({
        title: "Moeda Atualizada",
        message: `Parâmetros da moeda ${editingCode} atualizados com êxito.`,
        tone: "success",
      });
    } else {
      addCurrency({
        code: isoCode,
        name: name.trim(),
        symbol: symbol.trim() || "$",
        exchangeRateToUsd: rateNum,
        isBaseCurrency: isoCode === "USD",
        quotationType,
        status,
        lastUpdated: new Date().toISOString().split("T")[0]!,
      });
      await modal.showAlert({
        title: "Moeda Adicionada",
        message: `Moeda ${isoCode} (${name.trim()}) adicionada à tabela de paridades.`,
        tone: "success",
      });
    }

    setModalOpen(false);
  };

  const handleDelete = async (curr: CurrencyParam) => {
    if (curr.isBaseCurrency || curr.code === "USD") {
      await modal.showAlert({
        title: "Operação Bloqueada",
        message: "A moeda funcional USD é a moeda base do sistema US GAAP e não pode ser excluída.",
        tone: "error",
      });
      return;
    }

    const confirmed = await modal.showConfirm({
      title: `Excluir Moeda ${curr.code}?`,
      message: `Tem certeza que deseja remover a moeda "${curr.name}" (${curr.code}) dos parâmetros?\n\nTransações passadas manterão os lançamentos históricos gravados.`,
      tone: "error",
      confirmText: "Sim, Excluir Moeda",
      cancelText: "Cancelar",
    });

    if (confirmed) {
      deleteCurrency(curr.code);
      await modal.showAlert({
        title: "Moeda Removida",
        message: `A moeda ${curr.code} foi excluída dos parâmetros.`,
        tone: "success",
      });
    }
  };

  const handleToggleStatus = (curr: CurrencyParam) => {
    if (curr.isBaseCurrency) return;
    const nextStatus = curr.status === "Active" ? "Inactive" : "Active";
    updateCurrency(curr.code, { status: nextStatus });
  };

  // Filtered List
  const filteredCurrencies = currencies.filter((c) => {
    const matchesSearch =
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate simulation
  const selectedConvCurr = currencies.find((c) => c.code === convertFromCode) || currencies[0];
  const convertedUsd = selectedConvCurr
    ? (parseFloat(convertAmount) || 0) * selectedConvCurr.exchangeRateToUsd
    : 0;

  const handleExport = () => {
    exportToCsv(
      `moedas-cambio-${activeCompany.id}.csv`,
      ["Codigo_ISO", "Nome", "Simbolo", "Taxa_USD", "Moeda_Base", "Tipo_Cotacao", "Status", "Ultima_Atualizacao"],
      currencies.map((c) => [
        c.code,
        c.name,
        c.symbol,
        c.exchangeRateToUsd.toFixed(5),
        c.isBaseCurrency ? "Sim" : "Nao",
        c.quotationType,
        c.status,
        c.lastUpdated,
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
            title="Moedas & Taxas de Câmbio (FX Rates)"
            description={`Cadastro e governança cambial conforme US GAAP ASC 830 · Moeda Funcional Base: ${activeCompany.baseCurrency}`}
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
            <span>Nova Moeda</span>
          </button>
        </div>
      </div>

      {/* Simulator Bar */}
      <div className="rounded-xl border border-line/80 bg-gradient-to-r from-white to-panel p-4 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <Calculator className="size-4.5" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-ink">Simulador de Conversão em Tempo Real</p>
              <p className="text-[11px] text-ink3">Paridade cambial instantânea contra USD (Functional Currency)</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="text-ink3">Converter:</span>
            <input
              type="number"
              value={convertAmount}
              onChange={(e) => setConvertAmount(e.target.value)}
              className="w-24 rounded-md border border-line bg-white px-2.5 py-1 text-right font-mono font-semibold text-ink focus:border-brand focus:outline-none"
            />
            <select
              value={convertFromCode}
              onChange={(e) => setConvertFromCode(e.target.value)}
              className="rounded-md border border-line bg-white px-2 py-1 font-mono font-semibold text-ink focus:border-brand focus:outline-none"
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol})
                </option>
              ))}
            </select>
            <span className="text-ink3">=</span>
            <span className="rounded-md bg-white px-3 py-1 font-mono font-bold text-brand ring-1 ring-line">
              ${convertedUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink3" />
          <input
            type="text"
            placeholder="Buscar por código ISO ou nome..."
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
        title={`Catálogo de Moedas (${filteredCurrencies.length})`}
        badge={<Badge tone="brand">US GAAP ASC 830</Badge>}
      >
        <Table>
          <thead>
            <tr>
              <Th>Código ISO</Th>
              <Th>Nome da Moeda</Th>
              <Th>Símbolo</Th>
              <Th className="text-right">Taxa vs USD</Th>
              <Th>Tipo Cotação</Th>
              <Th>Papel</Th>
              <Th>Status</Th>
              <Th>Atualizado</Th>
              <Th className="text-right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {filteredCurrencies.map((c) => (
              <tr key={c.code} className="hover:bg-ink/[0.015]">
                <Td className="font-mono font-bold text-ink">
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded bg-brand/10 text-[10px] font-bold text-brand">
                      {c.code}
                    </span>
                    {c.code}
                  </div>
                </Td>
                <Td className="font-medium">{c.name}</Td>
                <Td className="font-mono">{c.symbol}</Td>
                <Td className="text-right font-mono font-semibold text-ink">
                  {c.exchangeRateToUsd.toFixed(5)}
                </Td>
                <Td>
                  <span className="rounded bg-panel px-1.5 py-0.5 font-mono text-[10.5px] text-ink2 ring-1 ring-line/70">
                    {c.quotationType}
                  </span>
                </Td>
                <Td>
                  {c.isBaseCurrency ? (
                    <span className="rounded bg-brand/10 px-2 py-0.5 text-[10.5px] font-semibold text-brand">
                      Moeda Funcional
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink3">Estrangeira</span>
                  )}
                </Td>
                <Td>
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(c)}
                    disabled={c.isBaseCurrency}
                    title={c.isBaseCurrency ? "Moeda base não pode ser inativada" : "Clique para alterar status"}
                    className="cursor-pointer"
                  >
                    <Badge tone={c.status === "Active" ? "brand" : "neutral"}>
                      {c.status === "Active" ? "Ativa" : "Inativa"}
                    </Badge>
                  </button>
                </Td>
                <Td className="text-[11px] text-ink3 font-mono">{c.lastUpdated}</Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(c)}
                      className="rounded p-1 text-ink3 hover:bg-canvas hover:text-ink transition-colors"
                      title="Editar Moeda"
                    >
                      <Edit2 className="size-3.5" />
                    </button>
                    {!c.isBaseCurrency && (
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        className="rounded p-1 text-ink3 hover:bg-down/10 hover:text-down transition-colors"
                        title="Excluir Moeda"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
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
              {editingCode ? `Editar Moeda ${editingCode}` : "Cadastrar Nova Moeda"}
            </h2>
            <p className="text-[12px] text-ink3 mt-0.5">
              Parâmetros cambiais para cálculo automático de variação FX no razão geral.
            </p>

            <form onSubmit={handleSave} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Código ISO (3 Letras) *
                </label>
                <input
                  type="text"
                  maxLength={3}
                  disabled={Boolean(editingCode)}
                  placeholder="Ex: EUR, GBP, JPY"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono uppercase text-[13px] focus:border-brand focus:outline-none disabled:bg-panel disabled:text-ink3"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                  Nome da Moeda *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Euro da União Europeia"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[13px] focus:border-brand focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Símbolo Monetário
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: €"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Taxa vs USD *
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    placeholder="1.0825"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 font-mono text-[13px] focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-ink2 mb-1">
                    Tipo de Cotação
                  </label>
                  <select
                    value={quotationType}
                    onChange={(e) => setQuotationType(e.target.value as any)}
                    className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px] focus:border-brand focus:outline-none"
                  >
                    <option value="Float">Flutuante (Mercado)</option>
                    <option value="Central Bank">Banco Central</option>
                    <option value="Fixed">Fixada Contratual</option>
                  </select>
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
                  {editingCode ? "Salvar Alterações" : "Cadastrar Moeda"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
