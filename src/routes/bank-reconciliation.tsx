import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Lock, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useCompanies } from "@/components/company-context";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import {
  BankDialog,
  BankSubmit,
  ErrorMessage,
  Field,
  SelectField,
  fieldStyle,
} from "@/components/bank-feed-ui";
import {
  completeReconciliation,
  createReconciliation,
  deleteReconciliation,
  loadReconciliation,
  loadReconciliations,
  reopenReconciliation,
  toggleReconciliation,
  updateReconciliation,
} from "@/lib/bank-reconciliation";
import {
  reconciliationStatusLabel,
  reconciliationTotals,
  signedUnits,
  type ReconciliationStatus,
} from "@/lib/bank-reconciliation-model";
import { formatCurrency, formatDate } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/bank-reconciliation")({
  validateSearch: (search: Record<string, unknown>): { account?: string; id?: string } => ({
    ...(typeof search["account"] === "string" && search["account"]
      ? { account: search["account"] }
      : {}),
    ...(typeof search["id"] === "string" && search["id"] ? { id: search["id"] } : {}),
  }),
  head: () =>
    pageHead(
      "Bank Reconciliation · World Business",
      "Reconcile bank and credit card statements against posted Bank Feed transactions.",
    ),
  component: ReconciliationPage,
});

type List = Awaited<ReturnType<typeof loadReconciliations>>;
type Detail = Awaited<ReturnType<typeof loadReconciliation>>;
type Line = Detail["lines"][number];
type View = "all" | "uncleared" | "cleared";

const signedAmount = /^-?\d{1,14}(\.\d{1,4})?$/;
const statusTone: Record<ReconciliationStatus, "neutral" | "brand" | "up" | "down"> = {
  draft: "neutral",
  in_progress: "brand",
  completed: "up",
  reopened: "down",
};

/** PostgreSQL timestamptz text ("2026-11-09 14:03:11.2+00") as a local date and time. */
function stamp(value: string | null) {
  if (!value) return "—";
  const date = new Date(value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-US");
}

function nextDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function monthBounds() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function ReconciliationPage() {
  const { activeCompany } = useCompanies();
  return activeCompany ? (
    <CompanyReconciliation key={activeCompany.id} companyId={activeCompany.id} />
  ) : (
    <p>Select a company to reconcile its bank accounts.</p>
  );
}

function CompanyReconciliation({ companyId }: { companyId: string }) {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const cache = useQueryClient();
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: ["bank-reconciliation", companyId],
    queryFn: () => loadReconciliations({ data: { companyId } }),
  });
  const accounts = list.data?.accounts ?? [];
  const account = search.account ?? accounts[0]?.account ?? "";
  const history = (list.data?.reconciliations ?? []).filter((r) => r.account === account);
  const selectedId = search.id ?? history[0]?.id;
  const refresh = () => cache.invalidateQueries({ queryKey: ["bank-reconciliation", companyId] });

  return (
    <div className="space-y-4">
      <PageTitle
        title="Bank Reconciliation"
        description="Confirm which Bank Feed transactions the bank cleared each period. Reconciling never posts or changes journal entries."
        actions={
          list.data?.canWrite && accounts.length ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New reconciliation
            </Button>
          ) : null
        }
      />
      {list.data?.periodClosed && (
        <Note tone="neutral">
          <Lock className="size-3.5" /> The company accounting period is closed. Reconciliations are
          read-only.
        </Note>
      )}
      <ErrorMessage error={list.error} />
      {list.isLoading ? (
        <p className="text-sm text-ink3">Loading reconciliations…</p>
      ) : !accounts.length ? (
        <Panel>
          <p className="p-4 text-sm text-ink2">
            No bank or credit card statements were imported yet.{" "}
            <Link to="/statements" className="text-brand underline">
              Import a statement in the Bank Feed
            </Link>{" "}
            to start reconciling.
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Panel title="Bank account" className="self-start">
            <div className="space-y-3 p-3">
              <SelectField
                name="Account"
                value={account}
                change={(value) => navigate({ search: { account: value } })}
                options={accounts.map((a) => ({
                  id: a.account,
                  name: `${a.name} — ${a.account} (${a.currency})`,
                }))}
              />
              <div>
                <p className="mb-1 text-xs font-medium text-ink2">Periods</p>
                {history.length ? (
                  <ul className="space-y-1">
                    {history.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => navigate({ search: { account, id: r.id } })}
                          className={`w-full rounded-md px-2 py-1.5 text-left text-[13px] ring-1 ${
                            r.id === selectedId
                              ? "bg-brand/[0.06] ring-brand/30"
                              : "ring-transparent hover:bg-ink/[0.03]"
                          }`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="tabular-nums">
                              {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
                            </span>
                            <Badge tone={statusTone[r.status]}>
                              {reconciliationStatusLabel[r.status]}
                            </Badge>
                          </span>
                          <span className="text-[11px] text-ink3 tabular-nums">
                            Ending {formatCurrency(r.statementEndingBalance, r.currency)} ·{" "}
                            {r.clearedCount} cleared
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-ink3">No reconciliation for this account yet.</p>
                )}
              </div>
            </div>
          </Panel>
          {selectedId ? (
            <ReconciliationDetail
              key={selectedId}
              companyId={companyId}
              id={selectedId}
              accountName={accounts.find((a) => a.account === account)?.name ?? account}
              onChanged={refresh}
              onDeleted={() => {
                void refresh();
                void navigate({ search: { account } });
              }}
            />
          ) : (
            <Panel>
              <p className="p-4 text-sm text-ink2">
                Start a reconciliation for this account with <b>New reconciliation</b>.
              </p>
            </Panel>
          )}
        </div>
      )}
      {creating && list.data && (
        <CreateDialog
          companyId={companyId}
          list={list.data}
          account={account}
          close={() => setCreating(false)}
          created={(id, created) => {
            setCreating(false);
            void refresh();
            void navigate({ search: { account: created, id } });
          }}
        />
      )}
    </div>
  );
}

