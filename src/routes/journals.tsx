import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting, type JournalEntry } from "@/lib/accounting-store";
import { Badge, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { dash, formatDate, acct, exportToCsv, usd } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import { ArrowLeft, Plus, Search, Trash2 } from "lucide-react";

export const Route = createFileRoute("/journals")({
  head: () =>
    pageHead(
      "General Ledger & Double-Entry Journals · LedgerX",
      "Immutable double-entry transaction journals with debit/credit balance validation and audit trail logging.",
    ),
  component: JournalsPage,
});

function JournalsPage() {
  const modal = useModal();
  const {
    activeCompany,
    journals,
    accounts,
    projects,
    postJournalEntry,
    reverseJournalEntry,
    isLedgerBalanced,
    totalDebitSum,
    totalCreditSum,
    userPersona,
  } = useAccounting();

  // Screen View Mode
  const [view, setView] = useState<"list" | "create">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);

  // New Journal Form State
  const [date, setDate] = useState("2026-12-22");
  const [memo, setMemo] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [lines, setLines] = useState<
    { accountCode: string; debit: string; credit: string; memo: string }[]
  >([
    { accountCode: "1000", debit: "2500.00", credit: "0.00", memo: "" },
    { accountCode: "4000", debit: "0.00", credit: "2500.00", memo: "" },
  ]);
  const [overrideReason, setOverrideReason] = useState("");

  const totalDebits = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredits = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const diff = Math.round(Math.abs(totalDebits - totalCredits) * 100) / 100;
  const isBalanced = diff < 0.01 && totalDebits > 0;

  const handleAddLine = () => {
    setLines([...lines, { accountCode: "6200", debit: "0.00", credit: "0.00", memo: "" }]);
  };

  const handleRemoveLine = (idx: number) => {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleUpdateLine = (
    idx: number,
    field: "accountCode" | "debit" | "credit" | "memo",
    val: string,
  ) => {
    const next = [...lines];
    next[idx]![field] = val;
    setLines(next);
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!memo.trim()) {
      await modal.showAlert({
        title: "Histórico Obrigatório",
        message: "Por favor informe a descrição / histórico do lançamento contábil.",
        tone: "warning",
      });
      return;
    }

    if (!isBalanced) {
      await modal.showAlert({
        title: "Partidas Dobradas Desbalanceadas",
        message: `O lançamento contábil não está equilibrado.\n\nTotal Débitos: ${usd(totalDebits)}\nTotal Créditos: ${usd(totalCredits)}\nDiferença: ${usd(diff)}\n\nConforme os princípios US GAAP, o total de débitos deve ser rigorosamente idêntico ao total de créditos.`,
        tone: "error",
      });
      return;
    }

    const payloadLines = lines.map((l) => ({
      accountCode: l.accountCode,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      memo: l.memo || memo,
      projectId: selectedProject || undefined,
    }));

    const result = postJournalEntry({
      date,
      memo,
      sourceType: "Manual",
      lines: payloadLines,
      overrideReason: activeCompany.isPeriodClosed ? overrideReason : undefined,
    });

    if (result.success) {
      const entryId = result.entryId;
      setMemo("");
      setOverrideReason("");
      setLines([
        { accountCode: "1000", debit: "0.00", credit: "0.00", memo: "" },
        { accountCode: "6200", debit: "0.00", credit: "0.00", memo: "" },
      ]);
      setView("list");
      await modal.showAlert({
        title: "Lançamento Contábil Postado",
        message: `Lote de partidas dobradas ${entryId} postado com sucesso no Razão Geral!\nValor total equilibrado: ${usd(totalDebits)}.`,
        tone: "success",
      });
    } else {
      await modal.showAlert({
        title: "Erro ao Postar Lançamento",
        message: result.error || "Não foi possível postar o lançamento contábil.",
        tone: "error",
      });
    }
  };

  const handleReverse = async (entry: JournalEntry) => {
    const reason = await modal.showPrompt({
      title: `Estornar Lançamento: ${entry.id}`,
      message: `Informe a justificativa formal de auditoria para estornar o lançamento contábil ${entry.id} (${entry.memo}):`,
      defaultValue: "Correção de classificação contábil conforme revisão do auditor.",
      placeholder: "Motivo do estorno...",
      confirmText: "Efetuar Estorno",
      cancelText: "Cancelar",
    });
    if (!reason) return;

    const res = reverseJournalEntry(entry.id, reason);
    if (!res.success) {
      await modal.showAlert({
        title: "Erro no Estorno",
        message: res.error || "Não foi possível efetuar o estorno.",
        tone: "error",
      });
    } else {
      await modal.showAlert({
        title: "Lançamento Estornado",
        message: `O lançamento ${entry.id} foi estornado com sucesso. Um contra-lançamento compensatório foi gerado no Razão Geral.`,
        tone: "success",
      });
    }
  };

  const handleExportCsv = () => {
    const headers = [
      "Entry ID",
      "Date",
      "Memo",
      "Source Type",
      "Account",
      "Account Name",
      "Debit ($)",
      "Credit ($)",
      "Project",
      "Status",
    ];
    const rows: (string | number)[][] = [];

    journals.forEach((j) => {
      j.lines.forEach((l) => {
        const acctObj = accounts.find((a) => a.code === l.accountCode);
        rows.push([
          j.id,
          j.date,
          j.memo,
          j.sourceType,
          l.accountCode,
          acctObj ? acctObj.name : "",
          l.debit,
          l.credit,
          l.projectId || "",
          j.status,
        ]);
      });
    });

    exportToCsv(`${activeCompany.id}_general_ledger`, headers, rows);
  };

  const filteredJournals = journals.filter((j) => {
    return (
      j.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.memo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.lines.some((l) => l.accountCode.includes(searchQuery))
    );
  });

  return (
    <div className="space-y-4">
      {view === "list" ? (
        /* ================= TELA DE LISTAGEM ================= */
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line/60 pb-3">
            <PageTitle
              title="General Ledger & Double-Entry Journals"
              description={`Comprehensive double-entry transaction journal for ${activeCompany.name} · US GAAP Standard`}
            />
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={handleExportCsv}
                className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs transition-colors cursor-pointer"
              >
                Export Ledger (CSV)
              </button>
              {userPersona.canCreateJournals && (
                <button
                  type="button"
                  onClick={() => setView("create")}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-brand/90 shadow-2xs transition-colors cursor-pointer"
                >
                  <Plus className="size-4" />
                  Novo Lançamento Contábil
                </button>
              )}
            </div>
          </div>

          {/* Period Locking Alert */}
          {activeCompany.isPeriodClosed && (
            <div className="rounded-lg bg-down/[0.08] p-3 text-down ring-1 ring-down/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[12.5px]">
              <span className="font-semibold">
                Aviso: O período contábil {activeCompany.activePeriod} está Bloqueado (Closed).
              </span>
              <span>
                Lançamentos manuais requerem perfil de Administrador e justificativa formal de auditoria.
              </span>
            </div>
          )}

          {/* Search bar & Ledger Balance */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-ink3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por lote, histórico ou conta contábil..."
                className="w-full rounded-md border border-line bg-white/90 py-1.5 pl-8 pr-3 text-[12px] text-ink outline-none ring-1 ring-transparent focus:border-brand focus:ring-brand/20 transition-all"
              />
            </div>
            <div className="self-start sm:self-auto">
              <Badge tone={isLedgerBalanced ? "up" : "down"}>
                {isLedgerBalanced
                  ? `Razão Equilibrado: Total Débitos = Total Créditos (${usd(totalDebitSum)})`
                  : `Desbalanço Geral: ${acct(totalDebitSum - totalCreditSum)}`}
              </Badge>
            </div>
          </div>

          {/* General Ledger Table Full Width */}
          <Panel
            title="General Ledger Register"
            subtitle={`${filteredJournals.length} de ${journals.length} lotes de lançamentos registrados`}
          >
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr className="border-b border-line/60">
                    <Th>Batch Entry</Th>
                    <Th>Posting Date</Th>
                    <Th>Transaction Memo / Narrative</Th>
                    <Th>Source Type</Th>
                    <Th align="right">Balanced Total</Th>
                    <Th align="center">Status</Th>
                    <Th align="center">Ação</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJournals.length === 0 ? (
                    <tr>
                      <Td colSpan={7} className="py-8 text-center text-[12px] text-ink3">
                        Nenhum lançamento contábil encontrado para o termo pesquisado.
                      </Td>
                    </tr>
                  ) : (
                    filteredJournals.map((j) => {
                      const batchTotal = j.lines.reduce((s, l) => s + l.debit, 0);
                      const isSelected = selectedEntry?.id === j.id;

                      return (
                        <tr
                          key={j.id}
                          onClick={() => setSelectedEntry(isSelected ? null : j)}
                          className={`border-b border-line/40 last:border-0 cursor-pointer transition-colors ${
                            isSelected ? "bg-brand/5" : "hover:bg-black/[0.01]"
                          }`}
                        >
                          <Td className="font-mono text-[11.5px] font-semibold text-brand">
                            {j.id}
                          </Td>
                          <Td className="text-ink3 text-[11.5px]">{formatDate(j.date)}</Td>
                          <Td className="text-ink font-medium text-[12px]">
                            {j.memo}
                            {j.overrideReason && (
                              <span className="block text-[10px] text-down">
                                Justificativa Auditoria: {j.overrideReason}
                              </span>
                            )}
                          </Td>
                          <Td>
                            <span className="rounded bg-black/[0.04] px-1.5 py-0.5 text-[10.5px] font-mono text-ink2">
                              {j.sourceType}
                            </span>
                          </Td>
                          <Td align="right" className="font-mono font-medium text-[12px]">
                            {usd(batchTotal)}
                          </Td>
                          <Td align="center">
                            <Badge tone={j.status === "Posted" ? "up" : "down"}>{j.status}</Badge>
                          </Td>
                          <Td align="center">
                            <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setSelectedEntry(isSelected ? null : j)}
                                className="rounded px-2 py-1 text-[11px] font-medium text-brand hover:underline"
                              >
                                {isSelected ? "Ocultar" : "Ver Partidas"}
                              </button>
                              {j.status === "Posted" &&
                                j.sourceType === "Manual" &&
                                userPersona.canCreateJournals && (
                                  <button
                                    type="button"
                                    onClick={() => handleReverse(j)}
                                    className="rounded bg-down/10 px-2 py-0.5 text-[11px] font-semibold text-down hover:bg-down/20 ring-1 ring-down/20 transition-colors"
                                  >
                                    Estornar
                                  </button>
                                )}
                            </div>
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
                US GAAP Partidas Dobradas: Clique em qualquer lançamento para inspecionar os débitos
                e créditos individuais com suas respectivas contas contábeis e centros de custo.
              </Note>
            </div>
          </Panel>

          {/* Selected Entry Detail Breakdown */}
          {selectedEntry && (
            <Panel
              title={`Composição do Lote: ${selectedEntry.id}`}
              subtitle={`Histórico: ${selectedEntry.memo} · Data: ${formatDate(selectedEntry.date)}`}
              aside={
                <button
                  type="button"
                  onClick={() => setSelectedEntry(null)}
                  className="text-[11.5px] text-ink3 hover:text-ink cursor-pointer"
                >
                  Fechar Detalhes ×
                </button>
              }
            >
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr className="border-b border-line/60">
                      <Th>Conta Contábil</Th>
                      <Th>Histórico da Linha</Th>
                      <Th align="right">Débito (Dr)</Th>
                      <Th align="right">Crédito (Cr)</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEntry.lines.map((l) => {
                      const acctObj = accounts.find((a) => a.code === l.accountCode);
                      return (
                        <tr key={l.id} className="border-b border-line/40 last:border-0">
                          <Td className="text-[12px]">
                            <span className="font-mono font-semibold text-brand">
                              {l.accountCode}
                            </span>{" "}
                            · <span className="text-ink font-medium">{acctObj ? acctObj.name : "Conta"}</span>
                          </Td>
                          <Td className="text-ink3 text-[11.5px]">{l.memo || "—"}</Td>
                          <Td align="right" className="font-mono font-medium text-ink">
                            {l.debit > 0 ? usd(l.debit) : "—"}
                          </Td>
                          <Td align="right" className="font-mono font-medium text-ink">
                            {l.credit > 0 ? usd(l.credit) : "—"}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            </Panel>
          )}
        </div>
      ) : (
        /* ================= TELA DE CADASTRO ================= */
        <div className="space-y-4 max-w-5xl mx-auto">
          {/* Top Bar with Back Button */}
          <div className="flex items-center justify-between border-b border-line/60 pb-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setView("list")}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink2 hover:bg-muted transition-colors cursor-pointer shadow-2xs"
              >
                <ArrowLeft className="size-3.5" />
                Voltar para o Razão Geral
              </button>
              <div>
                <h1 className="text-[16px] font-semibold text-ink">
                  Novo Lançamento Contábil (Partidas Dobradas)
                </h1>
                <p className="text-[12px] text-ink3">
                  Registro manual com validação em tempo real de igualdade entre débitos e créditos
                </p>
              </div>
            </div>

            {/* Live Balance Status Badge */}
            <Badge tone={isBalanced ? "up" : "down"}>
              {isBalanced
                ? `Equilibrado: ${usd(totalDebits)}`
                : `Diferença: ${usd(diff)} (Dr: ${usd(totalDebits)} | Cr: ${usd(totalCredits)})`}
            </Badge>
          </div>

          <form onSubmit={handlePost} className="space-y-4">
            <Panel
              title="Informações do Lote Contábil"
              subtitle="Data de competência, histórico principal e vinculação a centro de custo"
            >
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                      Data de Lançamento (Posting Date) *
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
                      Centro de Custo / Projeto
                    </label>
                    <select
                      value={selectedProject}
                      onChange={(e) => setSelectedProject(e.target.value)}
                      className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                    >
                      <option value="">Geral da Empresa (Sem Projeto)</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} — {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                      Tipo de Origem
                    </label>
                    <div className="w-full rounded-md bg-ink/[0.04] px-3 py-2 text-[13px] border border-line font-mono text-ink2">
                      Manual Journal Entry (GL)
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Histórico Contábil / Memo *
                  </label>
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="Ex: Apropriação mensal de amortização de software, Ajuste de provisão fiscal..."
                    required
                    className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                  />
                </div>

                {activeCompany.isPeriodClosed && (
                  <div className="rounded-lg bg-down/[0.06] p-3 border border-down/20 space-y-1">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-down">
                      Justificativa Obrigatória de Auditoria (Período Fechado) *
                    </label>
                    <input
                      type="text"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Motivo formal autorizado pelo CPA para lançamento em período fechado..."
                      required
                      className="w-full rounded-md bg-white px-3 py-2 text-[12.5px] border border-down/30 outline-none focus:border-down focus:ring-1 focus:ring-down"
                    />
                  </div>
                )}
              </div>
            </Panel>

            {/* Dynamic Lines Table */}
            <Panel
              title="Partidas Dobradas (Débitos e Créditos)"
              subtitle="Adicione pelo menos 2 linhas contábeis. A soma dos débitos deve ser estritamente igual à dos créditos"
              aside={
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand hover:underline cursor-pointer"
                >
                  <Plus className="size-3.5" /> Adicionar Linha
                </button>
              }
            >
              <div className="p-5 space-y-3">
                {lines.map((l, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2.5 sm:gap-3 items-center rounded-lg bg-canvas p-3 border border-line"
                  >
                    <div className="col-span-12 sm:col-span-5">
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                        Conta Contábil
                      </label>
                      <select
                        value={l.accountCode}
                        onChange={(e) => handleUpdateLine(idx, "accountCode", e.target.value)}
                        className="w-full rounded-md bg-surface px-2.5 py-1.5 text-[12px] border border-line outline-none focus:border-brand font-mono"
                      >
                        {accounts.map((a) => (
                          <option key={a.code} value={a.code}>
                            {a.code} · {a.name} ({a.type})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-12 sm:col-span-3">
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                        Memo Específico (Opcional)
                      </label>
                      <input
                        type="text"
                        value={l.memo}
                        onChange={(e) => handleUpdateLine(idx, "memo", e.target.value)}
                        placeholder={memo || "Memo da linha..."}
                        className="w-full rounded-md bg-surface px-2.5 py-1.5 text-[12px] border border-line outline-none focus:border-brand"
                      />
                    </div>

                    <div className="col-span-5 sm:col-span-2">
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink3 mb-1 text-right">
                        Débito ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.debit}
                        onChange={(e) => handleUpdateLine(idx, "debit", e.target.value)}
                        className="w-full rounded-md bg-surface px-2 py-1.5 text-right font-mono text-[12px] border border-line outline-none focus:border-brand"
                      />
                    </div>

                    <div className="col-span-5 sm:col-span-2">
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-ink3 mb-1 text-right">
                        Crédito ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.credit}
                        onChange={(e) => handleUpdateLine(idx, "credit", e.target.value)}
                        className="w-full rounded-md bg-surface px-2 py-1.5 text-right font-mono text-[12px] border border-line outline-none focus:border-brand"
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-1 flex justify-end pt-4 sm:pt-5">
                      {lines.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="text-rose-500 hover:text-rose-700 transition-colors p-1 cursor-pointer"
                          title="Remover linha"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Live Balancing Summary Bar */}
                <div className="flex flex-wrap items-center justify-between rounded-lg bg-white p-4 border border-line shadow-inner text-[13px] font-mono">
                  <div className="space-x-4">
                    <span>
                      Total Débitos: <strong className="text-ink">{usd(totalDebits)}</strong>
                    </span>
                    <span>
                      Total Créditos: <strong className="text-ink">{usd(totalCredits)}</strong>
                    </span>
                  </div>
                  <div>
                    {isBalanced ? (
                      <span className="font-sans font-semibold text-emerald-600">
                        ✓ Partidas perfeitamente equilibradas
                      </span>
                    ) : (
                      <span className="font-sans font-semibold text-rose-600">
                        ⚠ Diferença pendente: {usd(diff)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Panel>

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
                disabled={!isBalanced}
                className={`rounded-md px-6 py-2.5 text-[13px] font-semibold text-white transition-all shadow-2xs ${
                  isBalanced
                    ? "bg-brand hover:bg-brand/90 cursor-pointer"
                    : "bg-ink/30 cursor-not-allowed opacity-60"
                }`}
              >
                Salvar e Postar no Razão
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
