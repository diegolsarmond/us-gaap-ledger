import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanies } from "@/components/company-context";
import { loadAccounting } from "@/lib/accounting";
import {
  amountUnits,
  convertedUnits,
  unitsAmount,
  updateJournalLines,
  accountingDateLabel,
  type JournalInput,
} from "@/lib/journal-model";
import { PageTitle, Panel, Badge } from "@/components/ui-kit";
import { pageHead } from "@/lib/head";
import { exportToCsv } from "@/lib/format";
import { SearchableSelect } from "@/components/searchable-select";
export const Route = createFileRoute("/journals")({
  head: () =>
    pageHead(
      "Journal Entries · LedgerX",
      "Create, approve, post and reverse double-entry journals.",
    ),
  component: JournalsPage,
});
interface Entry {
  id: string;
  version: number;
  journal_number: string | null;
  accounting_date: string;
  journal_type: string;
  description: string;
  reference: string;
  status: string;
  transaction_currency: string;
  functional_currency: string;
  exchange_rate: string;
  exchange_rate_source: string;
  fiscal_period_id: string;
  source_module: string;
  created_by: string;
  creator_name: string;
  created_at: string;
  total: string;
}
interface Line {
  account_code: string;
  description: string;
  debit: string;
  credit: string;
  base_debit: string;
  base_credit: string;
  cost_center_id: string | null;
  project_id: string | null;
  customer_id: string | null;
  vendor_id: string | null;
}
interface Detail {
  entry: Entry;
  lines: Line[];
  events: { id: string; action: string; reason: string; actor_name: string; occurred_at: string }[];
}
interface Listing {
  entries: Entry[];
  count: number;
  permissions: {
    create: boolean;
    approve: boolean;
    post: boolean;
    reverse: boolean;
    soft: boolean;
  };
  policy: { approval_required: boolean; segregate_approval: boolean };
}
const control = "rounded-md border border-line bg-white px-3 py-2 text-sm w-full";
const button = "rounded-md border border-line px-3 py-2 text-sm font-medium disabled:opacity-40";
const blank = (): JournalInput => ({
  journalType: "Manual",
  accountingDate: new Date().toLocaleDateString("en-CA"),
  description: "",
  reference: "",
  currency: "USD",
  exchangeRate: "1",
  exchangeRateSource: "Functional currency parity",
  lines: [
    { accountCode: "", description: "", debit: "0", credit: "0" },
    { accountCode: "", description: "", debit: "0", credit: "0" },
  ],
});
async function api<T>(companyId: string, path = "", method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/journal-entries${path}?companyId=${companyId}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}
function JournalsPage() {
  const { activeCompany } = useCompanies();
  if (!activeCompany) return <p>Select a company to manage journals.</p>;
  return (
    <JournalWorkspace
      key={activeCompany.id}
      companyId={activeCompany.id}
      companyName={activeCompany.name}
    />
  );
}
function JournalWorkspace({ companyId, companyName }: { companyId: string; companyName: string }) {
  const cache = useQueryClient();
  const { user } = useCompanies();
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    status: "",
    search: "",
    account: "",
    period: "",
    type: "",
    source: "",
    creator: "",
    costCenter: "",
  });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVersion, setEditVersion] = useState<number | undefined>();
  const [form, setForm] = useState<JournalInput>(blank);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [reversalDate, setReversalDate] = useState(blank().accountingDate);
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
  params.set("page", String(page));
  const listing = useQuery({
    queryKey: ["journal-list", companyId, filters, page],
    queryFn: async () => {
      const response = await fetch(`/api/journal-entries?companyId=${companyId}&${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      return body as Listing;
    },
  });
  const settings = useQuery({
    queryKey: ["journal-parameters", companyId],
    queryFn: () => loadAccounting({ data: { companyId } }),
  });
  const detail = useQuery({
    queryKey: ["journal-detail", companyId, selected],
    queryFn: () => api<Detail>(companyId, `/${selected}`),
    enabled: !!selected,
  });
  const permissions = listing.data?.permissions;
  const e = detail.data?.entry;
  const entryTotals = (detail.data?.lines ?? []).reduce(
    (totals, line) => ({
      debit: totals.debit + amountUnits(line.debit),
      credit: totals.credit + amountUnits(line.credit),
      baseDebit: totals.baseDebit + amountUnits(line.base_debit),
      baseCredit: totals.baseCredit + amountUnits(line.base_credit),
    }),
    { debit: 0n, credit: 0n, baseDebit: 0n, baseCredit: 0n },
  );
  const entryBalanced =
    (detail.data?.lines.length ?? 0) >= 2 &&
    !!e?.description.trim() &&
    !!detail.data?.lines.every(
      (line) =>
        line.account_code && (amountUnits(line.debit) > 0n || amountUnits(line.credit) > 0n),
    ) &&
    entryTotals.debit > 0n &&
    entryTotals.debit === entryTotals.credit &&
    entryTotals.baseDebit === entryTotals.baseCredit;
  const data = settings.data?.state;
  let baseDebit = 0n,
    baseCredit = 0n;
  let debit = 0n,
    credit = 0n,
    invalid = false;
  try {
    for (const l of form.lines) {
      debit += amountUnits(l.debit);
      baseDebit += convertedUnits(l.debit, form.exchangeRate);
      baseCredit += convertedUnits(l.credit, form.exchangeRate);
      credit += amountUnits(l.credit);
    }
  } catch {
    invalid = true;
  }
  const change = (key: keyof typeof filters, value: string) => {
    setFilters({ ...filters, [key]: value });
    setPage(0);
  };
  async function perform(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      await cache.invalidateQueries({ queryKey: ["journal-list", companyId] });
      await cache.invalidateQueries({ queryKey: ["journal-detail", companyId] });
      await cache.invalidateQueries({ queryKey: ["accounting", companyId] });
      setMessage(success);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  function action(action: string) {
    if (!e) return;
    void perform(
      () =>
        api(companyId, `/${e.id}/${action}`, "POST", { version: e.version, reason, reversalDate }),
      `Journal ${action} completed.`,
    );
  }
  async function edit(entry: Entry) {
    await perform(async () => {
      const d = await api<Detail>(companyId, `/${entry.id}`);
      setForm({
        journalType: d.entry.journal_type as JournalInput["journalType"],
        accountingDate: d.entry.accounting_date,
        description: d.entry.description,
        reference: d.entry.reference,
        currency: d.entry.transaction_currency,
        exchangeRate: d.entry.exchange_rate,
        exchangeRateSource: d.entry.exchange_rate_source,
        lines: d.lines.map((l) => ({
          accountCode: l.account_code || "",
          description: l.description,
          debit: l.debit,
          credit: l.credit,
          ...(l.cost_center_id ? { costCenterId: l.cost_center_id } : {}),
          ...(l.project_id ? { projectId: l.project_id } : {}),
          ...(l.customer_id ? { customerId: l.customer_id } : {}),
          ...(l.vendor_id ? { vendorId: l.vendor_id } : {}),
        })),
      });
      setEditId(entry.id);
      setEditVersion(entry.version);
      setEditing(true);
    }, "");
  }
  const updateLine = (index: number, patch: Partial<JournalInput["lines"][number]>) =>
    setForm((previous) => ({
      ...previous,
      lines: updateJournalLines(previous.lines, index, patch),
    }));
  return (
    <div className="space-y-4">
      <PageTitle
        title="Journal Entries"
        description={`${companyName} · Accrual accounting · Functional currency USD`}
        actions={
          <>
            <button
              className={button}
              disabled={busy || !permissions?.create}
              onClick={() => {
                setForm(blank());
                setEditId(null);
                setEditing(true);
                setSelected(null);
              }}
            >
              New journal
            </button>
            <button
              className={button}
              disabled={!listing.data?.entries.length}
              onClick={() =>
                exportToCsv(
                  "journal-entries-page.csv",
                  ["Number", "Date", "Description", "Status", "Currency", "Debit", "Source"],
                  (listing.data?.entries ?? []).map((j) => [
                    j.journal_number ?? j.id,
                    j.accounting_date,
                    j.description,
                    j.status,
                    j.transaction_currency,
                    j.total,
                    j.source_module,
                  ]),
                )
              }
            >
              Export page CSV
            </button>
          </>
        }
      />
      {message && (
        <p role="status" className="rounded-md border border-line p-3 text-sm">
          {message}
        </p>
      )}
      {(listing.error || settings.error) && (
        <p role="alert">{(listing.error ?? settings.error)?.message}</p>
      )}
      {editing ? (
        <Panel
          title={editId ? "Edit draft" : "New journal"}
          subtitle="Drafts do not affect the General Ledger. Exchange rates are retained when posted."
        >
          <form
            className="space-y-4 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void perform(async () => {
                const r = await api<{ entry: Entry }>(
                  companyId,
                  editId ? `/${editId}` : "",
                  editId ? "PATCH" : "POST",
                  { value: form, ...(editId ? { version: editVersion } : {}) },
                );
                setEditing(false);
                setSelected(r.entry.id);
              }, "Draft saved.");
            }}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <label>
                Accounting date
                <input
                  required
                  type="date"
                  className={control}
                  lang="en-US"
                  value={form.accountingDate}
                  onChange={(v) => setForm({ ...form, accountingDate: v.target.value })}
                />
                <span className="block text-xs text-ink3">
                  {accountingDateLabel(form.accountingDate)} · YYYY-MM-DD: {form.accountingDate}
                </span>
              </label>
              <label>
                Journal type
                <select
                  className={control}
                  value={form.journalType}
                  onChange={(v) =>
                    setForm({ ...form, journalType: v.target.value as JournalInput["journalType"] })
                  }
                >
                  {["Manual", "Adjustment", "Opening", "Reclassification"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Fiscal period
                <input
                  readOnly
                  className={control}
                  value={
                    data?.fiscalPeriods
                      .filter(
                        (p) =>
                          p.startDate <= form.accountingDate && p.endDate >= form.accountingDate,
                      )
                      .map((p) => `${p.periodCode} (${p.status})`)
                      .join(", ") || "No matching period"
                  }
                />
              </label>
              <label className="sm:col-span-2">
                Description
                <input
                  placeholder="e.g. Record November office rent payment"
                  maxLength={4000}
                  className={control}
                  value={form.description}
                  onChange={(v) => setForm({ ...form, description: v.target.value })}
                />
              </label>
              <label>
                Reference
                <input
                  className={control}
                  value={form.reference}
                  onChange={(v) => setForm({ ...form, reference: v.target.value })}
                />
              </label>
              <label>
                Transaction currency
                <select
                  className={control}
                  value={form.currency}
                  onChange={(v) =>
                    setForm({
                      ...form,
                      currency: v.target.value,
                      exchangeRate: v.target.value === "USD" ? "1" : "",
                      exchangeRateSource:
                        v.target.value === "USD" ? "Functional currency parity" : "",
                    })
                  }
                >
                  {data?.currencies
                    .filter((c) => c.status === "Active")
                    .map((c) => (
                      <option key={c.code}>{c.code}</option>
                    ))}
                </select>
              </label>
              <label>
                USD per transaction unit
                <input
                  required
                  inputMode="decimal"
                  className={control}
                  value={form.exchangeRate}
                  onChange={(v) => setForm({ ...form, exchangeRate: v.target.value })}
                />
              </label>
              <label>
                Rate source / dated evidence
                <input
                  required
                  className={control}
                  value={form.exchangeRateSource}
                  onChange={(v) => setForm({ ...form, exchangeRateSource: v.target.value })}
                />
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {[
                      "Account",
                      "Description",
                      "Debit",
                      "Credit",
                      "Base debit (USD)",
                      "Base credit (USD)",
                      "Cost center",
                      "Project",
                      "",
                    ].map((h, i) => (
                      <th key={i} className="p-2 text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="min-w-60 p-1">
                        <SearchableSelect
                          label={`Account line ${i + 1}`}
                          placeholder="Select account"
                          value={l.accountCode}
                          onChange={(accountCode) => updateLine(i, { accountCode })}
                          options={[
                            { value: "", label: "Select account" },
                            ...(data?.accounts ?? [])
                              .filter(
                                (account) =>
                                  !data?.accounts.some(
                                    (child) => child.parentCode === account.code,
                                  ),
                              )
                              .map((account) => ({
                                value: account.code,
                                label: `${account.code} · ${account.name}`,
                              })),
                          ]}
                        />
                      </td>
                      <td className="p-1">
                        <input
                          aria-label={`Description line ${i + 1}`}
                          className={control}
                          value={l.description}
                          onChange={(v) => updateLine(i, { description: v.target.value })}
                        />
                      </td>
                      <td className="min-w-28 p-1">
                        <input
                          aria-label={`Debit line ${i + 1}`}
                          inputMode="decimal"
                          className={control}
                          value={l.debit}
                          onChange={(v) => updateLine(i, { debit: v.target.value })}
                        />
                      </td>
                      <td className="min-w-28 p-1">
                        <input
                          aria-label={`Credit line ${i + 1}`}
                          inputMode="decimal"
                          className={control}
                          value={l.credit}
                          onChange={(v) => updateLine(i, { credit: v.target.value })}
                        />
                      </td>
                      <td className="p-2 font-mono">
                        {invalid ? "—" : unitsAmount(convertedUnits(l.debit, form.exchangeRate))}
                      </td>
                      <td className="p-2 font-mono">
                        {invalid ? "—" : unitsAmount(convertedUnits(l.credit, form.exchangeRate))}
                      </td>
                      <td className="min-w-36 p-1">
                        <select
                          aria-label={`Cost center line ${i + 1}`}
                          className={control}
                          value={l.costCenterId ?? ""}
                          onChange={(v) => updateLine(i, { costCenterId: v.target.value })}
                        >
                          <option value="">None</option>
                          {data?.costCenters
                            .filter((c) => c.status === "Active")
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.code} · {c.name}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="min-w-36 p-1">
                        <select
                          aria-label={`Project line ${i + 1}`}
                          className={control}
                          value={l.projectId ?? ""}
                          onChange={(v) => updateLine(i, { projectId: v.target.value })}
                        >
                          <option value="">None</option>
                          {data?.projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={button}
                          disabled={form.lines.length <= 2}
                          onClick={() =>
                            setForm({ ...form, lines: form.lines.filter((_, idx) => i !== idx) })
                          }
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p
              className={`font-mono text-sm ${debit !== credit ? "font-bold text-red-700" : ""}`}
              aria-live="polite"
            >
              Debit {unitsAmount(debit)} · Credit {unitsAmount(credit)} · Difference{" "}
              {unitsAmount(debit - credit)} {form.currency}
            </p>
            <p
              className={`font-mono text-sm ${baseDebit !== baseCredit ? "font-bold text-red-700" : ""}`}
              aria-live="polite"
            >
              Base debit {unitsAmount(baseDebit)} · Base credit {unitsAmount(baseCredit)} · Base
              difference {unitsAmount(baseDebit - baseCredit)} USD
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={button}
                onClick={() =>
                  setForm({
                    ...form,
                    lines: [
                      ...form.lines,
                      { accountCode: "", description: "", debit: "0", credit: "0" },
                    ],
                  })
                }
              >
                Add line
              </button>
              <button disabled={busy || invalid} className={button}>
                Save draft
              </button>
              <button type="button" className={button} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      ) : (
        <>
          <Panel title="Filter journals">
            <div className="grid gap-3 p-4 sm:grid-cols-4">
              {(
                [
                  ["search", "Number or description"],
                  ["from", "From date"],
                  ["to", "To date"],
                  ["source", "Source module"],
                  ["creator", "Responsible user ID"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="text-sm">
                  {label}
                  <input
                    type={k === "from" || k === "to" ? "date" : "text"}
                    className={control}
                    value={filters[k]}
                    onChange={(v) => change(k, v.target.value)}
                  />
                </label>
              ))}
              <label className="text-sm">
                Status
                <select
                  className={control}
                  value={filters.status}
                  onChange={(v) => change("status", v.target.value)}
                >
                  <option value="">All statuses</option>
                  {["Draft", "Pending Approval", "Approved", "Rejected", "Posted"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Type
                <select
                  className={control}
                  value={filters.type}
                  onChange={(v) => change("type", v.target.value)}
                >
                  <option value="">All types</option>
                  {[
                    "Manual",
                    "Automatic",
                    "Adjustment",
                    "Opening",
                    "Reclassification",
                    "Reversal",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Fiscal period
                <select
                  className={control}
                  value={filters.period}
                  onChange={(v) => change("period", v.target.value)}
                >
                  <option value="">All periods</option>
                  {data?.fiscalPeriods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.periodCode}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Account
                <select
                  className={control}
                  value={filters.account}
                  onChange={(v) => change("account", v.target.value)}
                >
                  <option value="">All accounts</option>
                  {data?.accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Cost center
                <select
                  className={control}
                  value={filters.costCenter}
                  onChange={(v) => change("costCenter", v.target.value)}
                >
                  <option value="">All centers</option>
                  {data?.costCenters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Panel>
          <Panel
            title="Journals"
            subtitle={`${listing.data?.count ?? 0} records · Page ${page + 1}`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {[
                      "Number / draft ID",
                      "Date",
                      "Company",
                      "Description",
                      "Type / source",
                      "Total",
                      "Currency",
                      "Period",
                      "Status",
                      "Responsible",
                      "Actions",
                    ].map((h) => (
                      <th className="p-3 text-left" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {listing.data?.entries.map((j) => (
                    <tr key={j.id} className="border-t border-line">
                      <td className="p-3 font-mono">{j.journal_number ?? j.id.slice(0, 8)}</td>
                      <td className="p-3 whitespace-nowrap">{j.accounting_date}</td>
                      <td className="p-3">{companyName}</td>
                      <td className="p-3">{j.description}</td>
                      <td className="p-3">
                        {j.journal_type} / {j.source_module}
                      </td>
                      <td className="p-3 font-mono">{j.total}</td>
                      <td className="p-3">{j.transaction_currency}</td>
                      <td className="p-3">
                        {data?.fiscalPeriods.find((p) => p.id === j.fiscal_period_id)?.periodCode ??
                          j.fiscal_period_id}
                      </td>
                      <td className="p-3">
                        <Badge>{j.status}</Badge>
                      </td>
                      <td className="p-3">{j.creator_name}</td>
                      <td className="p-3">
                        <button
                          className={button}
                          onClick={() => {
                            setSelected(j.id);
                            setReason("");
                          }}
                        >
                          View
                        </button>
                        {j.status === "Draft" && permissions?.create && (
                          <button disabled={busy} className={button} onClick={() => void edit(j)}>
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {listing.isPending ? (
              <p className="p-4">Loading journals…</p>
            ) : (
              listing.data?.count === 0 && (
                <p className="p-4">No journals match these filters. Create a draft to begin.</p>
              )
            )}
            <div className="flex gap-2 p-4">
              <button className={button} disabled={!page} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <button
                className={button}
                disabled={(page + 1) * 50 >= (listing.data?.count ?? 0)}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </Panel>
          {selected && (
            <Panel
              title="Journal detail"
              aside={
                <button className={button} onClick={() => setSelected(null)}>
                  Close
                </button>
              }
            >
              {detail.error && (
                <p role="alert" className="p-4">
                  {detail.error.message}
                </p>
              )}
              {detail.isPending ? (
                <p className="p-4">Loading…</p>
              ) : (
                e && (
                  <div className="space-y-4 p-4">
                    <div>
                      <strong>
                        {e.journal_number ?? e.id} · {e.status}
                      </strong>
                      <p>
                        {e.accounting_date} · {e.description}
                      </p>
                      <p>
                        {e.transaction_currency} → {e.functional_currency} · Rate {e.exchange_rate}{" "}
                        · {e.exchange_rate_source}
                      </p>
                      <p>Reference: {e.reference || "—"}</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            {[
                              "Account",
                              "Description",
                              "Debit",
                              "Credit",
                              "Base debit (USD)",
                              "Base credit (USD)",
                              "Cost center",
                            ].map((h) => (
                              <th key={h} className="p-2 text-left">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {detail.data?.lines.map((l, i) => (
                            <tr key={i}>
                              <td className="p-2">
                                {l.account_code} ·{" "}
                                {data?.accounts.find((a) => a.code === l.account_code)?.name}
                              </td>
                              <td>{l.description}</td>
                              <td>{l.debit}</td>
                              <td>{l.credit}</td>
                              <td>{l.base_debit}</td>
                              <td>{l.base_credit}</td>
                              <td>
                                {data?.costCenters.find((c) => c.id === l.cost_center_id)?.name ??
                                  "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div
                      className={`space-y-1 rounded-md border p-3 text-sm ${entryBalanced ? "border-line" : "border-red-300 bg-red-50 text-red-800"}`}
                    >
                      <p className="font-mono">
                        Debit {unitsAmount(entryTotals.debit)} · Credit{" "}
                        {unitsAmount(entryTotals.credit)} · Difference{" "}
                        {unitsAmount(entryTotals.debit - entryTotals.credit)}{" "}
                        {e.transaction_currency}
                      </p>
                      <p className="font-mono">
                        Base debit {unitsAmount(entryTotals.baseDebit)} · Base credit{" "}
                        {unitsAmount(entryTotals.baseCredit)} · Difference{" "}
                        {unitsAmount(entryTotals.baseDebit - entryTotals.baseCredit)}{" "}
                        {e.functional_currency}
                      </p>
                      {!entryBalanced && (
                        <p role="status">
                          This journal is incomplete or unbalanced. Edit the draft and review the
                          details before submitting for approval or posting.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {e.status === "Draft" && permissions?.create && (
                        <>
                          <button disabled={busy} className={button} onClick={() => void edit(e)}>
                            Edit draft
                          </button>
                          <button
                            disabled={busy || !entryBalanced}
                            className={button}
                            onClick={() => action("submit")}
                          >
                            Submit for approval
                          </button>
                        </>
                      )}
                      {e.status === "Rejected" && permissions?.create && (
                        <button disabled={busy} className={button} onClick={() => action("revise")}>
                          Revise as draft
                        </button>
                      )}
                      {e.status === "Pending Approval" &&
                        permissions?.approve &&
                        (!listing.data?.policy.segregate_approval || e.created_by !== user.id) && (
                          <>
                            <button
                              disabled={busy}
                              className={button}
                              onClick={() => action("approve")}
                            >
                              Approve
                            </button>
                            <button
                              disabled={busy || !reason.trim()}
                              className={button}
                              onClick={() => action("reject")}
                            >
                              Reject with reason
                            </button>
                          </>
                        )}
                      {permissions?.post &&
                        (e.status === "Approved" ||
                          (!listing.data?.policy.approval_required && e.status === "Draft")) && (
                          <button
                            disabled={busy || !entryBalanced}
                            className={button}
                            onClick={() => action("post")}
                          >
                            Post to General Ledger
                          </button>
                        )}
                    </div>
                    {(e.status === "Pending Approval" || e.status === "Posted") && (
                      <label className="block text-sm">
                        Reason
                        <textarea
                          className={control}
                          value={reason}
                          onChange={(v) => setReason(v.target.value)}
                        />
                      </label>
                    )}
                    {e.status === "Posted" && permissions?.reverse && permissions.post && (
                      <div className="flex items-end gap-2">
                        <label>
                          Reversal accounting date
                          <input
                            type="date"
                            className={control}
                            value={reversalDate}
                            onChange={(v) => setReversalDate(v.target.value)}
                          />
                        </label>
                        <button
                          disabled={busy || !reason.trim() || !reversalDate}
                          className={button}
                          onClick={() => action("reverse")}
                        >
                          Create and post reversal
                        </button>
                      </div>
                    )}
                  </div>
                )
              )}
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
