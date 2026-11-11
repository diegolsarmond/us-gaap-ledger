import { loadParameters } from "@/lib/parameters";
import { useCompanies } from "@/components/company-context";
import { CashManagementReport } from "@/components/cash-management-report";
import { CashForecastForm } from "@/components/cash-forecast-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { loadCashData, saveCashFlowOverride } from "@/lib/cash-flow";
import {
  summarize,
  overduePlanned,
  cashFlowLines,
  type CashFlowLine,
  type CashTransaction,
  type Interval,
} from "@/lib/cash-flow-model";
import { PageTitle, Panel, Kpi, Table, Th, Td } from "@/components/ui-kit";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { exportToCsv } from "@/lib/format";
export const Route = createFileRoute("/cash-flow")({
  head: () => ({ meta: [{ title: "Cash flow · World Business" }] }),
  component: CashFlowPage,
});
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const relativeDate = (days: number) => {
  const date = new Date(today() + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const displayDate = (date: string) => date.split("-").reverse().join("/");
const control = "w-full rounded-md border border-line bg-white px-3 py-2 text-sm";
const button = "rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const tabTrigger =
  "data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-xs text-ink2 hover:text-ink py-2 px-3.5 text-xs sm:text-sm font-medium";
const forecastStatus = {
  planned: "Forecast",
  realized: "Forecast · realized",
  cancelled: "Forecast · cancelled",
};
const classifiedBy = {
  override: "changed for this movement",
  mapping: "from cash flow mapping",
  default: "default for the account type",
  forecast: "forecast",
};
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-xs text-ink2">
      <span>{label}</span>
      {children}
    </label>
  );
}
function CashFlowPage() {
  const { activeCompany } = useCompanies();
  return activeCompany ? (
    <CompanyCashFlowPage key={activeCompany.id} />
  ) : (
    <p>Select a company to view cash flow.</p>
  );
}
function CompanyCashFlowPage() {
  const { activeCompany } = useCompanies();
  const companyId = activeCompany!.id;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["cash-flow", companyId],
    queryFn: () => loadCashData({ data: { companyId } }),
  });
  const parameters = useQuery({
    queryKey: ["parameters", companyId],
    queryFn: () => loadParameters({ data: { companyId } }),
  });
  const currencyOptions = useMemo(
    () => [
      ...new Set([
        ...(query.data?.accounts.map((a) => a.currency) ?? []),
        ...(parameters.data?.currencies.filter((c) => c.status === "Active").map((c) => c.code) ??
          []),
      ]),
    ],
    [parameters.data?.currencies, query.data?.accounts],
  );
  const [start, setStart] = useState(() => relativeDate(-28));
  const [end, setEnd] = useState(() => relativeDate(90));
  const [interval, setInterval] = useState<Interval>("weekly");
  const [projected, setProjected] = useState(true);
  const [currency, setCurrency] = useState("USD");
  const [accountId, setAccountId] = useState("");
  useEffect(() => {
    if (currencyOptions.length && !currencyOptions.includes(currency)) {
      setCurrency(currencyOptions[0]!);
      setAccountId("");
    }
  }, [currencyOptions, currency]);
  const [activeTab, setActiveTab] = useState("over-time");
  const [form, setForm] = useState<{ editing: CashTransaction | null } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const data = query.data;
  const allAccounts = data?.accounts ?? [];
  const accounts = allAccounts.filter((a) => !a.unassignedForecasts);
  const glAccounts = data?.glAccounts ?? [];
  const glName = (code: string | null) =>
    code ? `${code} · ${glAccounts.find((a) => a.code === code)?.name ?? ""}` : "—";
  const accountName = (code: string | null) =>
    allAccounts.find((a) => a.id === code)?.name ?? code ?? "—";
  const pendingFor = (code: string) => data?.statementPending.find((p) => p.account === code);
  const transactions = data?.transactions ?? [];
  const filteredAccounts = allAccounts.filter(
    (a) => a.currency === currency && (!accountId || a.id === accountId),
  );
  const ids = new Set(filteredAccounts.map((a) => a.id));
  const filteredTransactions = transactions.filter((t) => ids.has(t.account_id));
  const validRange =
    !!start &&
    !!end &&
    start <= end &&
    new Date(end).getTime() - new Date(start).getTime() <= 366 * 5 * 86400000;
  const report = summarize(
    filteredAccounts,
    filteredTransactions,
    validRange ? start : today(),
    validRange ? end : today(),
    interval,
    projected,
    today(),
  );
  const balances = new Map(
    accounts.map((a) => [
      a.id,
      summarize([a], transactions, today(), today(), "daily", false).periods.at(-1)?.balance ?? 0,
    ]),
  );
  const overdue = overduePlanned(filteredAccounts, filteredTransactions, today());
  const scopeLabel = accountId ? accountName(accountId) : `All ${currency} accounts`;
  const money = (n: number, unit = currency) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: unit }).format(n);
  const totalIn = report.periods.reduce((s, p) => s + p.inflows, 0);
  const totalOut = report.periods.reduce((s, p) => s + p.outflows, 0);
  const listed = filteredTransactions.filter((t) => {
    const date = t.paid_date ?? t.due_date;
    return date >= start && date <= end;
  });
  const plannedOutflows =
    listed
      .filter((t) => t.status === "planned" && t.direction === "out")
      .reduce((sum, t) => sum + Math.round(t.amount * 100), 0) / 100;
  const unclassified = listed.filter(
    (t) => t.source !== "forecast" && !t.balance_adjustment && t.cash_flow_line === "unclassified",
  ).length;
  const waiting = filteredAccounts.flatMap((a) => pendingFor(a.id) ?? []);
  const withoutHistory = filteredAccounts.filter((a) => !a.unassignedForecasts && !a.first_posting);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["cash-flow"] }),
      queryClient.invalidateQueries({ queryKey: ["cash-flow-links"] }),
      queryClient.invalidateQueries({ queryKey: ["cash-gl-check"] }),
    ]);
  }
  async function reclassify(t: CashTransaction, value: string) {
    const counterpart = t.counterpart_code ?? (t.source === "quickbooks" ? "" : null);
    if (!t.journal || counterpart === null || pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await saveCashFlowOverride({
        data: {
          companyId,
          journal_id: t.journal.id,
          line_sequence: t.journal.sequence,
          counterpart_code: counterpart,
          cash_flow_line: value === "" ? null : (value as CashFlowLine),
        },
      });
      await refresh();
      setNotice(
        value === "" ? "Classification returned to the account mapping." : "Movement reclassified.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reclassify. Please try again.");
    } finally {
      setPending(false);
    }
  }
  function exportReport() {
    exportToCsv(
      "cash_flow_" + currency + "_" + start + "_" + end,
      [
        "Period",
        "Previous balance",
        "Inflows",
        "Outflows",
        "Opening balances and FX remeasurement",
        "Net cash flow",
        "Closing balance",
        "Currency",
        "Scope",
        "View",
      ],
      report.periods.map((p) => [
        p.label,
        p.openingBalance,
        p.inflows,
        p.outflows,
        p.adjustments,
        p.net,
        p.balance,
        currency,
        scopeLabel,
        projected ? `Actual + forecast as of ${today()}` : "Actual",
      ]),
    );
  }
  const reportProps = {
    accounts: filteredAccounts,
    transactions: filteredTransactions,
    start,
    end,
    projected,
    currency,
    companyId,
    accountId,
    asOf: today(),
  };
  const invalidRange = (
    <p role="alert" className="text-red-700">
      Enter a valid period of up to five years.
    </p>
  );
  return (
    <div className="space-y-5">
      <PageTitle
        title="Cash flow"
        description="US GAAP cash flow management · actuals from the General Ledger · Forecast vs. actual."
        actions={
          <>
            <Link to="/statements" className={button}>
              Bank Feed
            </Link>
            <Link to="/parameters/cash-flow-mapping" className={button}>
              Cash flow mapping
            </Link>
            <button
              className={button}
              disabled={!accounts.length || pending}
              onClick={() => {
                setForm({ editing: null });
                setError("");
                setNotice("");
              }}
            >
              New forecast
            </button>
          </>
        }
      />
      {query.isPending && <p role="status">Loading data…</p>}
      {query.isError && (
        <div
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          Unable to load cash flow. Check your connection and confirm that
          database/037_cash_flow_ledger_only.sql has been run.
          <button className="ml-3 underline" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded bg-green-50 p-3 text-sm text-green-800">
          {notice}
        </p>
      )}
      {data && form && (
        <CashForecastForm
          companyId={companyId}
          companyName={activeCompany!.name}
          data={{ ...data, accounts }}
          editing={form.editing}
          defaultAccount={accountId || accounts.find((a) => a.currency === currency)?.id || accounts[0]?.id || ""}
          today={today()}
          onClose={() => setForm(null)}
          onSaved={async (message) => {
            await refresh();
            if (message) {
              setForm(null);
              setNotice(message);
            }
          }}
        />
      )}
      {data && (
        <>
          {!accounts.length && (
            <Panel title="No bank or cash accounts">
              <p className="p-4 text-sm text-ink3">
                Cash Flow reports the bank and cash accounts of the{" "}
                <Link to="/accounts" className="text-brand underline">
                  Chart of Accounts
                </Link>
                . Add one (an Asset account of the Bank type) to see its cash here.
              </p>
            </Panel>
          )}
          <Panel title="Period and view">
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
              <Field label="From">
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className={control}
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className={control}
                />
              </Field>
              <Field label="Group by">
                <select
                  value={interval}
                  onChange={(e) => setInterval(e.target.value as Interval)}
                  className={control}
                >
                  {[
                    ["daily", "Daily"],
                    ["weekly", "Weekly"],
                    ["monthly", "Monthly"],
                    ["quarterly", "Quarterly"],
                    ["semiannual", "Semiannual"],
                    ["yearly", "Yearly"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Currency">
                <select
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value);
                    setAccountId("");
                  }}
                  className={control}
                >
                  {currencyOptions.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Account">
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className={control}
                >
                  <option value="">All in this currency</option>
                  {accounts
                    .filter((a) => a.currency === currency)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.id} · {a.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="View">
                <select
                  value={projected ? "projected" : "actual"}
                  onChange={(e) => setProjected(e.target.value === "projected")}
                  className={control}
                >
                  <option value="actual">Actual</option>
                  <option value="projected">Actual + forecast</option>
                </select>
              </Field>
            </div>
            <p className="px-4 pb-4 text-xs text-ink3">
              Actuals are posted General Ledger movements on bank and cash accounts, by posting
              date; forecasts use their expected date. Weeks start on Monday. Amounts are separated
              by currency without conversion.
            </p>
          </Panel>
          {waiting.length > 0 && (
            <div
              role="status"
              className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            >
              {waiting.reduce((s, p) => s + p.count, 0)} bank statement lines still await review and
              are not actual cash yet. Review them in Bank Feed:{" "}
              {waiting.map((p, i) => (
                <span key={p.account}>
                  {i > 0 && ", "}
                  <Link to="/statements" search={{ account: p.account }} className="underline">
                    {glName(p.account)} ({p.count})
                  </Link>
                </span>
              ))}
              .
            </div>
          )}
          {withoutHistory.length > 0 && (
            <p className="rounded-md border border-line p-3 text-sm">
              {withoutHistory.length === 1
                ? `${glName(withoutHistory[0]!.id)} has`
                : `${withoutHistory.length} accounts have`}{" "}
              no posted General Ledger activity, so their balance starts at zero. Post their opening
              balance in{" "}
              <Link to="/journals" className="text-brand underline">
                Journal Entries
              </Link>{" "}
              (type Opening) to start from the real balance.
            </p>
          )}
          {unclassified > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {unclassified} posted movement{unclassified === 1 ? " is" : "s are"} unclassified in
              this period. Map their counterpart accounts in{" "}
              <Link to="/parameters/cash-flow-mapping" className="underline">
                Cash flow mapping
              </Link>{" "}
              or reclassify them in Transactions during period.
            </p>
          )}
          {!validRange ? (
            invalidRange
          ) : (
            <>
              {!projected && plannedOutflows > 0 && (
                <p
                  role="status"
                  className="rounded border border-line bg-white p-3 text-sm text-ink2"
                >
                  There are {money(plannedOutflows)} in planned payments for this period. They are
                  included in the projected balance; the Actual view includes only posted cash.{" "}
                  <button className="text-brand underline" onClick={() => setProjected(true)}>
                    Include forecasts
                  </button>
                </p>
              )}
              {overdue.length > 0 && (
                <Panel
                  title={`Overdue forecasts · ${overdue.length}`}
                  subtitle={`Expected before ${today()} and still planned. They are excluded from the projection until realized, rescheduled or cancelled.`}
                >
                  <Table>
                    <thead>
                      <tr>
                        <Th>Expected date</Th>
                        <Th>Description</Th>
                        <Th>Account</Th>
                        <Th align="right">Amount</Th>
                        <Th>Action</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {overdue.map((t) => (
                        <tr key={t.id} className="border-t border-line">
                          <Td>{displayDate(t.due_date)}</Td>
                          <Td>{t.description}</Td>
                          <Td>{accountName(t.account_id)}</Td>
                          <Td
                            align="right"
                            className={t.direction === "out" ? "text-red-700" : "text-blue-700"}
                          >
                            {t.direction === "out" ? "−" : "+"}
                            {money(t.amount)}
                          </Td>
                          <Td>
                            <button
                              disabled={pending}
                              className="text-brand underline"
                              onClick={() => setForm({ editing: t })}
                            >
                              Mark realized or reschedule
                            </button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Panel>
              )}
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  label={
                    projected && start > today()
                      ? "Projected balance before period"
                      : "Actual balance before period"
                  }
                  value={money(report.opening)}
                  hint={
                    projected && start > today()
                      ? "Posted cash plus forecasts expected from today until the period starts. Overdue forecasts are excluded."
                      : "Posted cash only; overdue forecasts are not included."
                  }
                />
                <Kpi label="Inflows during period" value={money(totalIn)} tone="up" />
                <Kpi label="Outflows during period" value={money(totalOut)} tone="down" />
                <Kpi
                  label={projected ? "Projected closing balance" : "Actual closing balance"}
                  value={money(report.periods.at(-1)?.balance ?? report.opening)}
                />
              </section>
            </>
          )}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
            <TabsList className="frost h-auto w-full flex-wrap justify-start gap-1.5 p-1.5 border border-line/70">
              <TabsTrigger value="over-time" className={tabTrigger}>
                Cash flow over time
              </TabsTrigger>
              <TabsTrigger value="statement" className={tabTrigger}>
                Statement of Cash Flows
              </TabsTrigger>
              <TabsTrigger value="weekly" className={tabTrigger}>
                Forecast vs. actual
              </TabsTrigger>
              <TabsTrigger value="reconciliation" className={tabTrigger}>
                <span className="hidden sm:inline">
                  Supplemental accounting reconciliation · actual · manual inputs
                </span>
                <span className="sm:hidden">Supplemental reconciliation</span>
              </TabsTrigger>
              <TabsTrigger value="transactions" className={tabTrigger}>
                Transactions during period
              </TabsTrigger>
              <TabsTrigger value="accounts" className={tabTrigger}>
                Accounts
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="over-time"
              forceMount
              className="data-[state=inactive]:hidden space-y-4 focus-visible:outline-none"
            >
              {!validRange ? (
                invalidRange
              ) : (
                <Panel
                  title="Cash flow over time"
                  subtitle={
                    projected
                      ? "Posted cash plus forecasts. Documents without an assigned cash account appear in the currency total."
                      : "Cash posted in the General Ledger."
                  }
                  aside={
                    <button onClick={exportReport} className={button}>
                      Export CSV
                    </button>
                  }
                >
                  <p className="px-4 py-3 text-xs text-ink3">
                    Closing balance = previous balance + opening balances and FX remeasurement +
                    inflows − outflows. Opening journals and FX remeasurement are not cash flows.
                  </p>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Period</Th>
                        <Th align="right">Previous balance</Th>
                        <Th align="right">Inflows</Th>
                        <Th align="right">Outflows</Th>
                        <Th align="right">Opening balances / FX</Th>
                        <Th align="right">Net cash flow</Th>
                        <Th align="right">Closing balance</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.periods.map((p) => (
                        <tr key={p.label} className="border-t border-line">
                          <Td>
                            {interval === "weekly" ? "Week of " : ""}
                            {p.label}
                          </Td>
                          <Td align="right">{money(p.openingBalance)}</Td>
                          <Td align="right">{money(p.inflows)}</Td>
                          <Td align="right">{money(p.outflows)}</Td>
                          <Td align="right">{money(p.adjustments)}</Td>
                          <Td align="right">{money(p.net)}</Td>
                          <Td align="right">{money(p.balance)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Panel>
              )}
            </TabsContent>

            {(["statement", "weekly", "reconciliation"] as const).map((section) => (
              <TabsContent
                key={section}
                value={section}
                forceMount
                className="data-[state=inactive]:hidden space-y-4 focus-visible:outline-none"
              >
                {!validRange ? (
                  invalidRange
                ) : (
                  <CashManagementReport
                    key={`${section}-${companyId}-${currency}-${accountId}-${start}-${end}`}
                    {...reportProps}
                    section={section}
                    interval={interval}
                  />
                )}
              </TabsContent>
            ))}

            <TabsContent
              value="transactions"
              forceMount
              className="data-[state=inactive]:hidden space-y-4 focus-visible:outline-none"
            >
              {!validRange ? (
                invalidRange
              ) : (
                <Panel
                  title="Transactions during period"
                  subtitle={
                    projected
                      ? "Posted cash and planned forecasts affect totals. Realized and cancelled forecasts are shown for reference."
                      : "Only posted cash affects totals. Forecasts are shown for reference."
                  }
                >
                  <Table>
                    <thead>
                      <tr>
                        <Th>Date</Th>
                        <Th>Description · category</Th>
                        <Th>Account</Th>
                        <Th>Source</Th>
                        <Th>Classification</Th>
                        <Th align="right">Amount</Th>
                        <Th>Actions</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {!listed.length && (
                        <tr>
                          <Td colSpan={7}>No transactions in this period.</Td>
                        </tr>
                      )}
                      {listed.map((t) => (
                        <tr key={t.id} className="border-t border-line">
                          <Td>{displayDate(t.paid_date ?? t.due_date)}</Td>
                          <Td>
                            {t.description}
                            <br />
                            <span className="text-xs text-ink3">
                              {t.balance_adjustment
                                ? "Opening balance / FX remeasurement"
                                : t.transfer_account_id
                                  ? `Transfer ${t.direction === "out" ? "to" : "from"} ${accountName(t.transfer_account_id)}`
                                  : t.counterpart_code
                                    ? glName(t.counterpart_code)
                                    : "Split in QuickBooks: account not in the export"}
                            </span>
                            {t.variance_note && (
                              <p className="text-xs text-ink2">{t.variance_note}</p>
                            )}
                          </Td>
                          <Td>{accountName(t.account_id)}</Td>
                          <Td>
                            {t.source === "ledger" ? (
                              <Link to="/journals" className="text-brand underline">
                                {t.journal?.number
                                  ? `Journal ${t.journal.number}`
                                  : "General Ledger"}
                              </Link>
                            ) : t.source === "quickbooks" ? (
                              <Link
                                to="/statements"
                                search={{ account: t.account_id }}
                                className="text-brand underline"
                                title="Posted in QuickBooks before the migration; part of the opening balance"
                              >
                                QuickBooks history
                              </Link>
                            ) : t.source === "bill" ? (
                              <Link to="/payables" className="text-brand underline">Bill</Link>
                            ) : t.source === "invoice" ? (
                              <Link to="/invoices" className="text-brand underline">Invoice</Link>
                            ) : (
                              forecastStatus[t.status as keyof typeof forecastStatus]
                            )}
                          </Td>
                          <Td>
                            {t.source !== "forecast" &&
                            !t.balance_adjustment &&
                            !t.transfer_account_id &&
                            (t.counterpart_code || t.source === "quickbooks") ? (
                              <select
                                aria-label="Cash flow classification"
                                disabled={pending}
                                value={t.classified_by === "override" ? t.cash_flow_line : ""}
                                onChange={(e) => void reclassify(t, e.target.value)}
                                className="max-w-64 rounded border border-line bg-white p-1 text-xs"
                              >
                                <option value="">
                                  {t.classified_by === "override"
                                    ? "Use the account mapping again"
                                    : `${cashFlowLines[t.cash_flow_line].label} · ${classifiedBy[t.classified_by]}`}
                                </option>
                                {Object.entries(cashFlowLines)
                                  .filter(([key]) => key !== "internal_transfer")
                                  .map(([key, l]) => (
                                    <option key={key} value={key}>
                                      {l.activity} · {l.label}
                                    </option>
                                  ))}
                              </select>
                            ) : (
                              <span className="text-xs">
                                {t.balance_adjustment
                                  ? "Not a cash flow"
                                  : cashFlowLines[t.cash_flow_line].label}
                              </span>
                            )}
                            {t.classified_by === "override" && (
                              <span className="block text-xs text-ink3">
                                {classifiedBy.override}
                              </span>
                            )}
                          </Td>
                          <Td
                            align="right"
                            className={`font-medium ${t.direction === "out" ? "text-red-700" : "text-blue-700"}`}
                          >
                            {t.direction === "out" ? "−" : "+"}
                            {money(t.amount)}
                          </Td>
                          <Td>
                            {t.source === "forecast" && (
                              <button
                                disabled={pending}
                                className="text-brand underline"
                                onClick={() => {
                                  setForm({ editing: t });
                                  setError("");
                                  setNotice("");
                                }}
                              >
                                Edit
                              </button>
                            )}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Panel>
              )}
            </TabsContent>

            <TabsContent
              value="accounts"
              forceMount
              className="data-[state=inactive]:hidden space-y-4 focus-visible:outline-none"
            >
              <Panel
                title="Bank and cash accounts"
                subtitle="From the Chart of Accounts. Balances are posted General Ledger balances as of today."
                aside={
                  <Link to="/accounts" className={button}>
                    Chart of Accounts
                  </Link>
                }
              >
                <Table>
                  <thead>
                    <tr>
                      <Th>Account</Th>
                      <Th>Currency</Th>
                      <Th>First posting</Th>
                      <Th align="right">Balance</Th>
                      <Th>Bank Feed</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => {
                      const review = pendingFor(a.id);
                      return (
                        <tr key={a.id} className="border-t border-line">
                          <Td>
                            {a.id} · {a.name}
                          </Td>
                          <Td>{a.currency}</Td>
                          <Td>
                            {a.first_posting ? (
                              displayDate(a.first_posting)
                            ) : (
                              <Link to="/journals" className="text-brand underline">
                                Post opening balance
                              </Link>
                            )}
                          </Td>
                          <Td align="right">{money(balances.get(a.id) ?? 0, a.currency)}</Td>
                          <Td>
                            <Link
                              to="/statements"
                              search={{ account: a.id }}
                              className={
                                review ? "text-amber-800 underline" : "text-brand underline"
                              }
                            >
                              {review ? `${review.count} to review` : "Open"}
                            </Link>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </Panel>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
