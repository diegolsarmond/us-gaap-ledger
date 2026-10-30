import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "./ui-kit";
import { formatDate, usd } from "@/lib/format";

const colors = { inflows: "#168060", outflows: "#ce5050", balance: "#4263cc" };
const compact = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const grid = <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dce1e8" />;

export function CashForecastCharts({
  periods,
  currency,
}: {
  periods: { label: string; inflows: number; outflows: number; balance: number }[];
  currency: string;
}) {
  const money = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
  return (
    <div className="grid min-w-0 gap-4 px-3 pb-4 lg:grid-cols-2">
      <section
        aria-label={`Projected weekly closing cash in ${currency}`}
        className="min-w-0 rounded-lg border border-line/70 bg-white/50 p-3"
      >
        <h2 className="mb-3 text-xs font-semibold">Projected Closing Cash · {currency}</h2>
        <div className="h-64 min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart
              accessibilityLayer
              data={periods}
              margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
            >
              {grid}
              <XAxis
                dataKey="label"
                tickFormatter={(v: string) => formatDate(v).replace(/, \d{4}$/, "")}
                tick={{ fontSize: 10 }}
                minTickGap={20}
              />
              <YAxis tickFormatter={compact} tick={{ fontSize: 10 }} width={56} />
              <Tooltip
                formatter={(value: number) => money(value)}
                labelFormatter={(label) => `Week of ${formatDate(String(label))}`}
              />
              <ReferenceLine y={0} stroke="#8893a4" />
              <Line
                type="linear"
                dataKey="balance"
                name="Closing Cash"
                stroke={colors.balance}
                strokeWidth={3}
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section
        aria-label={`Weekly cash inflows and outflows in ${currency}`}
        className="min-w-0 rounded-lg border border-line/70 bg-white/50 p-3"
      >
        <h2 className="mb-3 text-xs font-semibold">Weekly Inflows & Outflows · {currency}</h2>
        <div className="h-64 min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              accessibilityLayer
              data={periods}
              margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
            >
              {grid}
              <XAxis
                dataKey="label"
                tickFormatter={(v: string) => formatDate(v).replace(/, \d{4}$/, "")}
                tick={{ fontSize: 10 }}
                minTickGap={20}
              />
              <YAxis tickFormatter={compact} tick={{ fontSize: 10 }} width={56} />
              <Tooltip
                formatter={(value: number) => money(value)}
                labelFormatter={(label) => `Week of ${formatDate(String(label))}`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="inflows"
                name="Inflows"
                fill={colors.inflows}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="outflows"
                name="Outflows"
                fill={colors.outflows}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

export function IncomeOverviewChart({
  periodLabel,
  revenue,
  cogs,
  opex,
  netIncome,
}: {
  periodLabel: string;
  revenue: number;
  cogs: number;
  opex: number;
  netIncome: number;
}) {
  const data = [
    { name: "Revenue", value: revenue },
    { name: "COGS", value: cogs },
    { name: "Operating Expenses", value: opex },
    { name: "Net Income", value: netIncome },
  ];
  return (
    <Panel title="Income Overview" subtitle={`${periodLabel} · USD · Accrual basis`}>
      {data.every((item) => item.value === 0) ? (
        <p className="p-4 text-sm text-ink3">
          No income or expense balances recorded for this company.
        </p>
      ) : (
        <div
          className="h-72 min-w-0 p-3"
          role="region"
          aria-label="Revenue, cost of goods sold, operating expenses and net income in USD"
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              accessibilityLayer
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 24, bottom: 8, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#dce1e8" />
              <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => usd(value)} />
              <ReferenceLine x={0} stroke="#8893a4" />
              <Bar
                dataKey="value"
                name="Amount (USD)"
                fill={colors.balance}
                radius={[0, 3, 3, 0]}
                maxBarSize={30}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
