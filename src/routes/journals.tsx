import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting, type JournalEntry } from "@/lib/accounting-store";
import { Badge, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { acct, dash, usd, formatDate, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/journals")({
  head: () =>
    pageHead(
      "General Ledger Journals · LedgerX",
      "Immutable double-entry journal postings with strict debit-credit equality and period locking controls."
    ),
  component: JournalsPage,
});

function JournalsPage() {
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
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [formFeedback, setFormFeedback] = useState<{ msg: string; type: "success" | "error" } | null>(null);

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
    val: string
  ) => {
    const next = [...lines];
    next[idx]![field] = val;
    setLines(next);
  };

  const handlePost = (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);

    if (!memo.trim()) {
      setFormFeedback({ msg: "Please enter a description/memo for the journal entry.", type: "error" });
      return;
    }

    if (!isBalanced) {
      setFormFeedback({
        msg: `Journal is not balanced. Debits ($${totalDebits.toFixed(2)}) must equal Credits ($${totalCredits.toFixed(2)}).`,
        type: "error",
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
      setFormFeedback({ msg: `Successfully posted ${result.entryId}!`, type: "success" });
      setMemo("");
      setOverrideReason("");
      setLines([
        { accountCode: "1000", debit: "0.00", credit: "0.00", memo: "" },
        { accountCode: "6200", debit: "0.00", credit: "0.00", memo: "" },
      ]);
    } else {
      setFormFeedback({ msg: result.error || "Failed to post entry.", type: "error" });
    }
  };

  const handleReverse = (entry: JournalEntry) => {
    const reason = window.prompt(
      `Enter an audit reason to reverse entry ${entry.id} (${entry.memo}):`,
      "Correcting classification error per accountant review."
    );
    if (!reason) return;
    const res = reverseJournalEntry(entry.id, reason);
    if (!res.success) {
      alert(res.error);
    }
  };

  const handleExportCsv = () => {
    const headers = ["Entry ID", "Date", "Memo", "Source Type", "Account", "Account Name", "Debit", "Credit", "Project", "Status"];
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-3">
        <PageTitle
          title="General Ledger & Double-Entry Journals"
          description={`Comprehensive double-entry transaction journal for ${activeCompany.name} · US GAAP Standard`}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs"
          >
            Export Ledger (CSV)
          </button>
        </div>
      </div>

      {/* Period Locking Alert */}
      {activeCompany.isPeriodClosed && (
        <div className="rounded-lg bg-down/[0.08] p-3 text-down ring-1 ring-down/20 flex items-center justify-between text-[12.5px]">
          <span className="font-semibold">
            Warning: Accounting Period {activeCompany.activePeriod} is Closed.
          </span>
          <span>New manual postings require Administrator role & audited reason justification.</span>
        </div>
      )}

      {/* Main Grid: Journal List & New Post Form */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Column: Ledger Entries Table */}
        <div className="lg:col-span-7 space-y-3">
          <Panel
            title="General Ledger Register"
            subtitle={`${journals.length} double-entry transaction batches posted`}
            aside={
              <Badge tone={isLedgerBalanced ? "up" : "down"}>
                {isLedgerBalanced
                  ? `Balanced: Total $${totalDebitSum.toLocaleString()}`
                  : `Diff: ${acct(totalDebitSum - totalCreditSum)}`}
              </Badge>
            }
          >
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr className="border-b border-line/60">
                    <Th>Entry</Th>
                    <Th>Date</Th>
                    <Th>Description / Source</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">Status</Th>
                    <Th align="center">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {journals.map((j) => {
                    const debSum = j.lines.reduce((s, l) => s + l.debit, 0);
                    const isSelected = selectedEntry?.id === j.id;
                    return (
                      <tr
                        key={j.id}
                        className={`border-b border-line/40 last:border-0 hover:bg-black/[0.02] cursor-pointer ${
                          isSelected ? "bg-brand/5" : ""
                        }`}
                        onClick={() => setSelectedEntry(isSelected ? null : j)}
                      >
                        <Td className="font-mono text-[11.5px] font-semibold">{j.id}</Td>
                        <Td className="text-ink3 text-[11.5px]">{formatDate(j.date)}</Td>
                        <Td className="text-ink2 font-medium">
                          <p className="truncate max-w-[220px]">{j.memo}</p>
                          <span className="text-[10px] text-ink3 uppercase tracking-wider">
                            {j.sourceType} {j.sourceId ? `· ${j.sourceId}` : ""}
                          </span>
                        </Td>
                        <Td align="right" className="font-mono text-[12px] font-medium">
                          {usd(debSum)}
                        </Td>
                        <Td align="right">
                          <Badge tone={j.status === "Posted" ? "up" : "neutral"}>{j.status}</Badge>
                        </Td>
                        <Td align="center">
                          {j.status === "Posted" && !userPersona.allowedReportsOnly && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReverse(j);
                              }}
                              className="rounded px-2 py-1 text-[11px] text-down hover:bg-down/10 ring-1 ring-down/20 font-medium transition-colors"
                              title="Reverse this journal entry with a balancing counter-entry"
                            >
                              Reverse
                            </button>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </Panel>

          {/* Drill-down Line Items for Selected Journal */}
          {selectedEntry && (
            <Panel
              title={`Entry Details: ${selectedEntry.id}`}
              subtitle={`${selectedEntry.memo} · Posted by ${selectedEntry.createdBy}`}
              aside={<Badge tone="brand">{selectedEntry.sourceType}</Badge>}
            >
              <div className="p-4 space-y-3">
                {selectedEntry.overrideReason && (
                  <div className="rounded bg-amber-50 p-2.5 text-[11.5px] text-amber-800 ring-1 ring-amber-200">
                    <span className="font-semibold">Closed Period Override Reason: </span>
                    {selectedEntry.overrideReason}
                  </div>
                )}
                <Table>
                  <thead>
                    <tr className="border-b border-line/60">
                      <Th>Account</Th>
                      <Th>Line Memo</Th>
                      <Th align="right">Debit</Th>
                      <Th align="right">Credit</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEntry.lines.map((l) => {
                      const acctObj = accounts.find((a) => a.code === l.accountCode);
                      return (
                        <tr key={l.id} className="border-b border-line/40 last:border-0">
                          <Td className="text-[12px]">
                            <span className="font-mono font-medium">{l.accountCode}</span> ·{" "}
                            <span className="text-ink2">{acctObj ? acctObj.name : "Account"}</span>
                          </Td>
                          <Td className="text-ink3 text-[11.5px]">{l.memo || "—"}</Td>
                          <Td align="right" className="font-mono font-medium">
                            {dash(l.debit)}
                          </Td>
                          <Td align="right" className="font-mono font-medium">
                            {dash(l.credit)}
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

        {/* Right Column: New Balanced Journal Entry Form */}
        <div className="lg:col-span-5">
          {!userPersona.canCreateJournals ? (
            <Panel title="Access Restricted">
              <div className="p-6 text-center text-ink3 text-[12.5px]">
                <p>Your current persona ({userPersona.name}) does not have permission to post journal entries.</p>
                <p className="mt-1">Switch to an internal Accounting role in the header to post.</p>
              </div>
            </Panel>
          ) : (
            <Panel
              title="Post Double-Entry Journal"
              subtitle="Debits must equal credits prior to posting"
              aside={
                <Badge tone={isBalanced ? "up" : "down"}>
                  {isBalanced ? "Balanced (Δ $0.00)" : `Diff: ${acct(diff)}`}
                </Badge>
              }
            >
              <form onSubmit={handlePost} className="p-4 space-y-3">
                {formFeedback && (
                  <div
                    className={`rounded-md p-2.5 text-[12px] ring-1 ${
                      formFeedback.type === "success"
                        ? "bg-up/[0.08] text-up ring-up/20"
                        : "bg-down/[0.08] text-down ring-down/20"
                    }`}
                  >
                    {formFeedback.msg}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Posting Date
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                      className="mt-1 w-full rounded-md bg-white/90 px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none focus:ring-brand"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Project Allocation (Opt.)
                    </label>
                    <select
                      value={selectedProject}
                      onChange={(e) => setSelectedProject(e.target.value)}
                      className="mt-1 w-full rounded-md bg-white/90 px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none focus:ring-brand"
                    >
                      <option value="">No Project Tag</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} — {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                    Transaction Description / Memo
                  </label>
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="e.g. Month-end prepaid insurance amortization"
                    required
                    className="mt-1 w-full rounded-md bg-white/90 px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none focus:ring-brand"
                  />
                </div>

                {/* Line Items */}
                <div className="space-y-2 pt-2 border-t border-line/60">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink3">
                      Account Lines (Min. 2)
                    </span>
                    <button
                      type="button"
                      onClick={handleAddLine}
                      className="text-[11px] font-semibold text-brand hover:underline"
                    >
                      + Add Line
                    </button>
                  </div>

                  {lines.map((line, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg bg-ink/[0.02] p-2.5 ring-1 ring-line/50 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <select
                          value={line.accountCode}
                          onChange={(e) => handleUpdateLine(idx, "accountCode", e.target.value)}
                          className="w-full rounded bg-white px-2 py-1 text-[11.5px] ring-1 ring-line outline-none"
                        >
                          {accounts.map((a) => (
                            <option key={a.code} value={a.code}>
                              {a.code} · {a.name} ({a.type})
                            </option>
                          ))}
                        </select>
                        {lines.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="text-[11px] text-down hover:opacity-80 px-1 font-bold"
                          >
                            ×
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-ink3">Debit ($)</span>
                          <input
                            type="number"
                            step="0.01"
                            value={line.debit}
                            onChange={(e) => handleUpdateLine(idx, "debit", e.target.value)}
                            className="w-full rounded bg-white px-2 py-1 text-right font-mono text-[11.5px] ring-1 ring-line outline-none focus:ring-brand"
                          />
                        </div>
                        <div>
                          <span className="text-[10px] text-ink3">Credit ($)</span>
                          <input
                            type="number"
                            step="0.01"
                            value={line.credit}
                            onChange={(e) => handleUpdateLine(idx, "credit", e.target.value)}
                            className="w-full rounded bg-white px-2 py-1 text-right font-mono text-[11.5px] ring-1 ring-line outline-none focus:ring-brand"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Balance Summary */}
                <div className="rounded-lg bg-ink/[0.03] p-2.5 ring-1 ring-line/60 space-y-1 text-[12px] font-mono">
                  <div className="flex justify-between">
                    <span className="text-ink3 font-sans">Total Debits:</span>
                    <span>{usd(totalDebits)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink3 font-sans">Total Credits:</span>
                    <span>{usd(totalCredits)}</span>
                  </div>
                  <div className="flex justify-between border-t border-line/60 pt-1 font-semibold">
                    <span className="text-ink2 font-sans">Difference (Δ):</span>
                    <span className={diff === 0 ? "text-up" : "text-down"}>{acct(diff)}</span>
                  </div>
                </div>

                {/* Closed Period Override Reason */}
                {activeCompany.isPeriodClosed && (
                  <div className="rounded-md bg-down/[0.05] p-2.5 ring-1 ring-down/20 space-y-1">
                    <label className="block text-[11px] font-semibold text-down">
                      Administrator Override Justification (Mandatory)
                    </label>
                    <textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="State reason for posting into locked period..."
                      rows={2}
                      className="w-full rounded bg-white p-2 text-[11.5px] ring-1 ring-down/30 outline-none"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!isBalanced}
                  className="w-full rounded-md bg-brand py-2 text-[12.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-95 disabled:opacity-40 shadow-2xs"
                >
                  Post to General Ledger
                </button>

                <Note tone="neutral">
                  Posted journal entries are immutable. To correct errors, use the reverse entry button.
                </Note>
              </form>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
