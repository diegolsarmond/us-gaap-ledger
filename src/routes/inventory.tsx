import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import { ArrowLeft, Plus, Search, SlidersHorizontal } from "lucide-react";

export const Route = createFileRoute("/inventory")({
  head: () =>
    pageHead(
      "Inventory Catalog & Valuation · LedgerX",
      "Perpetual inventory tracking with FIFO and Weighted Average cost lots and periodic count variance adjustments.",
    ),
  component: InventoryPage,
});

function InventoryPage() {
  const modal = useModal();
  const {
    activeCompany,
    inventory,
    setCostMethod,
    adjustStock,
    addInventoryItem,
    totalInventoryValuation,
    userPersona,
  } = useAccounting();

  // Screen View Mode: "list" | "create" | "adjust"
  const [view, setView] = useState<"list" | "create" | "adjust">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  // Stock Adjustment Form
  const [selectedItemId, setSelectedItemId] = useState(inventory[0]?.id || "");
  const [qtyDelta, setQtyDelta] = useState("-5");
  const [adjustMemo, setAdjustMemo] = useState("Avariado durante movimentação no pátio");

  // New Item Form
  const [newSku, setNewSku] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"Product" | "Service">("Product");
  const [newCost, setNewCost] = useState("45.00");
  const [newPrice, setNewPrice] = useState("95.00");
  const [newQty, setNewQty] = useState("20");

  const totalProductsCount = inventory.filter((i) => i.type === "Product").length;
  const totalServicesCount = inventory.filter((i) => i.type === "Service").length;
  const totalUnitsOnHand = inventory.reduce(
    (s, i) => s + (i.type === "Product" ? i.qtyOnHand : 0),
    0,
  );

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = inventory.find((i) => i.id === selectedItemId);
    if (!item) return;

    adjustStock(selectedItemId, Number(qtyDelta) || 0, item.unitCost, adjustMemo);
    setView("list");

    await modal.showAlert({
      title: "Ajuste de Estoque Efetuado",
      message: `Ajuste de ${qtyDelta} unidades registrado para o item SKU ${item.sku} (${item.name}).\nContra-partida automática de variação de inventário (COGS) postada no Razão Geral.`,
      tone: "success",
    });
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSku.trim() || !newName.trim()) {
      await modal.showAlert({
        title: "Campos Obrigatórios",
        message: "Por favor informe o SKU e o Nome do Item.",
        tone: "warning",
      });
      return;
    }

    if (inventory.some((i) => i.sku.toUpperCase() === newSku.trim().toUpperCase())) {
      await modal.showAlert({
        title: "SKU já Existente",
        message: `Já existe um item cadastrado com o SKU "${newSku.toUpperCase()}". Cada item deve possuir um código exclusivo.`,
        tone: "warning",
      });
      return;
    }

    const skuUpper = newSku.toUpperCase().trim();
    const nameTrim = newName.trim();

    addInventoryItem({
      sku: skuUpper,
      name: nameTrim,
      type: newType,
      qtyOnHand: newType === "Product" ? Number(newQty) || 0 : 0,
      unitCost: Number(newCost) || 0,
      unitPrice: Number(newPrice) || 0,
      valuationMethod: activeCompany.costMethod,
    });

    setNewSku("");
    setNewName("");
    setView("list");

    await modal.showAlert({
      title: "Item Cadastrado no Catálogo",
      message: `O item ${skuUpper} — "${nameTrim}" foi incluído com sucesso no catálogo de mercadorias da empresa ${activeCompany.name}.`,
      tone: "success",
    });
  };

  const handleExportCsv = () => {
    const headers = [
      "SKU",
      "Item Name",
      "Type",
      "Valuation Method",
      "Quantity On Hand",
      "Unit Cost ($)",
      "Unit Price ($)",
      "Total Asset Value ($)",
    ];
    const rows = inventory.map((i) => [
      i.sku,
      i.name,
      i.type,
      i.type === "Product" ? activeCompany.costMethod : "N/A",
      i.qtyOnHand,
      i.unitCost,
      i.unitPrice,
      i.type === "Product" ? i.qtyOnHand * i.unitCost : 0,
    ]);
    exportToCsv(`${activeCompany.id}_inventory_catalog`, headers, rows);
  };

  const filteredInventory = inventory.filter((item) => {
    const matchesSearch =
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "ALL" || item.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-4">
      {view === "list" ? (
        /* ================= TELA DE LISTAGEM ================= */
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line/60 pb-3">
            <PageTitle
              title="Inventory Catalog & Cost Valuation"
              description={`Perpetual inventory tracking and COGS valuation for ${activeCompany.name} · US GAAP Standard`}
            />
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={handleExportCsv}
                className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs transition-colors cursor-pointer"
              >
                Export Catalog (CSV)
              </button>
              {userPersona.canCreateJournals && (
                <>
                  <button
                    type="button"
                    onClick={() => setView("adjust")}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink2 hover:bg-muted shadow-2xs transition-colors cursor-pointer"
                  >
                    <SlidersHorizontal className="size-3.5" />
                    Ajuste Físico
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("create")}
                    className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-brand/90 shadow-2xs transition-colors cursor-pointer"
                  >
                    <Plus className="size-4" />
                    Novo Item do Catálogo
                  </button>
                </>
              )}
            </div>
          </div>

          {/* KPI Row & Cost Method Selector */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Merchandise Inventory Asset"
              value={usd(totalInventoryValuation)}
              hint="Account 1300 · Balance Sheet asset"
              tone="up"
            />
            <Kpi
              label="Physical Units on Hand"
              value={totalUnitsOnHand.toLocaleString("en-US")}
              hint={`${totalProductsCount} active product SKUs`}
              tone="neutral"
            />
            <Kpi
              label="Service Items in Catalog"
              value={totalServicesCount.toString()}
              hint="No physical stock · Revenue billable"
              tone="neutral"
            />
            <div className="rounded-xl bg-white/70 p-4 ring-1 ring-line shadow-2xs space-y-2">
              <span className="text-[11.5px] font-medium text-ink3 uppercase tracking-wider">
                Accounting Cost Method
              </span>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {(["FIFO", "WeightedAverage"] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    disabled={userPersona.allowedReportsOnly}
                    onClick={() => setCostMethod(method)}
                    className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-all cursor-pointer ${
                      activeCompany.costMethod === method
                        ? "bg-brand text-white shadow-2xs"
                        : "bg-black/[0.04] text-ink2 hover:bg-black/[0.07]"
                    }`}
                  >
                    {method === "FIFO" ? "FIFO (PEPS)" : "Média Ponderada"}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Search & Type Filter */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-ink3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por código SKU ou nome do item..."
                className="w-full rounded-md border border-line bg-white/90 py-1.5 pl-8 pr-3 text-[12px] text-ink outline-none ring-1 ring-transparent focus:border-brand focus:ring-brand/20 transition-all"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {["ALL", "Product", "Service"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                    typeFilter === t
                      ? "bg-brand text-white"
                      : "bg-surface text-ink2 hover:bg-muted ring-1 ring-line"
                  }`}
                >
                  {t === "ALL" ? "Todos os Itens" : t === "Product" ? "Produtos" : "Serviços"}
                </button>
              ))}
            </div>
          </div>

          {/* Inventory Table Full Width */}
          <Panel
            title="Item Catalog & Perpetual Ledger"
            subtitle={`${filteredInventory.length} de ${inventory.length} itens registrados`}
          >
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr className="border-b border-line/60">
                    <Th>SKU Code</Th>
                    <Th>Item Description</Th>
                    <Th>Item Type</Th>
                    <Th align="right">Qty on Hand</Th>
                    <Th align="right">Unit Cost</Th>
                    <Th align="right">Selling Price</Th>
                    <Th align="right">Total Valuation ($)</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.length === 0 ? (
                    <tr>
                      <Td colSpan={7} className="py-8 text-center text-[12px] text-ink3">
                        Nenhum item encontrado no catálogo para o filtro informado.
                      </Td>
                    </tr>
                  ) : (
                    filteredInventory.map((item) => {
                      const totalVal = item.type === "Product" ? item.qtyOnHand * item.unitCost : 0;
                      return (
                        <tr
                          key={item.id}
                          className="border-b border-line/40 last:border-0 hover:bg-black/[0.01] transition-colors"
                        >
                          <Td className="font-mono text-[11.5px] font-semibold text-brand">
                            {item.sku}
                          </Td>
                          <Td className="text-ink font-medium text-[12px]">
                            {item.name}
                            {item.costLots && item.costLots.length > 0 && (
                              <span className="block text-[10.5px] text-ink3">
                                {item.costLots.length} lote(s) de compra rastreados
                              </span>
                            )}
                          </Td>
                          <Td>
                            <Badge tone={item.type === "Product" ? "neutral" : "brand"}>
                              {item.type}
                            </Badge>
                          </Td>
                          <Td align="right" className="font-mono text-[12px]">
                            {item.type === "Product" ? item.qtyOnHand.toLocaleString() : "—"}
                          </Td>
                          <Td align="right" className="font-mono text-[12px] text-ink2">
                            {item.type === "Product" ? usd(item.unitCost) : "—"}
                          </Td>
                          <Td align="right" className="font-mono text-[12px] text-ink font-medium">
                            {usd(item.unitPrice)}
                          </Td>
                          <Td align="right" className="font-mono font-semibold text-[12px]">
                            {item.type === "Product" ? usd(totalVal) : "—"}
                          </Td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </div>
            <div className="p-4 border-t border-line/50">
              <Note tone="brand">
                US GAAP ASC 330: O estoque de mercadorias é reconhecido como ativo circulante (1300)
                até o momento da fatura de venda, quando é baixado contra CPV (5000) pelo método
                ativo ({activeCompany.costMethod}).
              </Note>
            </div>
          </Panel>
        </div>
      ) : view === "create" ? (
        /* ================= TELA DE CADASTRO DE ITEM ================= */
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
                Voltar para o Catálogo
              </button>
              <div>
                <h1 className="text-[16px] font-semibold text-ink">Cadastrar Novo Item no Catálogo</h1>
                <p className="text-[12px] text-ink3">
                  Adição de produto físico com controle de lotes ou serviço faturável para {activeCompany.name}
                </p>
              </div>
            </div>
          </div>

          <Panel
            title="Especificações do Item"
            subtitle="Preencha os dados de identificação, classificação fiscal e precificação"
          >
            <form onSubmit={handleCreateItem} className="p-6 space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Código SKU (Stock Keeping Unit) *
                  </label>
                  <input
                    type="text"
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                    placeholder="Ex: HR-3050, SRV-CONSULT-01"
                    required
                    className="w-full rounded-md bg-canvas px-3 py-2 font-mono text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Tipo do Item *
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as "Product" | "Service")}
                    className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  >
                    <option value="Product">Produto Físico (Mercadoria com Estoque)</option>
                    <option value="Service">Serviço / Mão de Obra (Sem estoque físico)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                  Nome / Descrição Comercial do Item *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Bronze Marine Through-Hull Fitting 1.5 in"
                  required
                  className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {newType === "Product" && (
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                      Quantidade Inicial em Estoque
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={newQty}
                      onChange={(e) => setNewQty(e.target.value)}
                      className="w-full rounded-md bg-canvas px-3 py-2 text-right font-mono text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Custo Unitário de Aquisição ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newCost}
                    onChange={(e) => setNewCost(e.target.value)}
                    className="w-full rounded-md bg-canvas px-3 py-2 text-right font-mono text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Preço de Venda Praticado ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    required
                    className="w-full rounded-md bg-canvas px-3 py-2 text-right font-mono text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                  />
                </div>
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
                  Salvar Item no Catálogo
                </button>
              </div>
            </form>
          </Panel>
        </div>
      ) : (
        /* ================= TELA DE AJUSTE FÍSICO DE ESTOQUE ================= */
        <div className="space-y-4 max-w-3xl mx-auto">
          {/* Top Bar with Back Button */}
          <div className="flex items-center justify-between border-b border-line/60 pb-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setView("list")}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink2 hover:bg-muted transition-colors cursor-pointer shadow-2xs"
              >
                <ArrowLeft className="size-3.5" />
                Voltar para o Catálogo
              </button>
              <div>
                <h1 className="text-[16px] font-semibold text-ink">Ajuste Físico de Estoque</h1>
                <p className="text-[12px] text-ink3">
                  Registro de variações de contagem física, perdas ou sobras com contra-partida contábil
                </p>
              </div>
            </div>
          </div>

          <Panel
            title="Lançamento de Variação de Inventário"
            subtitle="Gera lançamento automático no Razão Geral debitando ou creditando CPV (5000) e Estoque (1300)"
          >
            <form onSubmit={handleAdjustStock} className="p-6 space-y-5">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                  Selecione o Item de Estoque *
                </label>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand"
                >
                  {inventory
                    .filter((i) => i.type === "Product")
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.sku} — {item.name} (Atual: {item.qtyOnHand} unidades · Custo: {usd(item.unitCost)})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                  Variação na Quantidade (Delta Qty) *
                </label>
                <input
                  type="number"
                  value={qtyDelta}
                  onChange={(e) => setQtyDelta(e.target.value)}
                  placeholder="Ex: -5 para quebra/perda ou +10 para sobra de inventário"
                  required
                  className="w-full rounded-md bg-canvas px-3 py-2 text-right font-mono text-[13px] border border-line outline-none focus:border-brand shadow-inner"
                />
                <p className="mt-1 text-[11px] text-ink3">
                  Use números negativos para perdas, avarias ou quebras. Use números positivos para sobras encontradas na contagem.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                  Justificativa / Memo de Auditoria *
                </label>
                <input
                  type="text"
                  value={adjustMemo}
                  onChange={(e) => setAdjustMemo(e.target.value)}
                  placeholder="Ex: Avaria durante transporte no pátio, inventário físico trimestral..."
                  required
                  className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand shadow-inner"
                />
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
                  Confirmar e Postar Ajuste
                </button>
              </div>
            </form>
          </Panel>
        </div>
      )}
    </div>
  );
}
