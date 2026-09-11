import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, formatDate, acct, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import { ArrowLeft, Plus, Search } from "lucide-react";

export const Route = createFileRoute("/payables")({
  head: () =>
    pageHead(
      "Accounts Payable & Multi-Currency · LedgerX",
      "Manage vendor obligations, currency exchange rates, foreign payables, and realized FX gain/loss entries under US GAAP.",
    ),
  component: PayablesPage,
});

function PayablesPage() {
  const modal = useModal();
  const {
    activeCompany,
    bills,
    accounts,
    projects,
    inventory,
    createBill,
    payBill,
    userPersona,
  } = useAccounting();

  // Screen View Mode
  const [view, setView] = useState<"list" | "create">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState<string>("ALL");

  // Bill creation form state
  const [vendorName, setVendorName] = useState("Grainger Industrial Supply");
  const [billNumber, setBillNumber] = useState("INV-GR-8819");
  const [date, setDate] = useState("2026-12-18");
  const [dueDate, setDueDate] = useState("2027-01-17");
  const [currency, setCurrency] = useState("USD");
  const [fxRateInput, setFxRateInput] = useState("1.0");
  const [foreignAmount, setForeignAmount] = useState("3400.00");
  const [accountCode, setAccountCode] = useState("6100");
  const [isInventory, setIsInventory] = useState(false);
  const [skuPurchased, setSkuPurchased] = useState("HR-1001");
  const [qtyPurchased, setQtyPurchased] = useState(50);
  const [projectId, setProjectId] = useState("");

  // Pay Modal State
  const [payingBillId, setPayingBillId] = useState<string | null>(null);
  const [settlementRate, setSettlementRate] = useState<string>("1.0");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]!);

  // Computations
  const numForeign = Number(foreignAmount) || 0;
  const effectiveRate = currency === "USD" ? 1.0 : Number(fxRateInput) || 1.0;
  const calculatedUsd = currency === "USD" ? numForeign : numForeign * effectiveRate;

  const totalOpenAp = bills.filter((b) => b.status === "Open").reduce((s, b) => s + b.usdAmount, 0);
  const totalPaidAp = bills.filter((b) => b.status === "Paid").reduce((s, b) => s + b.usdAmount, 0);

  const handleCurrencyChange = (curr: string) => {
    setCurrency(curr);
    if (curr === "USD") setFxRateInput("1.0");
    else if (curr === "EUR") setFxRateInput("1.08");
    else if (curr === "GBP") setFxRateInput("1.27");
    else if (curr === "MXN") setFxRateInput("0.054");
  };

  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!vendorName.trim()) {
      await modal.showAlert({
        title: "Campo Obrigatório",
        message: "Por favor informe o Nome ou Razão Social do Fornecedor.",
        tone: "warning",
      });
      return;
    }

    const result = createBill({
      vendorName: vendorName.trim(),
      billNumber: billNumber.trim(),
      date,
      dueDate,
      currency,
      fxRate: effectiveRate,
      foreignAmount: numForeign,
      items: [
        {
          id: `bi-${Date.now()}`,
          description: `Fatura ${billNumber} — ${vendorName}`,
          accountCode,
          isInventory: accountCode === "1300" && isInventory,
          sku: accountCode === "1300" ? skuPurchased : undefined,
          qty: accountCode === "1300" ? qtyPurchased : undefined,
          amount: calculatedUsd,
          projectId: projectId || undefined,
        },
      ],
      projectId: projectId || undefined,
    });

    if (result.success) {
      const bId = result.billId;
      setBillNumber("");
      setView("list");
      await modal.showAlert({
        title: "Fatura de Fornecedor Registrada",
        message: `Fatura ${bId} registrada com sucesso no Contas a Pagar (AP)!\n\nLançamentos no Razão Geral:\n• Crédito em Contas a Pagar (2000): ${usd(calculatedUsd)}\n• Débito na conta ${accountCode}: ${usd(calculatedUsd)}`,
        tone: "success",
      });
    } else {
      await modal.showAlert({
        title: "Erro ao Registrar Título",
        message: result.error || "Não foi possível registrar o título a pagar.",
        tone: "error",
      });
    }
  };

  const openPayModal = (bill: (typeof bills)[0]) => {
    setPayingBillId(bill.id);
    setSettlementRate(String(bill.fxRate));
  };

  const handleConfirmPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingBillId) return;

    const rate = Number(settlementRate) || undefined;
    const res = payBill(payingBillId, payDate, rate);
    if (res.success) {
      const currentBill = bills.find((b) => b.id === payingBillId);
      setPayingBillId(null);
      await modal.showAlert({
        title: "Quitação de Título Efetuada",
        message: `Título ${currentBill?.billNumber || payingBillId} liquidado com sucesso!\n\nDébito em Contas a Pagar (2000) e crédito em Caixa/Banco (1000).${
          currentBill && currentBill.currency !== "USD"
            ? " A variação cambial realizada (Realized FX Gain/Loss) foi calculada e postada automaticamente."
            : ""
        }`,
        tone: "success",
      });
    } else {
      await modal.showAlert({
        title: "Erro na Quitação",
        message: res.error || "Não foi possível liquidar o título.",
        tone: "error",
      });
    }
  };

  const handleExportCsv = () => {
    const headers = [
      "Bill ID",
      "Vendor",
      "Ref Number",
      "Date",
      "Due Date",
      "Currency",
      "Foreign Amount",
      "FX Rate",
      "USD Base",
      "Status",
      "Realized FX Diff",
    ];
    const rows = bills.map((b) => [
      b.id,
      b.vendorName,
      b.billNumber,
      b.date,
      b.dueDate,
      b.currency,
      b.foreignAmount,
      b.fxRate,
      b.usdAmount,
      b.status,
      b.realizedFxDiff ?? 0,
    ]);
    exportToCsv(`${activeCompany.id}_vendor_bills`, headers, rows);
  };

  const selectedPayingBill = bills.find((b) => b.id === payingBillId);

  const filteredBills = bills.filter((b) => {
    const matchesSearch =
      b.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.vendorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.billNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCurr = currencyFilter === "ALL" || b.currency === currencyFilter;
    return matchesSearch && matchesCurr;
  });

  return (
    <div className="space-y-4">
      {view === "list" ? (
        /* ================= TELA DE LISTAGEM ================= */
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
            <PageTitle
              title="Bills & Accounts Payable (AP)"
              description={`Vendor obligations, multi-currency invoices, and realized FX gain/loss for ${activeCompany.name}`}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs transition-colors cursor-pointer"
              >
                Export Payables (CSV)
              </button>
              {userPersona.canCreateJournals && (
                <button
                  type="button"
                  onClick={() => setView("create")}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-brand/90 shadow-2xs transition-colors cursor-pointer"
                >
                  <Plus className="size-4" />
                  Novo Título a Pagar
                </button>
              )}
            </div>
          </div>

          {/* KPI Row */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi
              label="Total Open Obligations (AP)"
              value={usd(totalOpenAp)}
              hint="Account 2000 · Due to vendors"
              tone={totalOpenAp > 0 ? "neutral" : "up"}
            />
            <Kpi
              label="Disbursements Cleared MTD"
              value={usd(totalPaidAp)}
              hint="Cash disbursements paid"
              tone="neutral"
            />
            <Kpi
              label="Foreign Currency Bills"
              value={bills.filter((b) => b.currency !== "USD").length.toString()}
              hint="MXN, GBP, EUR multi-currency exposure"
              tone="neutral"
            />
          </section>

          {/* Search & Currency Filter */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[240px] max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-ink3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por fornecedor ou número do título..."
                className="w-full rounded-md border border-line bg-white/90 py-1.5 pl-8 pr-3 text-[12px] text-ink outline-none ring-1 ring-transparent focus:border-brand focus:ring-brand/20 transition-all"
              />
            </div>
            <div className="flex items-center gap-1.5">
              {["ALL", "USD", "EUR", "GBP", "MXN"].map((curr) => (
                <button
                  key={curr}
                  type="button"
                  onClick={() => setCurrencyFilter(curr)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                    currencyFilter === curr
                      ? "bg-brand text-white"
                      : "bg-surface text-ink2 hover:bg-muted ring-1 ring-line"
                  }`}
                >
                  {curr === "ALL" ? "Todas as Moedas" : curr}
                </button>
              ))}
            </div>
          </div>

          {/* Vendor Bills Register Full Width */}
          <Panel
            title="Vendor Bills Register"
            subtitle={`${filteredBills.length} de ${bills.length} títulos no sub-razão de fornecedores`}
          >
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr className="border-b border-line/60">
                    <Th>Bill ID</Th>
                    <Th>Ref Number</Th>
                    <Th>Vendor Legal Name</Th>
                    <Th>Currency / Orig</Th>
                    <Th>Issue Date</Th>
                    <Th>Due Date</Th>
                    <Th align="right">USD Base</Th>
                    <Th align="center">Status</Th>
                    <Th align="center">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBills.length === 0 ? (
                    <tr>
                      <Td colSpan={9} className="py-8 text-center text-[12px] text-ink3">
                        Nenhum título encontrado para o filtro selecionado.
                      </Td>
                    </tr>
                  ) : (
                    filteredBills.map((b) => (
                      <tr
                        key={b.id}
                        className="border-b border-line/40 last:border-0 hover:bg-black/[0.01] transition-colors"
                      >
                        <Td className="font-mono text-[11.5px] font-semibold text-brand">{b.id}</Td>
                        <Td className="font-mono text-[11px] text-ink3">{b.billNumber}</Td>
                        <Td className="text-ink font-medium text-[12px]">{b.vendorName}</Td>
                        <Td className="font-mono text-[11.5px]">
                          {b.currency} {b.foreignAmount.toLocaleString()}
                          {b.currency !== "USD" && (
                            <span className="block text-[10px] text-ink3">Rate: {b.fxRate}</span>
                          )}
                        </Td>
                        <Td className="text-ink3 text-[11.5px]">{formatDate(b.date)}</Td>
                        <Td className="text-ink3 text-[11.5px]">{formatDate(b.dueDate)}</Td>
                        <Td align="right" className="font-mono font-semibold text-[12px]">
                          {usd(b.usdAmount)}
                          {b.realizedFxDiff !== undefined && (
                            <span
                              className={`block text-[10px] font-sans ${
                                b.realizedFxDiff >= 0
                                  ? "text-up font-semibold"
                                  : "text-down font-semibold"
                              }`}
                            >
                              FX: {acct(b.realizedFxDiff)}
                            </span>
                          )}
                        </Td>
                        <Td align="center">
                          <Badge tone={b.status === "Paid" ? "up" : "down"}>{b.status}</Badge>
                        </Td>
                        <Td align="center">
                          {b.status !== "Paid" && !userPersona.allowedReportsOnly && (
                            <button
                              type="button"
                              onClick={() => openPayModal(b)}
                              className="rounded bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand hover:bg-brand/20 ring-1 ring-brand/25 transition-colors cursor-pointer shadow-2xs"
                            >
                              Pagar Fatura
                            </button>
                          )}
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </div>
            <div className="p-4 border-t border-line/50">
              <Note tone="brand">
                US GAAP ASC 830 (Foreign Currency Matters): Títulos em moeda estrangeira são registrados
                pela taxa spot do dia da emissão. Ao liquidar o título, qualquer variação na taxa spot
                gera Ganho ou Perda Cambial Realizada (Realized FX Gain/Loss - conta 6300).
              </Note>
            </div>
          </Panel>
        </div>
      ) : (
        /* ================= TELA DE CADASTRO ================= */
        <div className="space-y-4 max-w-4xl mx-auto">
          {/* Top Bar with Back Button */}
          <div className="flex items-center justify-between border-b border-line/60 pb-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setView("list")}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink2 hover:bg-muted transition-colors cursor-pointer shadow-2xs"
              >
                <ArrowLeft className="size-3.5" />
                Voltar para Contas a Pagar
              </button>
              <div>
                <h1 className="text-[16px] font-semibold text-ink">Registrar Fatura de Fornecedor</h1>
                <p className="text-[12px] text-ink3">
                  Cadastro de obrigações com fornecedores e apropriação contábil no Razão Geral (AP)
                </p>
              </div>
            </div>
          </div>

          <Panel
            title="Dados da Fatura do Fornecedor (Vendor Bill)"
            subtitle="Preencha os dados do documento fiscal recebido e classifique a despesa ou custo"
          >
            <form onSubmit={handleCreateBill} className="p-6 space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Nome / Razão Social do Fornecedor (Vendor Legal Name) *
                  </label>
                  <input
                    type="text"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    placeholder="Ex: Grainger Industrial Supply, AWS Cloud..."
                    required
                    className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Número do Documento / Ref (Bill / Invoice #) *
                  </label>
                  <input
                    type="text"
                    value={billNumber}
                    onChange={(e) => setBillNumber(e.target.value)}
                    placeholder="Ex: INV-2026-9901"
                    required
                    className="w-full rounded-md bg-canvas px-3 py-2 font-mono text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Moeda da Fatura
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => handleCurrencyChange(e.target.value)}
                    className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand font-mono font-semibold"
                  >
                    <option value="USD">USD ($ - Base)</option>
                    <option value="EUR">EUR (€ - Euro)</option>
                    <option value="GBP">GBP (£ - Libra)</option>
                    <option value="MXN">MXN ($ - Peso Mexicano)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Cotação Spot Cambial (FX Rate)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    disabled={currency === "USD"}
                    value={fxRateInput}
                    onChange={(e) => setFxRateInput(e.target.value)}
                    className="w-full rounded-md bg-canvas px-3 py-2 text-right font-mono text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Valor Original ({currency}) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={foreignAmount}
                    onChange={(e) => setForeignAmount(e.target.value)}
                    required
                    className="w-full rounded-md bg-canvas px-3 py-2 text-right font-mono text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Equivalente em USD
                  </label>
                  <div className="w-full rounded-md bg-ink/[0.04] px-3 py-2 text-right font-mono font-semibold text-[13px] border border-line text-brand">
                    {usd(calculatedUsd)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Data da Fatura *
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Data de Vencimento *
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                    className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Alocação de Projeto
                  </label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  >
                    <option value="">Despesa Geral (G&A)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Expense Account Classification */}
              <div className="rounded-lg bg-surface p-4 border border-line space-y-3">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                  Classificação Contábil da Despesa / Ativo
                </label>
                <select
                  value={accountCode}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAccountCode(val);
                    if (val === "1300") setIsInventory(true);
                    else setIsInventory(false);
                  }}
                  className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand font-mono"
                >
                  <optgroup label="Despesas Operacionais (OpEx)">
                    {accounts
                      .filter((a) => a.type === "Operating Expense" || a.type === "Other Expense")
                      .map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} · {a.name} ({a.type})
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Estoque & Custos (Assets / COGS)">
                    <option value="1300">1300 · Merchandise Inventory (Entrada de Estoque)</option>
                    <option value="5000">5000 · Cost of Goods Sold (Custo Direto)</option>
                  </optgroup>
                </select>

                {accountCode === "1300" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-2 border-t border-line/60">
                    <div>
                      <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                        Vincular ao SKU de Estoque
                      </label>
                      <select
                        value={skuPurchased}
                        onChange={(e) => setSkuPurchased(e.target.value)}
                        className="w-full rounded-md bg-canvas px-2.5 py-1.5 text-[12px] border border-line outline-none focus:border-brand"
                      >
                        {inventory
                          .filter((i) => i.type === "Product")
                          .map((i) => (
                            <option key={i.sku} value={i.sku}>
                              {i.sku} · {i.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                        Quantidade Adquirida
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={qtyPurchased}
                        onChange={(e) => setQtyPurchased(Number(e.target.value) || 1)}
                        className="w-full rounded-md bg-canvas px-2.5 py-1.5 text-right font-mono text-[12px] border border-line outline-none focus:border-brand"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-line/60">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className="rounded-md border border-line bg-surface px-4 py-2 text-[12.5px] font-medium text-ink2 hover:bg-muted transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-brand px-6 py-2 text-[12.5px] font-semibold text-white hover:bg-brand/90 transition-colors cursor-pointer shadow-2xs"
                >
                  Salvar e Postar no Razão (AP)
                </button>
              </div>
            </form>
          </Panel>
        </div>
      )}

      {/* Settlement / Pay Modal Dialog */}
      {payingBillId && selectedPayingBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-2xl space-y-4">
            <div>
              <h2 className="text-[16px] font-semibold text-ink">
                Liquidar Título: {selectedPayingBill.billNumber}
              </h2>
              <p className="text-[12px] text-ink3">
                Fornecedor: {selectedPayingBill.vendorName} · Valor Original: {selectedPayingBill.currency}{" "}
                {selectedPayingBill.foreignAmount.toLocaleString()}
              </p>
            </div>

            <form onSubmit={handleConfirmPay} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                  Data do Pagamento
                </label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  required
                  className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand"
                />
              </div>

              {selectedPayingBill.currency !== "USD" && (
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Cotação Spot na Data de Liquidação (Settlement FX Rate)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={settlementRate}
                    onChange={(e) => setSettlementRate(e.target.value)}
                    required
                    className="w-full rounded-md bg-canvas px-3 py-2 text-right font-mono text-[13px] border border-line outline-none focus:border-brand"
                  />
                  <span className="block mt-1 text-[11px] text-ink3">
                    Taxa original de emissão: {selectedPayingBill.fxRate}. A diferença apura ganho/perda cambial.
                  </span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-line/60">
                <button
                  type="button"
                  onClick={() => setPayingBillId(null)}
                  className="rounded-md border border-line bg-surface px-4 py-2 text-[12.5px] font-medium text-ink2 hover:bg-muted transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-brand px-5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand/90 transition-colors cursor-pointer shadow-2xs"
                >
                  Confirmar Quitação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
