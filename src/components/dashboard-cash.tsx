import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCompanies } from "./company-context";
import { Kpi, Panel, Table, Th, Td } from "./ui-kit";
import { loadCashData } from "@/lib/cash-flow";
import { summarize, overduePlanned } from "@/lib/cash-flow-model";
import { CashForecastCharts } from "./dashboard-charts";
import { formatDate } from "@/lib/format";

export function DashboardCash({ start, end }: { start: string; end: string }) {
  const { activeCompany } = useCompanies();
  const [selectedCurrency, setCurrency] = useState("USD");
  const [today] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const query = useQuery({
    queryKey: ["cash-flow", activeCompany!.id],
    queryFn: () => loadCashData({ data: { companyId: activeCompany!.id } }),
  });
  if (query.isPending) return <p role="status">Loading cash overview…</p>;
  if (query.isError)
    return (
      <div role="alert">
        Unable to load cash overview.{" "}
        <button className="text-brand underline" onClick={() => void query.refetch()}>
          Try again
        </button>
      </div>
    );
  const data = query.data!;
  const currencies = [...new Set(data.accounts.map((a) => a.currency))];
  const currency = currencies.includes(selectedCurrency as (typeof currencies)[number])
    ? selectedCurrency
    : (currencies[0] ?? "USD");
  const accounts = data.accounts.filter((a) => a.currency === currency);
  const actual =
    summarize(accounts, data.transactions, end, end, "daily", false).periods.at(-1)?.balance ?? 0;
  const forecast = summarize(accounts, data.transactions, start, end, "weekly", true, today);
  const projected = forecast.periods.at(-1)?.balance ?? actual;
  const overdue = overduePlanned(accounts, data.transactions, today);
  const money = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
  return (
    <Panel
      title="Cash Overview"
      subtitle={`${formatDate(start)} – ${formatDate(end)} · Actual closing balance and forecast · currencies shown separately`}
      aside={
        <>
          <label className="text-xs">
            Currency{" "}
            <select
              aria-label="Dashboard cash currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="rounded border border-line bg-white p-1"
            >
              {(currencies.length ? currencies : ["USD"]).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <Link to="/cash-flow" className="text-xs font-medium text-brand hover:underline">
            Manage Cash Flow →
          </Link>
        </>
      }
    >
      {!accounts.length ? (
        <p className="p-4 text-sm text-ink3">
          Register a cash account in Cash Flow to start monitoring balances and forecasts.
        </p>
      ) : (
        <>
          <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Actual Cash Balance"
              value={money(actual)}
              hint={`${accounts.length} cash accounts · ${currency}`}
              tone={actual >= 0 ? "up" : "down"}
            />
            <Kpi
              label="Period Inflows"
              value={money(forecast.periods.reduce((s, p) => s + p.inflows, 0))}
              hint="Selected period · actuals and eligible plans"
            />
            <Kpi
              label="Period Outflows"
              value={money(forecast.periods.reduce((s, p) => s + p.outflows, 0))}
              hint="Includes actuals dated in the forecast"
            />
            <Kpi
              label="Projected Closing Cash"
              value={money(projected)}
              hint={`${formatDate(end)} · ${overdue.length} overdue plans excluded`}
              tone={projected >= 0 ? "up" : "down"}
            />
          </div>
          <CashForecastCharts periods={forecast.periods} currency={currency} />
          <Table>
            <thead>
              <tr>
                <Th>Forecast Week</Th>
                <Th align="right">Inflows</Th>
                <Th align="right">Outflows</Th>
                <Th align="right">Closing Cash</Th>
              </tr>
            </thead>
            <tbody>
              {forecast.periods.map((p) => (
                <tr key={p.label} className="border-t border-line/50">
                  <Td>{formatDate(p.label)}</Td>
                  <Td align="right">{money(p.inflows)}</Td>
                  <Td align="right">{money(p.outflows)}</Td>
                  <Td align="right" className={p.balance < 0 ? "text-down" : "text-ink"}>
                    {money(p.balance)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {overdue.length > 0 && (
            <p role="status" className="p-3 text-xs text-down">
              {overdue.length} overdue planned transactions require settlement or rescheduling in
              Cash Flow.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
