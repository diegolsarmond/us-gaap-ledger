import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompanies } from "@/components/company-context";
import { PageTitle, Panel, Kpi, Table, Th, Td, Note } from "@/components/ui-kit";
import { pageHead } from "@/lib/head";
import { displayAmount, exactSum, type TrialFilters, type TrialReport } from "@/lib/trial-balance";
import { exportTrial } from "@/lib/trial-balance-export";
export const Route = createFileRoute("/trial-balance")({
  head: () =>
    pageHead(
      "Trial Balance · World Business",
      "General Ledger balances and accounting reconciliation.",
    ),
  component: TrialPage,
});
const control = "rounded-md border border-line bg-white px-3 py-2 text-sm w-full";
const button = "rounded-md border border-line px-3 py-2 text-sm font-medium disabled:opacity-40";
async function load(f: TrialFilters): Promise<TrialReport> {
  const p = new URLSearchParams(
    Object.entries(f)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
  const r = await fetch(`/api/trial-balance?${p}`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
function TrialPage() {
  const { activeCompany } = useCompanies();
  return activeCompany ? (
    <CompanyTrial
      key={activeCompany.id}
      companyId={activeCompany.id}
      companyName={activeCompany.name}
    />
  ) : (
    <p>Select a company to view the Trial Balance.</p>
  );
}
function CompanyTrial({ companyId, companyName }: { companyId: string; companyName: string }) {
  const defaults = (): TrialFilters => {
    const now = new Date();
    const end = now.toLocaleDateString("en-CA");
    return {
      companyId,
      start: end.slice(0, 8) + "01",
      end,
      costCenter: "",
      accountType: "",
      search: "",
      showZero: false,
      view: "Detailed",
      page: 0,
    };
  };
  const [draft, setDraft] = useState(defaults),
    [applied, setApplied] = useState(defaults),
    [period, setPeriod] = useState(""),
    [year, setYear] = useState(""),
    [account, setAccount] = useState(""),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false);
  const q = useQuery({
    queryKey: ["trial-balance", applied],
    queryFn: () => load(applied),
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
  });
  const detail = useQuery({
    queryKey: ["trial-activity", applied, account, page, q.dataUpdatedAt],
    queryFn: () => load({ ...applied, account, page }),
    enabled: !!account,
  });
  const report = q.data;
  const detailed = applied.view === "Detailed";
  const keys = detailed
    ? ([
        "opening_debit",
        "opening_credit",
        "period_debit",
        "period_credit",
        "closing_debit",
        "closing_credit",
      ] as const)
    : (["closing_debit", "closing_credit"] as const);
  const update = (patch: Partial<TrialFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const generate = () => {
    if (!draft.start || !draft.end || draft.start > draft.end) {
      setError("Choose a valid date range.");
      return;
    }
    setError("");
    setAccount("");
    if (JSON.stringify(draft) === JSON.stringify(applied)) void q.refetch();
    else setApplied({ ...draft });
  };
  const exportingReport = async (format: "csv" | "xlsx" | "pdf") => {
    setExporting(true);
    setError("");
    try {
      const snapshot = await load({ ...applied, export: format });
      await exportTrial(snapshot, format);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="space-y-4">
      <PageTitle
        title="Trial Balance"
        description="General Ledger balances and accounting reconciliation."
      />
      <Panel title={companyName} subtitle="Read-only · Functional currency USD">
        <div className="p-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <label>
            Fiscal Year
            <select
              className={control}
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setPeriod("");
                const periods =
                  report?.periods.filter((p) => p.fiscalYear === e.target.value) ?? [];
                if (periods.length)
                  update({
                    start: periods.map((p) => p.startDate).sort()[0]!,
                    end: periods
                      .map((p) => p.endDate)
                      .sort()
                      .at(-1)!,
                  });
              }}
            >
              <option value="">All fiscal years</option>
              {[...new Set(report?.periods.map((p) => p.fiscalYear))].sort().map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <label>
            Fiscal Period
            <select
              className={control}
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                const p = report?.periods.find((p) => p.id === e.target.value);
                if (p) update({ start: p.startDate, end: p.endDate });
              }}
            >
              <option value="">Custom date range</option>
              {report?.periods
                .filter((p) => !year || p.fiscalYear === year)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.periodCode} · {p.status}
                  </option>
                ))}
            </select>
          </label>
          {(["start", "end"] as const).map((k) => (
            <label key={k}>
              {k === "start" ? "Start Date" : "End Date"}
              <input
                className={control}
                type="date"
                value={draft[k]}
                onChange={(e) => {
                  setPeriod("");
                  update({ [k]: e.target.value });
                }}
              />
            </label>
          ))}
          <label>
            Cost Center
            <select
              className={control}
              value={draft.costCenter}
              onChange={(e) => update({ costCenter: e.target.value })}
            >
              <option value="">All cost centers</option>
              <option>Unassigned</option>
              {report?.centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Account Type
            <select
              className={control}
              value={draft.accountType}
              onChange={(e) => update({ accountType: e.target.value })}
            >
              <option value="">All account types</option>
              {[
                "Asset",
                "Liability",
                "Equity",
                "Revenue",
                "COGS",
                "Operating Expense",
                "Other Income",
                "Other Expense",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Search accounts
            <input
              className={control}
              value={draft.search}
              placeholder="Code or name"
              onChange={(e) => update({ search: e.target.value })}
            />
          </label>
          <label>
            Report View
            <select
              className={control}
              value={draft.view}
              onChange={(e) => update({ view: e.target.value as TrialFilters["view"] })}
            >
              <option>Standard</option>
              <option>Detailed</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.showZero}
              onChange={(e) => update({ showZero: e.target.checked })}
            />
            Show Zero Balances
          </label>
          <div className="flex gap-2 col-span-full flex-wrap">
            <button className={button} onClick={generate} disabled={q.isFetching}>
              Generate Report
            </button>
            <button
              className={button}
              onClick={() => {
                const f = defaults();
                setDraft(f);
                setApplied(f);
                setPeriod("");
                setYear("");
                setAccount("");
              }}
            >
              Reset Filters
            </button>
            {(["csv", "xlsx", "pdf"] as const).map((f) => (
              <button
                key={f}
                className={button}
                disabled={!report || exporting || q.isFetching}
                onClick={() => void exportingReport(f)}
              >
                Export {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </Panel>
      {(error || q.error) && (
        <p role="alert" className="text-red-700">
          {error || q.error?.message}
        </p>
      )}
      {q.isPending && <p role="status">Calculating posted ledger balances…</p>}
      {report && (
        <>
          <section className="grid gap-3 sm:grid-cols-4">
            <Kpi
              label="Total Debit"
              value={displayAmount(report.total_debit)}
              hint="All accounts · USD"
            />
            <Kpi
              label="Total Credit"
              value={displayAmount(report.total_credit)}
              hint="All accounts · USD"
            />
            <Kpi
              label="Difference"
              value={displayAmount(report.difference)}
              hint="Global closing balance"
              tone={report.status === "Balanced" ? "up" : "down"}
            />
            <Kpi
              label="Status"
              value={report.status}
              hint="Before display and cost center filters"
              tone={report.status === "Balanced" ? "up" : "down"}
            />
          </section>
          <Note tone="brand">
            A balanced trial balance confirms arithmetic equality. It does not establish that
            account classifications or all transactions are correct. Make adjustments in Journal
            Entries.
          </Note>
          <Panel
            title={`${detailed ? "Detailed" : "Standard"} Trial Balance`}
            subtitle={`${report.filters.start} to ${report.filters.end} · USD · Generated ${new Date(report.generated).toLocaleString()}`}
          >
            <div className="p-4 overflow-x-auto">
              {report.groups.map((g) => {
                const children = report.accounts.filter((a) => g.descendants.includes(a.code));
                return children.length ? (
                  <details key={g.code} className="mb-3 rounded border border-line p-3">
                    <summary className="cursor-pointer font-medium">
                      {g.code} · {g.name} · Debit{" "}
                      {displayAmount(exactSum(children.map((a) => a.closing_debit)))} · Credit{" "}
                      {displayAmount(exactSum(children.map((a) => a.closing_credit)))}
                    </summary>
                    <ul className="p-3">
                      {children.map((a) => (
                        <li key={a.code}>
                          <button
                            className="underline"
                            onClick={() => {
                              setAccount(a.code);
                              setPage(0);
                            }}
                          >
                            {a.code} · {a.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null;
              })}
              <Table>
                <thead>
                  <tr>
                    <Th>Account Code</Th>
                    <Th>Account Name</Th>
                    <Th>Account Type</Th>
                    {keys.map((k) => (
                      <Th key={k} align="right">
                        {k.replaceAll("_", " ")}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.accounts.map((r) => (
                    <tr key={r.code} className="border-b border-line">
                      <Td>
                        <button
                          className="underline text-brand"
                          onClick={() => {
                            setAccount(r.code);
                            setPage(0);
                          }}
                        >
                          {r.code}
                        </button>
                      </Td>
                      <Td>{r.name}</Td>
                      <Td>{r.type}</Td>
                      {keys.map((k) => (
                        <Td key={k} align="right" className="font-mono">
                          {displayAmount(r[k])}
                        </Td>
                      ))}
                    </tr>
                  ))}
                  {!report.accounts.length && (
                    <tr>
                      <Td colSpan={3 + keys.length}>No accounts match this report.</Td>
                    </tr>
                  )}
                  <tr className="font-bold">
                    <Td colSpan={3}>Displayed accounts total</Td>
                    {keys.map((k) => (
                      <Td key={k} align="right">
                        {displayAmount(exactSum(report.accounts.map((r) => r[k])))}
                      </Td>
                    ))}
                  </tr>
                </tbody>
              </Table>
              <p className="mt-3 text-sm">
                Displayed subset difference: {displayAmount(report.subset_difference)} USD.{" "}
                {report.filters.costCenter
                  ? "Cost center differences are a management analysis and may reflect counterparties in other centers."
                  : "Global indicators include every account, regardless of display filters."}
              </p>
            </div>
          </Panel>
        </>
      )}
      {account && (
        <Panel
          title="Account Activity"
          subtitle={
            detail.data?.account_row ? `${account} · ${detail.data.account_row.name}` : account
          }
        >
          <div className="p-4 space-y-3">
            <button className={button} onClick={() => setAccount("")}>
              Close detail
            </button>
            {detail.isPending && <p>Loading activity…</p>}
            {detail.error && <p role="alert">{detail.error.message}</p>}
            {detail.data && (
              <>
                <p>
                  Opening:{" "}
                  {displayAmount(
                    exactSum([
                      detail.data.account_row!.opening_debit,
                      `-${detail.data.account_row!.opening_credit}`,
                    ]),
                  )}{" "}
                  · Closing:{" "}
                  {displayAmount(
                    exactSum([
                      detail.data.account_row!.closing_debit,
                      `-${detail.data.account_row!.closing_credit}`,
                    ]),
                  )}{" "}
                  USD
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <thead>
                      <tr>
                        {[
                          "Journal Number",
                          "Accounting Date",
                          "Description",
                          "Reference",
                          "Source Module",
                          "Debit",
                          "Credit",
                          "Running Balance",
                          "Original Currency / Debit / Credit",
                        ].map((h) => (
                          <Th key={h}>{h}</Th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.data.activity?.map((r, i) => (
                        <tr key={`${r.id}-${i}`}>
                          <Td>
                            {r.id.startsWith("legacy:") ? (
                              r.number
                            ) : (
                              <a
                                className="underline text-brand"
                                href={`/journals?entry=${encodeURIComponent(r.id)}`}
                              >
                                {r.number}
                              </a>
                            )}
                          </Td>
                          <Td>{r.date}</Td>
                          <Td>{r.description}</Td>
                          <Td>{r.reference}</Td>
                          <Td>{r.source}</Td>
                          <Td>{displayAmount(r.debit)}</Td>
                          <Td>{displayAmount(r.credit)}</Td>
                          <Td>{displayAmount(r.running)}</Td>
                          <Td>
                            {r.currency} / {r.original_debit} / {r.original_credit}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
                <div className="flex gap-3">
                  <button className={button} disabled={!page} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </button>
                  <span>Page {page + 1}</span>
                  <button
                    className={button}
                    disabled={(page + 1) * 100 >= (detail.data.activity_count ?? 0)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