function CreateDialog({
  companyId,
  list,
  account: initialAccount,
  close,
  created,
}: {
  companyId: string;
  list: List;
  account: string;
  close: () => void;
  created: (id: string, account: string) => void;
}) {
  const [account, setAccount] = useState(initialAccount);
  const latest = list.reconciliations.find((r) => r.account === account);
  const defaults = monthBounds();
  const [periodStart, setPeriodStart] = useState(
    latest ? nextDay(latest.periodEnd) : defaults.start,
  );
  const [periodEnd, setPeriodEnd] = useState(defaults.end);
  const statementBalance = list.statementBalances.find(
    (b) => b.account === account && b.date === periodEnd,
  );
  const [ending, setEnding] = useState("");
  const [beginning, setBeginning] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const currency = list.accounts.find((a) => a.account === account)?.currency ?? "USD";
  const open = latest && latest.status !== "completed";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const endingValue = ending || statementBalance?.amount || "";
      if (!signedAmount.test(endingValue)) throw new Error("Enter the statement ending balance.");
      if (!latest && !signedAmount.test(beginning))
        throw new Error("Enter the beginning balance for this account's first reconciliation.");
      const result = await createReconciliation({
        data: {
          companyId,
          account,
          periodStart,
          periodEnd,
          statementEndingBalance: endingValue,
          ...(latest ? {} : { beginningBalance: beginning }),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });
      created(result.id, account);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <BankDialog
      title="New reconciliation"
      description="Enter the period and the ending balance printed on the bank statement."
      close={close}
    >
      <form onSubmit={submit} className="space-y-3">
        <SelectField
          name="Bank account"
          value={account}
          change={(value) => {
            setAccount(value);
            const prior = list.reconciliations.find((r) => r.account === value);
            setPeriodStart(prior ? nextDay(prior.periodEnd) : defaults.start);
          }}
          options={list.accounts.map((a) => ({ id: a.account, name: `${a.name} — ${a.account}` }))}
        />
        {open && (
          <Note tone="neutral">
            This account already has an open reconciliation. Complete or delete it first.
          </Note>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field name="Period start">
            <input
              type="date"
              className={fieldStyle}
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              readOnly={!!latest}
              required
            />
          </Field>
          <Field name="Statement ending date">
            <input
              type="date"
              className={fieldStyle}
              value={periodEnd}
              min={periodStart}
              onChange={(e) => setPeriodEnd(e.target.value)}
              required
            />
          </Field>
          <Field name={`Beginning balance (${currency})`}>
            {latest ? (
              <input
                className={`${fieldStyle} bg-ink/[0.03]`}
                value={formatCurrency(latest.statementEndingBalance, currency)}
                readOnly
                title="Carried from the previous reconciliation"
              />
            ) : (
              <input
                inputMode="decimal"
                className={fieldStyle}
                value={beginning}
                onChange={(e) => setBeginning(e.target.value.trim())}
                placeholder="0.00"
              />
            )}
          </Field>
          <Field name={`Statement ending balance (${currency})`}>
            <input
              inputMode="decimal"
              className={fieldStyle}
              value={ending}
              onChange={(e) => setEnding(e.target.value.trim())}
              placeholder={statementBalance ? statementBalance.amount : "0.00"}
            />
          </Field>
        </div>
        {statementBalance && !ending && (
          <p className="text-[12px] text-ink3">
            Using the balance imported with the statement on {formatDate(periodEnd)}.
          </p>
        )}
        <Field name="Notes">
          <textarea
            className={`${fieldStyle} h-16 py-1.5`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </Field>
        <ErrorMessage error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <BankSubmit busy={busy} disabled={!!open}>
            Start reconciliation
          </BankSubmit>
        </div>
      </form>
    </BankDialog>
  );
}

function bookLabel(line: Line) {
  if (line.accounted)
    return line.attemptKind === "match"
      ? "Matched"
      : line.journalNumber
        ? `Posted · ${line.journalNumber}`
        : "Posted";
  return line.status === "Classified" ? "Posting unverified" : "Not posted";
}

function ReconciliationDetail({
  companyId,
  id,
  accountName,
  onChanged,
  onDeleted,
}: {
  companyId: string;
  id: string;
  accountName: string;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const cache = useQueryClient();
  const key = ["bank-reconciliation", companyId, id];
  const detail = useQuery({
    queryKey: key,
    queryFn: () => loadReconciliation({ data: { companyId, id } }),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [ending, setEnding] = useState<string | null>(null);
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [reopening, setReopening] = useState(false);

  // Server state wins whenever no toggle is in flight.
  useEffect(() => {
    if (detail.data && pending === 0)
      setSelected(new Set(detail.data.lines.filter((l) => l.cleared).map((l) => l.id)));
  }, [detail.data, pending]);

  if (detail.isLoading) return <p className="text-sm text-ink3">Loading reconciliation…</p>;
  if (!detail.data) return <ErrorMessage error={detail.error} />;
  const { reconciliation: rec, lines, events, canEdit } = detail.data;
  const currency = rec.currency;
  const money = (value: string) => formatCurrency(value, currency);
  const endingDraft = ending ?? rec.statementEndingBalance;
  const endingValid = signedAmount.test(endingDraft);
  const clearedLines = lines.filter((l) => selected.has(l.id));
  const totals = reconciliationTotals(
    rec.beginningBalance,
    endingValid ? endingDraft : rec.statementEndingBalance,
    clearedLines.map((l) => l.amount),
  );
  const deposits = clearedLines.filter((l) => !l.amount.startsWith("-"));
  const payments = clearedLines.filter((l) => l.amount.startsWith("-"));
  const sum = (items: Line[]) =>
    reconciliationTotals(
      "0",
      "0",
      items.map((l) => l.amount),
    ).clearedTotal;
  const unbooked = clearedLines.filter((l) => !l.accounted);
  const differenceZero = signedUnits(totals.difference) === 0n;
  const endingDirty = ending !== null && ending !== rec.statementEndingBalance;
  const visible = lines.filter(
    (l) =>
      (view === "all" || (view === "cleared") === selected.has(l.id)) &&
      (!query ||
        `${l.description} ${l.fromTo} ${l.amount}`.toLowerCase().includes(query.toLowerCase())),
  );
  const allVisibleSelected = visible.length > 0 && visible.every((l) => selected.has(l.id));

  function toggle(rowIds: string[], cleared: boolean) {
    if (!rowIds.length) return;
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const rowId of rowIds) {
        if (cleared) next.add(rowId);
        else next.delete(rowId);
      }
      return next;
    });
    setPending((n) => n + 1);
    // Serialize writes so the stored selection follows the click order.
    queue.current = queue.current
      .then(() => toggleReconciliation({ data: { companyId, id, rowIds, cleared } }))
      .catch((e: unknown) => setError(e))
      .finally(() => {
        setPending((n) => n - 1);
        void cache.invalidateQueries({ queryKey: key });
        onChanged();
      });
  }

  async function run(action: () => Promise<unknown>, refetch = true) {
    setBusy(true);
    setError(null);
    try {
      await queue.current;
      await action();
      setEnding(null);
      if (refetch) await cache.invalidateQueries({ queryKey: key });
      onChanged();
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <Panel
        title={`${accountName} — ${rec.account}`}
        subtitle={`Statement period ${formatDate(rec.periodStart)} – ${formatDate(rec.periodEnd)} · ${currency}`}
        aside={
          <>
            <Badge tone={statusTone[rec.status]}>{reconciliationStatusLabel[rec.status]}</Badge>
            {detail.data.canDelete && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm("Delete this reconciliation? Cleared selections are discarded.")
                  )
                    void run(() => deleteReconciliation({ data: { companyId, id } }), false).then(
                      (ok) => ok && onDeleted(),
                    );
                }}
              >
                <Trash2 className="size-4" /> Delete
              </Button>
            )}
            {detail.data.canReopen && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setReopening(true)}
              >
                <RotateCcw className="size-4" /> Reopen
              </Button>
            )}
            {canEdit && (
              <Button
                size="sm"
                disabled={
                  busy || pending > 0 || endingDirty || !differenceZero || unbooked.length > 0
                }
                title={
                  !differenceZero
                    ? "The difference must be zero."
                    : unbooked.length
                      ? "Every cleared transaction must be posted or matched in the Bank Feed."
                      : endingDirty
                        ? "Save the statement ending balance first."
                        : undefined
                }
                onClick={() => void run(() => completeReconciliation({ data: { companyId, id } }))}
              >
                <CheckCircle2 className="size-4" /> Complete
              </Button>
            )}
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 p-3 xl:grid-cols-4">
          <Kpi
            label="Beginning balance"
            value={money(rec.beginningBalance)}
            hint={detail.data.previousEnding !== null ? "From previous reconciliation" : "Opening"}
          />
          <div className="frost p-3.5 sm:p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink3">
              Statement ending
            </p>
            {canEdit ? (
              <div className="mt-1.5 flex gap-1.5">
                <input
                  aria-label="Statement ending balance"
                  inputMode="decimal"
                  className={`${fieldStyle} text-lg font-semibold tabular-nums ${endingValid ? "" : "border-down"}`}
                  value={endingDraft}
                  onChange={(e) => setEnding(e.target.value.trim())}
                />
                {endingDirty && (
                  <Button
                    size="sm"
                    disabled={!endingValid || busy}
                    onClick={() =>
                      void run(() =>
                        updateReconciliation({
                          data: { companyId, id, statementEndingBalance: endingDraft },
                        }),
                      )
                    }
                  >
                    Save
                  </Button>
                )}
              </div>
            ) : (
              <p className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums sm:mt-2 sm:text-2xl">
                {money(rec.statementEndingBalance)}
              </p>
            )}
          </div>
          <Kpi
            label="Cleared balance"
            value={money(totals.clearedBalance)}
            hint={`${money(sum(deposits))} in · ${money(sum(payments))} out`}
          />
          <Kpi
            label="Difference"
            value={money(totals.difference)}
            hint={differenceZero ? "Balanced" : "Statement ending − cleared balance"}
            tone={differenceZero ? "up" : "down"}
          />
        </div>
        {rec.status === "reopened" && rec.reopenReason && (
          <div className="px-3 pb-3">
            <Note tone="neutral">
              Reopened by {rec.reopenedBy} on {stamp(rec.reopenedAt)}: {rec.reopenReason}
            </Note>
          </div>
        )}
        {rec.status === "completed" && (
          <div className="px-3 pb-3">
            <Note>
              Completed by {rec.completedBy} on {stamp(rec.completedAt)}.
              {detail.data.fiscalPeriodClosed ? " The fiscal period is closed." : ""}
            </Note>
          </div>
        )}
        {unbooked.length > 0 && canEdit && (
          <div className="px-3 pb-3">
            <Note tone="brand">
              {unbooked.length} cleared transaction(s) are not posted or matched yet.{" "}
              <Link to="/statements" search={{ account: rec.account }} className="underline">
                Review them in the Bank Feed
              </Link>{" "}
              before completing.
            </Note>
          </div>
        )}
        {error ? (
          <div className="px-3 pb-3">
            <ErrorMessage error={error} />
          </div>
        ) : null}
      </Panel>

      <Panel
        title="Transactions"
        subtitle={`${selected.size} of ${lines.length} selected${pending ? " · saving…" : ""}`}
        aside={
          <>
            <input
              aria-label="Search transactions"
              className={`${fieldStyle} h-8 w-44`}
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="Show"
              className={`${fieldStyle} h-8 w-32`}
              value={view}
              onChange={(e) => setView(e.target.value as View)}
            >
              <option value="all">All</option>
              <option value="uncleared">Uncleared</option>
              <option value="cleared">Cleared</option>
            </select>
          </>
        }
      >
        <Table>
          <thead>
            <tr className="border-b border-line/70">
              <Th className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all visible"
                  disabled={!canEdit || !visible.length}
                  checked={allVisibleSelected}
                  onChange={(e) =>
                    toggle(
                      visible
                        .filter((l) => selected.has(l.id) !== e.target.checked)
                        .map((l) => l.id),
                      e.target.checked,
                    )
                  }
                />
              </Th>
              <Th>Date</Th>
              <Th>Description</Th>
              <Th>Bank Feed</Th>
              <Th align="right">Payment</Th>
              <Th align="right">Deposit</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((line) => {
              const out = line.amount.startsWith("-");
              const checked = selected.has(line.id);
              return (
                <tr
                  key={line.id}
                  className={`border-b border-line/50 ${checked ? "bg-up/[0.04]" : ""} ${line.date < rec.periodStart ? "text-ink2" : ""}`}
                >
                  <Td>
                    <input
                      type="checkbox"
                      aria-label={`Clear ${line.description}`}
                      disabled={!canEdit}
                      checked={checked}
                      onChange={(e) => toggle([line.id], e.target.checked)}
                    />
                  </Td>
                  <Td className="whitespace-nowrap">
                    {formatDate(line.date)}
                    {line.date < rec.periodStart && (
                      <span className="ml-1 text-[11px] text-ink3">(prior)</span>
                    )}
                  </Td>
                  <Td>
                    <span className="block">{line.description}</span>
                    {line.fromTo && <span className="text-[11px] text-ink3">{line.fromTo}</span>}
                  </Td>
                  <Td>
                    <Badge tone={line.accounted ? "up" : "down"}>{bookLabel(line)}</Badge>
                  </Td>
                  <Td align="right">{out ? money(line.amount.slice(1)) : ""}</Td>
                  <Td align="right">{out ? "" : money(line.amount)}</Td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr>
                <Td colSpan={6} className="text-center text-ink3">
                  No transactions to show.
                </Td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-line font-medium">
              <Td colSpan={4}>Cleared total</Td>
              <Td align="right">{money(sum(payments).replace(/^-/, ""))}</Td>
              <Td align="right">{money(sum(deposits))}</Td>
            </tr>
          </tfoot>
        </Table>
      </Panel>

      <Panel
        title="History"
        subtitle="Who created, changed, completed or reopened this reconciliation."
      >
        <ul className="divide-y divide-line/60 text-[13px]">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
              <span>
                <b className="capitalize">{e.action}</b> by {e.actor}
                {describeEvent(e.action, e.details, money)}
              </span>
              <span className="text-ink3 tabular-nums">{stamp(e.occurredAt)}</span>
            </li>
          ))}
        </ul>
      </Panel>

      {reopening && (
        <ReopenDialog
          close={() => setReopening(false)}
          reopen={(reason) =>
            run(() => reopenReconciliation({ data: { companyId, id, reason } })).then(
              (ok) => ok && setReopening(false),
            )
          }
          busy={busy}
          error={error}
        />
      )}
    </div>
  );
}

