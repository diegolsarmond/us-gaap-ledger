import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, pct, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import { ArrowLeft, Plus, Search } from "lucide-react";

export const Route = createFileRoute("/projects")({
  head: () =>
    pageHead(
      "Project Profitability & Job Costing · LedgerX",
      "US GAAP milestone and cost-to-cost project accounting with revenue recognition and direct expense allocation.",
    ),
  component: ProjectsPage,
});

function ProjectsPage() {
  const modal = useModal();
  const { activeCompany, projects, invoices, bills, createProject, userPersona } = useAccounting();

  // Screen View Mode
  const [view, setView] = useState<"list" | "create">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // New Project Form State
  const [code, setCode] = useState("PRJ-2027-01");
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [budget, setBudget] = useState("45000");
  const [contractValue, setContractValue] = useState("65000");
  const [status, setStatus] = useState<"Active" | "Completed" | "On Hold">("Active");
  const [startDate, setStartDate] = useState("2026-12-01");
  const [endDate, setEndDate] = useState("2027-04-30");
  const [notes, setNotes] = useState("");

  // Calculate project metrics
  const projectMetrics = projects.map((p) => {
    const projectInvoices = invoices.filter((i) => i.projectId === p.id);
    const projectBills = bills.filter((b) => b.projectId === p.id);

    const revenue = projectInvoices.reduce((s, i) => s + i.subtotal, 0);
    const actualCosts = projectBills.reduce((s, b) => s + b.usdAmount, 0);
    const grossMargin = revenue - actualCosts;
    const marginPct = revenue > 0 ? (grossMargin / revenue) * 100 : 0;
    const budgetUtilizationPct = p.budget > 0 ? (actualCosts / p.budget) * 100 : 0;
    const budgetVariance = p.budget - actualCosts;
    const cashImpact =
      projectInvoices.filter((i) => i.status === "Paid").reduce((s, i) => s + i.total, 0) -
      projectBills.filter((b) => b.status === "Paid").reduce((s, b) => s + b.usdAmount, 0);

    return {
      ...p,
      revenue,
      actualCosts,
      grossMargin,
      marginPct,
      budgetVariance,
      budgetUtilizationPct,
      cashImpact,
      invoicesCount: projectInvoices.length,
      billsCount: projectBills.length,
    };
  });

  const totalContractValue = projects.reduce((s, p) => s + p.contractValue, 0);
  const totalRecognizedRevenue = projectMetrics.reduce((s, p) => s + p.revenue, 0);
  const totalActualCosts = projectMetrics.reduce((s, p) => s + p.actualCosts, 0);
  const totalGrossMargin = totalRecognizedRevenue - totalActualCosts;
  const overallMarginPct =
    totalRecognizedRevenue > 0 ? (totalGrossMargin / totalRecognizedRevenue) * 100 : 0;

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      await modal.showAlert({
        title: "Campos Obrigatórios",
        message: "Por favor informe o Código e o Nome do Projeto.",
        tone: "warning",
      });
      return;
    }

    createProject({
      code: code.toUpperCase().trim(),
      name: name.trim(),
      clientName: clientName.trim() || "Cliente Direto",
      budget: Number(budget) || 0,
      contractValue: Number(contractValue) || 0,
      status,
      startDate,
      endDate,
      notes: notes.trim(),
    });

    const createdCode = code.toUpperCase().trim();
    setCode("");
    setName("");
    setNotes("");
    setView("list");

    await modal.showAlert({
      title: "Projeto Registrado com Sucesso",
      message: `O projeto ${createdCode} foi cadastrado com sucesso no módulo de Job Costing da empresa ${activeCompany.name}.`,
      tone: "success",
    });
  };

  const handleExportCsv = () => {
    const headers = [
      "Project Code",
      "Project Name",
      "Client",
      "Status",
      "Contract Value ($)",
      "Budget ($)",
      "Recognized Revenue ($)",
      "Direct Costs ($)",
      "Gross Margin ($)",
      "Gross Margin %",
      "Budget Variance ($)",
      "Net Cash Impact ($)",
    ];
    const rows = projectMetrics.map((p) => [
      p.code,
      p.name,
      p.clientName,
      p.status,
      p.contractValue,
      p.budget,
      p.revenue,
      p.actualCosts,
      p.grossMargin,
      p.marginPct.toFixed(1) + "%",
      p.budgetVariance,
      p.cashImpact,
    ]);
    exportToCsv(`${activeCompany.id}_project_profitability`, headers, rows);
  };

  const filteredMetrics = projectMetrics.filter((p) => {
    const matchesSearch =
      p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.clientName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4">
      {view === "list" ? (
        /* ================= TELA DE LISTAGEM ================= */
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
            <PageTitle
              title="Project Profitability & Job Costing"
              description={`Track billable revenue, direct costs, gross margin, and budget utilization for ${activeCompany.name}`}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs transition-colors cursor-pointer"
              >
                Export Profitability (CSV)
              </button>
              {userPersona.canCreateJournals && (
                <button
                  type="button"
                  onClick={() => setView("create")}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-brand/90 shadow-2xs transition-colors cursor-pointer"
                >
                  <Plus className="size-4" />
                  Novo Projeto
                </button>
              )}
            </div>
          </div>

          {/* KPI Row */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Total Contracted Backlog"
              value={usd(totalContractValue)}
              hint={`${projects.length} contracted accounts`}
              tone="neutral"
            />
            <Kpi
              label="Recognized Revenue"
              value={usd(totalRecognizedRevenue)}
              hint="Billed via client invoices"
              tone="up"
            />
            <Kpi
              label="Direct Allocated Costs"
              value={usd(totalActualCosts)}
              hint="Assigned vendor bills & materials"
              tone="neutral"
            />
            <Kpi
              label="Overall Margin %"
              value={pct(overallMarginPct)}
              hint={`${usd(totalGrossMargin)} net gross profit`}
              tone={overallMarginPct > 20 ? "up" : "down"}
            />
          </section>

          {/* Search & Status Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[260px] max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-ink3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por código, nome ou cliente..."
                className="w-full rounded-md border border-line bg-white/90 py-1.5 pl-8 pr-3 text-[12px] text-ink outline-none ring-1 ring-transparent focus:border-brand focus:ring-brand/20 transition-all"
              />
            </div>
            <div className="flex items-center gap-1.5">
              {["ALL", "Active", "Completed", "On Hold"].map((st) => (
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
                  {st === "ALL" ? "Todos os Projetos" : st}
                </button>
              ))}
            </div>
          </div>

          {/* Project Profitability Table Full Width */}
          <Panel
            title="Project Profitability & Margin Ledger"
            subtitle={`${filteredMetrics.length} de ${projects.length} projetos monitorados em tempo real`}
          >
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr className="border-b border-line/60">
                    <Th>Project / Code</Th>
                    <Th>Client Legal Name</Th>
                    <Th align="right">Budget ($)</Th>
                    <Th align="right">Recognized Revenue</Th>
                    <Th align="right">Actual Costs</Th>
                    <Th align="right">Gross Margin</Th>
                    <Th align="right">Budget Utilization</Th>
                    <Th align="center">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMetrics.length === 0 ? (
                    <tr>
                      <Td colSpan={8} className="py-8 text-center text-[12px] text-ink3">
                        Nenhum projeto encontrado para o filtro selecionado.
                      </Td>
                    </tr>
                  ) : (
                    filteredMetrics.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-line/40 last:border-0 hover:bg-black/[0.01] transition-colors"
                      >
                        <Td className="font-medium text-ink">
                          <p className="font-mono text-[11.5px] text-brand font-semibold">{p.code}</p>
                          <p className="text-[12px] truncate max-w-[220px]">{p.name}</p>
                        </Td>
                        <Td className="text-ink2 text-[12px] font-medium">{p.clientName}</Td>
                        <Td align="right" className="font-mono text-[12px]">
                          {usd(p.budget)}
                        </Td>
                        <Td align="right" className="font-mono font-medium text-[12px] text-up">
                          {usd(p.revenue)}
                        </Td>
                        <Td align="right" className="font-mono text-[12px] text-ink2">
                          {usd(p.actualCosts)}
                        </Td>
                        <Td align="right" className="font-mono font-medium text-[12px]">
                          <span className={p.grossMargin >= 0 ? "text-up font-semibold" : "text-down font-semibold"}>
                            {usd(p.grossMargin)}
                          </span>
                          <span className="block text-[10.5px] text-ink3 font-sans">
                            {pct(p.marginPct)} margin
                          </span>
                        </Td>
                        <Td align="right" className="font-mono text-[11.5px]">
                          <span
                            className={
                              p.budgetUtilizationPct > 90 ? "text-down font-semibold" : "text-ink"
                            }
                          >
                            {pct(p.budgetUtilizationPct)}
                          </span>
                          <span className="block text-[10px] text-ink3">
                            {p.budgetVariance >= 0
                              ? `${usd(p.budgetVariance)} saldo`
                              : `Excedido ${usd(Math.abs(p.budgetVariance))}`}
                          </span>
                        </Td>
                        <Td align="center">
                          <Badge
                            tone={
                              p.status === "Completed"
                                ? "up"
                                : p.status === "Active"
                                  ? "brand"
                                  : "neutral"
                            }
                          >
                            {p.status}
                          </Badge>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </div>
            <div className="p-4 border-t border-line/50">
              <Note tone="brand">
                US GAAP Milestone & Cost-to-Cost Recognition: Transações vinculadas a um projeto
                agregam em tempo real nos demonstrativos de margem bruta, sem necessidade de planilhas manuais.
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
                Voltar para Projetos
              </button>
              <div>
                <h1 className="text-[16px] font-semibold text-ink">Cadastrar Novo Projeto</h1>
                <p className="text-[12px] text-ink3">
                  Configuração de centro de custo e alocação de receitas/despesas para {activeCompany.name}
                </p>
              </div>
            </div>
          </div>

          <Panel
            title="Dados Cadastrais do Projeto"
            subtitle="Defina o escopo orçamentário e cronograma para controle de Job Costing"
          >
            <form onSubmit={handleCreateProject} className="p-6 space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Código do Projeto (Project Code) *
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Ex: PRJ-2027-01"
                    required
                    className="w-full rounded-md bg-canvas px-3 py-2 font-mono text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Status Inicial do Projeto
                  </label>
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as "Active" | "Completed" | "On Hold")
                    }
                    className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  >
                    <option value="Active">Active (Em Andamento)</option>
                    <option value="On Hold">On Hold (Pausado)</option>
                    <option value="Completed">Completed (Finalizado)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                  Nome / Descrição do Projeto *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Refit and Propeller Overhaul — Vessel Orca"
                  required
                  className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                  Cliente Destinatário (Client Legal Name)
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Ex: Northgate Supply Co. ou Cliente Interno"
                  className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Valor Contratual / Receita Prevista ($)
                  </label>
                  <input
                    type="number"
                    value={contractValue}
                    onChange={(e) => setContractValue(e.target.value)}
                    className="w-full rounded-md bg-canvas px-3 py-2 text-right font-mono text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Orçamento de Custos Diretos ($)
                  </label>
                  <input
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="w-full rounded-md bg-canvas px-3 py-2 text-right font-mono text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Data de Início
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Data Prevista de Conclusão
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                  Notas / Especificações de Contrato
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Escopo do projeto, entregáveis de marcos contratuais e termos de faturamento..."
                  className="w-full rounded-md bg-canvas p-3 text-[12.5px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
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
                  Cadastrar Projeto
                </button>
              </div>
            </form>
          </Panel>
        </div>
      )}
    </div>
  );
}
