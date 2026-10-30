import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Kpi, Panel, Table, Th, Td } from "./ui-kit";
import {
  statement,
  summarize,
  weeklyComparison,
  type CashAccount,
  type CashTransaction,
  type CashReconciliation,
} from "@/lib/cash-flow-model";
import {
  checkCashAgainstGl,
  loadCashReconciliation,
  saveCashReconciliation,
} from "@/lib/cash-flow";
import { exportToCsv } from "@/lib/format";

const fields = [
  ["net_income", "Net income"],
  ["depreciation", "Depreciation & amortization (+)"],
  ["receivables", "Accounts receivable: decrease (+) / increase (−)"],
  ["inventory", "Inventory: decrease (+) / increase (−)"],
  ["payables", "Accounts payable / accruals: increase (+) / decrease (−)"],
  ["taxes_payable", "Taxes payable: increase (+) / decrease (−)"],
  ["other_adjustments", "Other noncash / operating adjustments (signed)"],
  ["balance_sheet_cash", "Balance sheet cash for this scope at period end"],
] as const;
const control = "w-full rounded-md border border-line bg-white px-3 py-2 text-sm";
const button = "rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50";

export function CashManagementReport({
  accounts,
  transactions,
  start,
  end,
  projected,
  currency,
  companyId,
  accountId,
  asOf,
}: {
  accounts: CashAccount[];
  transactions: CashTransaction[];
  start: string;
  end: string;
  projected: boolean;
  currency: "USD" | "BRL" | "EUR";
  companyId: string;
  accountId: string;
  asOf: string;
}) {
  const money = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  const [method, setMethod] = useState<"direct" | "indirect">("direct");
  const showProjected = projected && method === "direct";
  const direct = statement(accounts, transactions, start, end, showProjected, asOf);
  const actual = statement(accounts, transactions, start, end, false);
  const totals = summarize(accounts, transactions, start, end, "monthly", showProjected, asOf);
  const scopeLabel = accountId
    ? (accounts.find((a) => a.id === accountId)?.name ?? "Selected account")
    : `All ${currency} accounts`;
  const actualTotals = summarize(accounts, transactions, start, end, "monthly", false);
  const closing = totals.periods.at(-1)?.balance ?? totals.opening;
  const actualClosing = actualTotals.periods.at(-1)?.balance ?? actualTotals.opening;
  const weekly = weeklyComparison(accounts, transactions, start, end, asOf);
  // Burn is based only on elapsed actual cash flows, never the forecast horizon.
  const elapsedEnd = end < asOf ? end : asOf;
  const elapsed =
    start <= elapsedEnd ? statement(accounts, transactions, start, elapsedEnd, false) : null;
  const days = elapsed ? (Date.parse(elapsedEnd) - Date.parse(start)) / 86400000 + 1 : 0;
  const burn =
    elapsed && !elapsed.unclassifiedCount && elapsed.lines.some((l) => l.count > 0)
      ? (Math.max(0, -(elapsed.operating + elapsed.investing)) / days) * 30.4375
      : null;
  const availableCash = summarize(accounts, transactions, elapsedEnd, elapsedEnd, "daily", false)
    .periods[0]!.balance;
  const runway = burn !== null && burn > 0 ? Math.max(0, availableCash) / burn : null;
  const adjustments = totals.periods.reduce((s, p) => s + Math.round(p.adjustments * 100), 0) / 100;
  const scope = { companyId, start, end, currency, accountId: accountId || null };
  const reconciliation = useQuery({
    queryKey: ["cash-reconciliation", scope],
    queryFn: () => loadCashReconciliation({ data: scope }),
  });
  const glCheck = useQuery({
    queryKey: ["cash-gl-check", scope],
    queryFn: () => checkCashAgainstGl({ data: scope }),
  });
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const saved = reconciliation.data;
  const reconciledOperating = saved
    ? fields
        .filter(([key]) => key !== "balance_sheet_cash")
        .reduce((s, [key]) => s + Math.round(saved[key] * 100), 0) / 100
    : null;
  const operatingDifference =
    reconciledOperating === null
      ? null
      : (Math.round(reconciledOperating * 100) - Math.round(actual.operating * 100)) / 100;
  const cashDifference = saved
    ? (Math.round(actualClosing * 100) - Math.round(saved.balance_sheet_cash * 100)) / 100
    : null;
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const inputs = Object.fromEntries(fields.map(([key]) => [key, Number(data.get(key))]));
    setPending(true);
    setMessage("");
    try {
      await saveCashReconciliation({
        data: {
          ...scope,
          ...inputs,
          explanation: String(data.get("explanation")),
        } as CashReconciliation,
      });
      await queryClient.invalidateQueries({ queryKey: ["cash-reconciliation"] });
      setMessage("Reconciliation saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save reconciliation.");
    } finally {
      setPending(false);
    }
  }
  /** Exports exactly what is on screen: the selected method, view and account scope. */
  function exportStatement() {
    const view = showProjected ? `Actual + forecast as of ${asOf}` : "Actual";
    const row = (
      activity: string,
      line: string,
      inflows: number | "",
      outflows: number | "",
      net: number | "",
    ) => [
      activity,
      line,
      inflows,
      outflows,
      net,
      currency,
      scopeLabel,
      method === "direct" ? "Direct" : "Indirect",
      view,
    ];
    const activityRows = (source: typeof direct, activities: string[]) =>
      source.lines
        .filter((l) => activities.includes(l.activity))
        .filter((l) => l.activity !== "unclassified" || source.unclassifiedCount)
        .filter((l) => l.activity !== "transfer" || l.count)
        .map((l) => row(l.activity, l.label, l.inflows, l.outflows, l.net));
    const body =
      method === "direct"
        ? activityRows(direct, ["operating", "investing", "financing", "transfer", "unclassified"])
        : [
            ...(saved
              ? [
                  ...fields
                    .filter(([key]) => key !== "balance_sheet_cash")
                    .map(([key, label]) => row("operating", label, "", "", saved[key])),
                  row(
                    "operating",
                    "Net cash provided by / used in operating activities (manual inputs)",
                    "",
                    "",
                    reconciledOperating!,
                  ),
                  row(
                    "operating",
                    "Difference from direct operating cash",
                    "",
                    "",
                    operatingDifference!,
                  ),
                ]
              : [row("operating", "Indirect reconciliation not supplied", "", "", "")]),
            ...activityRows(actual, ["investing", "financing", "transfer", "unclassified"]),
          ];
    exportToCsv(
      `statement_cash_flows_${method}_${currency}_${start}_${end}`,
      ["Activity", "Line", "Inflows", "Outflows", "Net", "Currency", "Scope", "Method", "View"],
      [
        ...body,
        row("reconciliation", "Beginning cash", "", "", totals.opening),
        row("reconciliation", "Recorded account openings (not cash flows)", "", "", adjustments),
        row("reconciliation", "Ending cash", "", "", closing),
        ...(glCheck.data
          ? [
              row(
                "reconciliation",
                `GL cash check (${glCheck.data.status}): ${glCheck.data.reason}`,
                "",
                "",
                glCheck.data.difference ?? "",
              ),
            ]
          : []),
      ],
    );
  }
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label={showProjected ? "Forecast free cash flow" : "Free cash flow"}
          value={
            direct.unclassifiedCount
              ? "Pending classification"
              : money(direct.operating - direct.capex)
          }
          hint="Operating cash flow − gross PP&E purchases (includes capitalized interest). Management measure."
        />
        <Kpi
          label="Monthly net burn · actual"
          value={burn === null ? "Unavailable" : money(burn)}
          hint={`Operating + investing cash consumption ÷ ${days} elapsed days × 30.4375. Excludes financing.`}
        />
        <Kpi
          label="Cash runway · months"
          value={runway === null ? (burn === 0 ? "No net burn" : "Unavailable") : runway.toFixed(1)}
          hint={`Actual cash at ${elapsedEnd} ÷ monthly net burn. Historical-rate estimate.`}
        />
      </section>
      <Panel
        title="Statement of Cash Flows"
        subtitle={`${showProjected ? "Management forecast · actual + planned" : "Actual cash flows"} · ${currency} · ${start} to ${end}`}
        aside={
          <button className={button} onClick={exportStatement}>
            Export statement CSV
          </button>
        }
      >
        <div className="space-y-2 p-4 text-sm">
          <label className="flex items-center gap-3">
            Presentation{" "}
            <select
              className={control + " max-w-xs"}
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
            >
              <option value="direct">Direct method</option>
              <option value="indirect">Indirect reconciliation · actual</option>
            </select>
          </label>
          {!!direct.unclassifiedCount && (
            <p role="alert" className="text-amber-800">
              {direct.unclassifiedCount} unclassified transaction(s). Review before using activity
              totals or management indicators.
            </p>
          )}
          <p className="text-xs text-ink3">
            Interest paid and received and returns on investments are operating; dividends paid are
            financing. Capitalized interest is investing. Equity-method returns of investment
            require accounting review and are investing.
          </p>
        </div>
        {method === "direct" ? (
          <Table>
            <thead>
              <tr>
                <Th>Activity / cash receipts and payments</Th>
                <Th align="right">Inflows</Th>
                <Th align="right">Outflows</Th>
                <Th align="right">Net</Th>
              </tr>
            </thead>
            <tbody>
              {(["operating", "investing", "financing", "transfer", "unclassified"] as const).map(
                (activity) => (
                  <ActivityRows key={activity} activity={activity} direct={direct} money={money} />
                ),
              )}
            </tbody>
          </Table>
        ) : (
          <div className="p-4 text-sm space-y-2">
            {saved ? (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th>Reconciliation of net income to operating cash · actual</Th>
                      <Th align="right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields
                      .filter(([k]) => k !== "balance_sheet_cash")
                      .map(([key, label]) => (
                        <tr key={key}>
                          <Td>{label}</Td>
                          <Td align="right">{money(saved[key])}</Td>
                        </tr>
                      ))}
                    <tr>
                      <Td>Net cash provided by / used in operating activities</Td>
                      <Td align="right">{money(reconciledOperating!)}</Td>
                    </tr>
                  </tbody>
                </Table>
                <p>
                  Difference from direct operating cash: {money(operatingDifference!)}.{" "}
                  {operatingDifference === 0 && !actual.unclassifiedCount
                    ? "Agrees with the manually entered figures (not derived from the GL)."
                    : "Review required."}
                </p>
              </>
            ) : (
              <p>
                Enter and save the accounting reconciliation below to enable the indirect
                presentation.
              </p>
            )}
            <Table>
              <thead>
                <tr>
                  <Th>Activity / cash receipts and payments · actual</Th>
                  <Th align="right">Inflows</Th>
                  <Th align="right">Outflows</Th>
                  <Th align="right">Net</Th>
                </tr>
              </thead>
              <tbody>
                {["investing", "financing", "transfer", "unclassified"].map((activity) => (
                  <ActivityRows key={activity} activity={activity} direct={actual} money={money} />
                ))}
              </tbody>
            </Table>
          </div>
        )}
        <div className="grid gap-2 border-t border-line p-4 text-sm sm:grid-cols-2">
          <p>
            Beginning cash & cash equivalents: <strong>{money(totals.opening)}</strong>
          </p>
          <p>
            Net increase / decrease:{" "}
            <strong>
              {money(totals.periods.reduce((s, p) => s + Math.round(p.net * 100), 0) / 100)}
            </strong>
          </p>
          <p>
            Account opening balances added in period: <strong>{money(adjustments)}</strong>
          </p>
          <p>
            Ending cash & cash equivalents: <strong>{money(closing)}</strong>
          </p>
          <p className="text-xs text-ink3 sm:col-span-2">
            Beginning cash + recorded account openings + net cash change = ending cash. Account
            openings are setup balances, not operating, investing or financing flows. Scope includes
            only selected cash accounts and currency; restricted cash and FX reconciliation need
            accounting review where applicable.
          </p>
        </div>
      </Panel>
      <Panel
        title="Weekly forecast vs. actual"
        subtitle="Original plan is frozen on first planned save. Positive net variance means more cash than planned."
        aside={
          <button
            className={button}
            onClick={() =>
              exportToCsv(
                `weekly_variance_${currency}_${start}_${end}`,
                [
                  "Week of",
                  "Status",
                  "Partial week",
                  "Forecast receipts",
                  "Actual receipts",
                  "Forecast payments",
                  "Actual payments",
                  "Forecast net",
                  "Actual net",
                  "Net variance",
                  "Explanation",
                  "Currency",
                ],
                weekly.map((w) => [
                  w.label,
                  w.state,
                  w.partial ? "Yes" : "No",
                  w.forecastIn,
                  w.actualIn,
                  w.forecastOut,
                  w.actualOut,
                  w.forecastNet,
                  w.actualNet,
                  w.variance,
                  w.notes.join("; "),
                  currency,
                ]),
              )
            }
          >
            Export comparison CSV
          </button>
        }
      >
        <p className="px-4 py-3 text-xs text-ink3">
          Actuals without an original plan appear as unplanned. Existing planned entries establish
          their baseline when migration 010 runs. Future and current weeks are not final variances.
          Cancelled plans remain in the baseline. Edit a transaction to record an explanation; do
          not create a second entry when settling a forecast.
        </p>
        <Table>
          <thead>
            <tr>
              {[
                "Week of",
                "Status",
                "Forecast receipts",
                "Actual receipts",
                "Forecast payments",
                "Actual payments",
                "Forecast net",
                "Actual net",
                "Net variance",
                "Explanation",
              ].map((h) => (
                <Th key={h}>{h}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weekly.map((w) => (
              <tr key={w.label} className="border-t border-line">
                <Td>
                  {w.label}
                  {w.partial ? " (partial)" : ""}
                </Td>
                <Td>{w.state}</Td>
                {[
                  w.forecastIn,
                  w.actualIn,
                  w.forecastOut,
                  w.actualOut,
                  w.forecastNet,
                  w.actualNet,
                  w.variance,
                ].map((n, i) => (
                  <Td key={i} align="right">
                    {money(n)}
                  </Td>
                ))}
                <Td>{w.notes.join("; ") || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
      <Panel
        title="Supplemental accounting reconciliation · actual · manual inputs"
        subtitle="Required alongside the direct method. Enter accrual accounting data for exactly the selected period, accounts and currency."
      >
        <p className="p-4 text-xs text-ink3">
          Use signed adjustments, excluding noncash acquisitions and other investing / financing
          movements from working capital. COGS is not automatically a cash payment. For a
          company-wide statement, select all cash accounts and use company-wide net income.
          Forecasts are management estimates, not recognized sales or expenses.
        </p>
        {reconciliation.isPending ? (
          <p className="p-4">Loading reconciliation…</p>
        ) : reconciliation.isError ? (
          <p role="alert" className="p-4 text-red-700">
            Unable to load the accounting reconciliation.
          </p>
        ) : (
          <form key={JSON.stringify([scope, saved])} onSubmit={save} className="space-y-4 p-4">
            <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
              {fields.map(([key, label]) => (
                <label key={key} className="space-y-1 text-xs">
                  {label}
                  <input
                    className={control}
                    name={key}
                    type="number"
                    step="0.01"
                    min="-999999999999.99"
                    max="999999999999.99"
                    required
                    defaultValue={saved?.[key] ?? ""}
                  />
                </label>
              ))}
              <label className="space-y-1 text-xs sm:col-span-2">
                Sources and explanations
                <textarea
                  className={control}
                  name="explanation"
                  required
                  maxLength={2000}
                  defaultValue={saved?.explanation ?? ""}
                />
              </label>
              <button className={button}>
                {pending ? "Saving…" : "Save accounting reconciliation"}
              </button>
            </fieldset>
            {message && <p role="status">{message}</p>}
          </form>
        )}
        <div className="border-t border-line p-4 text-sm space-y-2">
          <p>
            Operating reconciliation difference:{" "}
            <strong>
              {operatingDifference === null ? "Not supplied" : money(operatingDifference)}
            </strong>
          </p>
          <p>
            Actual ending cash vs. balance sheet difference:{" "}
            <strong>{cashDifference === null ? "Not supplied" : money(cashDifference)}</strong>
          </p>
          <p>
            <strong>Manual reconciliation: </strong>
            {saved && operatingDifference === 0 && cashDifference === 0 && !actual.unclassifiedCount
              ? "both checks agree with the figures entered above. This does not prove agreement with the ledger."
              : "pending or requires review."}
          </p>
        </div>
        <div className="border-t border-line p-4 text-sm space-y-2">
          <p>
            <strong>GL-verified cash check · actual at {end}: </strong>
            {glCheck.isPending
              ? "Checking…"
              : glCheck.isError
                ? "Unable to check the general ledger."
                : glCheck.data.status === "verified"
                  ? "Verified"
                  : glCheck.data.status === "difference"
                    ? "Difference found"
                    : "Not verifiable"}
          </p>
          {glCheck.data && (
            <>
              <p className="text-xs text-ink3">{glCheck.data.reason}</p>
              {glCheck.data.glBalance !== null && (
                <p>
                  GL {glCheck.data.glAccounts.join(", ")}: {money(glCheck.data.glBalance)} · Cash
                  module: {money(glCheck.data.cashBalance!)} · Difference:{" "}
                  <strong>{money(glCheck.data.difference!)}</strong>
                </p>
              )}
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}

function ActivityRows({
  activity,
  direct,
  money,
}: {
  activity: string;
  direct: ReturnType<typeof statement>;
  money: (n: number) => string;
}) {
  const lines = direct.lines.filter((l) => l.activity === activity);
  if (activity === "unclassified" && !direct.unclassifiedCount) return null;
  // Transfers appear only when one side is outside the selected scope.
  if (activity === "transfer" && !lines.some((l) => l.count)) return null;
  return (
    <>
      <tr className="border-t border-line bg-brand/5">
        <Td colSpan={4}>
          <strong>
            {activity === "unclassified"
              ? "Unclassified — review required"
              : activity === "transfer"
                ? "Transfers with cash accounts outside this scope"
                : `Cash flows from ${activity} activities`}
          </strong>
        </Td>
      </tr>
      {lines.map((l) => (
        <tr key={l.key}>
          <Td>{l.label}</Td>
          <Td align="right">{money(l.inflows)}</Td>
          <Td align="right">{money(l.outflows)}</Td>
          <Td align="right">{money(l.net)}</Td>
        </tr>
      ))}
      <tr className="border-t border-line font-semibold">
        <Td>Net cash provided by / used in {activity} activities</Td>
        <Td />
        <Td />
        <Td align="right">{money(lines.reduce((s, l) => s + Math.round(l.net * 100), 0) / 100)}</Td>
      </tr>
    </>
  );
}