function describeEvent(
  action: string,
  details: Record<string, unknown>,
  money: (value: string) => string,
) {
  if ((action === "cleared" || action === "uncleared") && typeof details["count"] === "number")
    return ` · ${details["count"]} transaction(s), ${money(String(details["total"] ?? "0"))}`;
  if (action === "reopened" && details["reason"]) return ` · ${String(details["reason"])}`;
  if (action === "completed" && details["clearedBalance"])
    return ` · cleared balance ${money(String(details["clearedBalance"]))}`;
  if (action === "updated") {
    const fields = Object.keys(details);
    return fields.length ? ` · ${fields.join(", ")}` : "";
  }
  return "";
}

function ReopenDialog({
  close,
  reopen,
  busy,
  error,
}: {
  close: () => void;
  reopen: (reason: string) => Promise<unknown>;
  busy: boolean;
  error: unknown;
}) {
  const [reason, setReason] = useState("");
  return (
    <BankDialog
      title="Reopen reconciliation"
      description="Reopening lets you change cleared transactions again. The reason is kept in the history."
      close={close}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void reopen(reason.trim());
        }}
      >
        <Field name="Reason">
          <textarea
            className={`${fieldStyle} h-20 py-1.5`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            required
          />
        </Field>
        <ErrorMessage error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <BankSubmit busy={busy} disabled={!reason.trim()}>
            Reopen
          </BankSubmit>
        </div>
      </form>
    </BankDialog>
  );
}
