import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting, type InvoiceItem } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, formatDate, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import { ArrowLeft, Plus, Search, Trash2 } from "lucide-react";

export const Route = createFileRoute("/invoices")({
  head: () =>
    pageHead(
      "Invoices & Accounts Receivable · LedgerX",
      "Issue US GAAP compliant customer invoices with automatic inventory relief, sales tax accrual, and subledger aging.",
    ),
  component: InvoicesPage,
});

function InvoicesPage() {
  const modal = useModal();
  const {
    activeCompany,
    invoices,
    inventory,
    projects,
    createInvoice,
    recordInvoicePayment,
    userPersona,
  } = useAccounting();

  // Screen View Mode
  const [view, setView] = useState<"list" | "create">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Invoice creation form state
  const [customerName, setCustomerName] = useState("Northgate Supply Co.");
  const [customerEin, setCustomerEin] = useState("");
  const [date, setDate] = useState("2026-12-22");
  const [dueDate, setDueDate] = useState("2027-01-21");
  const [kind, setKind] = useState<"Product" | "Service">("Product");
  const [projectId, setProjectId] = useState("");
  const [taxExempt, setTaxExempt] = useState(false);
  const [taxRate, setTaxRate] = useState("7.0");

  const [formItems, setFormItems] = useState<
    { sku: string; description: string; qty: number; unitPrice: number }[]
  >([{ sku: "HR-1001", description: "Marine Hardware Stainless Kit", qty: 10, unitPrice: 124.0 }]);

  // Computations
  const subtotal = formItems.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const effectiveTaxRate = taxExempt ? 0 : Number(taxRate) || 0;
  const taxAmount = Math.round(((subtotal * effectiveTaxRate) / 100) * 100) / 100;
  const totalAmount = subtotal + taxAmount;

  const totalOpen = invoices.filter((i) => i.status === "Open").reduce((s, i) => s + i.total, 0);
  const totalOverdue = invoices
    .filter((i) => i.status === "Overdue")
    .reduce((s, i) => s + i.total, 0);
  const totalPaid = invoices.filter((i) => i.status === "Paid").reduce((s, i) => s + i.total, 0);

  const handleAddItemRow = () => {
    setFormItems([
      ...formItems,
      { sku: "HR-2010", description: "316 Marine Fastener Set", qty: 20, unitPrice: 18.5 },
    ]);
  };

  const handleUpdateItem = (
    index: number,
    field: "sku" | "description" | "qty" | "unitPrice",
    val: string | number,
  ) => {
    const next = [...formItems];
    const current = { ...next[index]! };

    if (field === "sku") {
      current.sku = String(val);
      const match = inventory.find((i) => i.sku === val);
      if (match) {
        current.description = match.name;
        current.unitPrice = match.unitPrice;
      }
    } else if (field === "description") {
      current.description = String(val);
    } else if (field === "qty") {
      current.qty = Number(val) || 0;
    } else if (field === "unitPrice") {
      current.unitPrice = Number(val) || 0;
    }

    next[index] = current;
    setFormItems(next);
  };

  const handleRemoveItem = (idx: number) => {
    if (formItems.length <= 1) return;
    setFormItems(formItems.filter((_, i) => i !== idx));
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName.trim()) {
      await modal.showAlert({
        title: "Campo Obrigatório",
        message: "Por favor informe a Razão Social / Nome Legal do Cliente.",
        tone: "warning",
      });
      return;
    }

    const invoiceLines: InvoiceItem[] = formItems.map((it, idx) => ({
      id: `it-${Date.now()}-${idx}`,
      description: it.description,
      sku: it.sku,
      isProduct: kind === "Product",
      qty: Number(it.qty) || 1,
      unitPrice: Number(it.unitPrice) || 0,
      taxable: !taxExempt,
    }));

    const result = createInvoice({
      customerName: customerName.trim(),
      customerEin: customerEin.trim() || undefined,
      date,
      dueDate,
      kind,
      items: invoiceLines,
      subtotal,
      taxRate: effectiveTaxRate,
      taxAmount,
      total: totalAmount,
      taxExempt,
      projectId: projectId || undefined,
    });

    if (result.success) {
      const invId = result.invoiceId;
      setCustomerName("");
      setCustomerEin("");
      setView("list");
      await modal.showAlert({
        title: "Fatura Emitida e Contabilizada",
        message: `Fatura ${invId} emitida com sucesso!\n\nLançamentos automáticos no Razão Geral:\n• Débito em Contas a Receber (1100): ${usd(totalAmount)}\n• Crédito em Receita Operacional (4000/4100): ${usd(subtotal)}\n• Crédito em Impostos sobre Vendas a Recolher (2200): ${usd(taxAmount)}${
          kind === "Product" ? "\n• Baixa no Estoque (1300) e reconhecimento de CPV (5000)." : ""
        }`,
        tone: "success",
      });
    } else {
      await modal.showAlert({
        title: "Erro ao Emitir Fatura",
        message: result.error || "Não foi possível emitir a fatura.",
        tone: "error",
      });
    }
  };

  const handleRecordPayment = async (invId: string) => {
    const paymentDate = new Date().toISOString().split("T")[0]!;
    const res = recordInvoicePayment(invId, paymentDate);
    if (!res.success) {
      await modal.showAlert({
        title: "Erro no Recebimento",
        message: res.error || "Não foi possível registrar o recebimento.",
        tone: "error",
      });
    } else {
      await modal.showAlert({
        title: "Recebimento Confirmado",
        message: `Recebimento da fatura ${invId} registrado com sucesso!\n\nConciliado no Razão Geral com crédito em Contas a Receber (1100) e débito em Disponibilidades / Caixa (1000).`,
        tone: "success",
      });
    }
  };

  const handleExportCsv = () => {
    const headers = [
      "Invoice ID",
      "Customer",
      "Date",
      "Due Date",
      "Kind",
      "Subtotal",
      "Tax Rate %",
      "Tax Amount",
      "Total",
      "Status",
    ];
    const rows = invoices.map((i) => [
      i.id,
      i.customerName,
      i.date,
      i.dueDate,
      i.kind,
      i.subtotal,
      i.taxRate,
      i.taxAmount,
      i.total,
      i.status,
    ]);
    exportToCsv(`${activeCompany.id}_invoices`, headers, rows);
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4">
      {view === "list" ? (
        /* ================= TELA DE LISTAGEM ================= */
        <div className="space-y-4">
          {/* Page Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
            <PageTitle
              title="Invoices & Accounts Receivable (AR)"
              description={`Trade invoicing and receivables management for ${activeCompany.name} · US GAAP Standard`}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs transition-colors cursor-pointer"
              >
                Export Invoices (CSV)
              </button>
              {userPersona.canCreateJournals && (
                <button
                  type="button"
                  onClick={() => setView("create")}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-brand/90 shadow-2xs transition-colors cursor-pointer"
                >
                  <Plus className="size-4" />
                  Emitir Nova Fatura
                </button>
              )}
            </div>
          </div>

          {/* KPI Row */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi
              label="Open Receivables (AR)"
              value={usd(totalOpen)}
              hint="Account 1100 · Current terms"
              tone="neutral"
            />
            <Kpi
              label="Overdue Receivables"
              value={usd(totalOverdue)}
              hint="Past payment due date"
              tone={totalOverdue > 0 ? "down" : "neutral"}
            />
            <Kpi
              label="Collections Received MTD"
              value={usd(totalPaid)}
              hint="Cleared to Cash (Account 1000)"
              tone="up"
            />
          </section>

          {/* Search & Status Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[240px] max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-ink3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por ID ou nome do cliente..."
                className="w-full rounded-md border border-line bg-white/90 py-1.5 pl-8 pr-3 text-[12px] text-ink outline-none ring-1 ring-transparent focus:border-brand focus:ring-brand/20 transition-all"
              />
            </div>
            <div className="flex items-center gap-1.5">
              {["ALL", "Open", "Paid", "Overdue"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                    statusFilter === st
                      ? "bg-brand text-white"
                      : "bg-surface text-ink2 hover:bg-muted ring-1 ring-line"
                  }`}
                >
                  {st === "ALL" ? "Todas as Faturas" : st}
                </button>
              ))}
            </div>
          </div>

          {/* Invoices List Full Width */}
          <Panel
            title="Invoices Register"
            subtitle={`${filteredInvoices.length} de ${invoices.length} faturas emitidas`}
            aside={<span className="text-[11.5px] text-ink3">State Sales Tax by Customer Jurisdiction</span>}
          >
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr className="border-b border-line/60">
                    <Th>Invoice</Th>
                    <Th>Customer Legal Name</Th>
                    <Th>Type</Th>
                    <Th>Issue Date</Th>
                    <Th>Due Date</Th>
                    <Th align="right">Subtotal</Th>
                    <Th align="right">Tax</Th>
                    <Th align="right">Total Amount</Th>
                    <Th align="center">Status</Th>
                    <Th align="center">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <Td colSpan={10} className="py-8 text-center text-[12px] text-ink3">
                        Nenhuma fatura encontrada para o filtro informado.
                      </Td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => (
                      <tr
                        key={inv.id}
                        className="border-b border-line/40 last:border-0 hover:bg-black/[0.01] transition-colors"
                      >
                        <Td className="font-mono text-[11.5px] font-semibold text-brand">
                          {inv.id}
                        </Td>
                        <Td className="text-ink2 font-medium">
                          <p className="font-semibold text-ink text-[12px]">{inv.customerName}</p>
                          {inv.customerEin && (
                            <span className="block text-[10.5px] font-mono text-ink3">
                              EIN: {inv.customerEin}
                            </span>
                          )}
                          {inv.taxExempt && (
                            <span className="text-[10px] text-brand font-semibold">Tax-Exempt</span>
                          )}
                        </Td>
                        <Td className="text-ink3 text-[11.5px]">{inv.kind}</Td>
                        <Td className="text-ink3 text-[11.5px]">{formatDate(inv.date)}</Td>
                        <Td className="text-ink3 text-[11.5px]">{formatDate(inv.dueDate)}</Td>
                        <Td align="right" className="font-mono text-[12px]">
                          {usd(inv.subtotal)}
                        </Td>
                        <Td align="right" className="font-mono text-[12px] text-ink3">
                          {usd(inv.taxAmount)}
                        </Td>
                        <Td align="right" className="font-mono font-semibold text-[12px] text-ink">
                          {usd(inv.total)}
                        </Td>
                        <Td align="center">
                          <Badge
                            tone={
                              inv.status === "Paid"
                                ? "up"
                                : inv.status === "Overdue"
                                  ? "down"
                                  : "brand"
                            }
                          >
                            {inv.status}
                          </Badge>
                        </Td>
                        <Td align="center">
                          {inv.status !== "Paid" && !userPersona.allowedReportsOnly && (
                            <button
                              type="button"
                              onClick={() => handleRecordPayment(inv.id)}
                              className="rounded bg-up/10 px-2.5 py-1 text-[11px] font-semibold text-up hover:bg-up/20 ring-1 ring-up/25 transition-colors cursor-pointer shadow-2xs"
                            >
                              Receber $
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
                US GAAP: Faturas emitidas debitam Contas a Receber (1100) e creditam Receita (4000/4100).
                A apropriação dos impostos é mantida no Passivo (2200) até o efetivo recolhimento.
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
                Voltar para Faturas
              </button>
              <div>
                <h1 className="text-[16px] font-semibold text-ink">Emitir Nova Fatura de Venda</h1>
                <p className="text-[12px] text-ink3">
                  Lançamento de contas a receber com integração automática ao Razão Geral e Estoque
                </p>
              </div>
            </div>
          </div>

          {!userPersona.canCreateJournals ? (
            <Panel title="Acesso Restrito">
              <div className="p-6 text-center text-ink3 text-[12.5px]">
                Usuários do portal do cliente possuem permissão apenas para consulta de faturas.
              </div>
            </Panel>
          ) : (
            <form onSubmit={handleCreateInvoice} className="space-y-4">
              <Panel
                title="Dados do Cliente e Parâmetros da Fatura"
                subtitle="Informações cadastrais e alocação de centro de custo"
              >
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                        Razão Social do Cliente (Legal Name) *
                      </label>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Ex: Acme Marine Logistics LLC"
                        required
                        className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                        Tax ID / EIN do Cliente (Opcional)
                      </label>
                      <input
                        type="text"
                        value={customerEin}
                        onChange={(e) => setCustomerEin(e.target.value)}
                        placeholder="Ex: 12-3456789"
                        className="w-full rounded-md bg-canvas px-3 py-2 font-mono text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                        Tipo de Faturamento
                      </label>
                      <select
                        value={kind}
                        onChange={(e) => setKind(e.target.value as "Product" | "Service")}
                        className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                      >
                        <option value="Product">Produto (Baixa Estoque & CPV)</option>
                        <option value="Service">Serviço / Consultoria</option>
                      </select>
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
                        <option value="">Geral (Sem Projeto)</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} — {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                        Data de Emissão *
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
                  </div>
                </div>
              </Panel>

              {/* Line Items */}
              <Panel
                title="Itens e Serviços da Fatura"
                subtitle="Discrimine as mercadorias ou serviços prestados com quantidades e valores unitários"
                aside={
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand hover:underline cursor-pointer"
                  >
                    <Plus className="size-3.5" /> Adicionar Item
                  </button>
                }
              >
                <div className="p-5 space-y-3">
                  {formItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-3 items-center rounded-lg bg-canvas p-3 border border-line"
                    >
                      <div className="col-span-12 sm:col-span-5">
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                          {kind === "Product" ? "Item do Catálogo de Estoque" : "Descrição do Serviço"}
                        </label>
                        {kind === "Product" ? (
                          <select
                            value={item.sku}
                            onChange={(e) => handleUpdateItem(idx, "sku", e.target.value)}
                            className="w-full rounded-md bg-surface px-2.5 py-1.5 text-[12px] border border-line outline-none focus:border-brand"
                          >
                            {inventory
                              .filter((i) => i.type === "Product")
                              .map((it) => (
                                <option key={it.sku} value={it.sku}>
                                  {it.sku} · {it.name} (Disp: {it.qtyOnHand})
                                </option>
                              ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => handleUpdateItem(idx, "description", e.target.value)}
                            placeholder="Descrição detalhada do serviço..."
                            className="w-full rounded-md bg-surface px-2.5 py-1.5 text-[12px] border border-line outline-none focus:border-brand"
                          />
                        )}
                      </div>

                      <div className="col-span-5 sm:col-span-3">
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                          Quantidade
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => handleUpdateItem(idx, "qty", Number(e.target.value))}
                          className="w-full rounded-md bg-surface px-2.5 py-1.5 text-right font-mono text-[12px] border border-line outline-none focus:border-brand"
                        />
                      </div>

                      <div className="col-span-5 sm:col-span-3">
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                          Preço Unitário ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) =>
                            handleUpdateItem(idx, "unitPrice", Number(e.target.value))
                          }
                          className="w-full rounded-md bg-surface px-2.5 py-1.5 text-right font-mono text-[12px] border border-line outline-none focus:border-brand"
                        />
                      </div>

                      <div className="col-span-2 sm:col-span-1 flex justify-end pt-4">
                        {formItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-rose-500 hover:text-rose-700 transition-colors p-1"
                            title="Remover linha"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              {/* Taxes & Financial Summary */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Panel title="Tributação Estadual (Sales Tax)">
                  <div className="p-4 space-y-3">
                    <label className="flex items-center gap-2 text-[12.5px] text-ink cursor-pointer">
                      <input
                        type="checkbox"
                        checked={taxExempt}
                        onChange={(e) => setTaxExempt(e.target.checked)}
                        className="size-4 rounded accent-brand"
                      />
                      <span className="font-medium">
                        Cliente Isento de Imposto (Certificado Form ST-3)
                      </span>
                    </label>

                    {!taxExempt && (
                      <div className="flex items-center justify-between gap-3 pt-2">
                        <span className="text-[12px] text-ink2">Alíquota Estadual / Municipal (%):</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.1"
                            value={taxRate}
                            onChange={(e) => setTaxRate(e.target.value)}
                            className="w-20 rounded-md bg-canvas px-2.5 py-1 text-right font-mono text-[12px] border border-line outline-none focus:border-brand"
                          />
                          <span className="text-[12px] text-ink3 font-medium">%</span>
                        </div>
                      </div>
                    )}
                  </div>
                </Panel>

                <Panel title="Resumo Contábil da Fatura">
                  <div className="p-4 space-y-2 text-[12.5px] font-mono">
                    <div className="flex justify-between">
                      <span className="text-ink3 font-sans">Subtotal dos Itens:</span>
                      <span>{usd(subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink3 font-sans">Impostos Calculados ({effectiveTaxRate}%):</span>
                      <span>{usd(taxAmount)}</span>
                    </div>
                    <div className="flex justify-between border-t border-line/60 pt-2 font-semibold text-[14px]">
                      <span className="text-ink font-sans">Total Contábil (AR):</span>
                      <span className="text-brand">{usd(totalAmount)}</span>
                    </div>
                  </div>
                </Panel>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className="rounded-md border border-line bg-surface px-4 py-2 text-[12.5px] font-medium text-ink2 hover:bg-muted transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-brand px-6 py-2.5 text-[13px] font-semibold text-white hover:bg-brand/90 transition-colors cursor-pointer shadow-2xs"
                >
                  Emitir e Contabilizar Fatura
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
