import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "./ui-kit";
import { formatDate, usd } from "@/lib/format";

const colors = { inflows: "#168060", outflows: "#ce5050", balance: "#4263cc" };
const PALETTE = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#ea580c",
  "#4f46e5",
  "#16a34a",
  "#db2777",
];
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

export function ChartOfAccountsDistributionChart({
  accounts,
}: {
  accounts: { type: string }[];
}) {
  const counts: Record<string, number> = {};
  for (const a of accounts) {
    const t = a.type || "Other";
    counts[t] = (counts[t] ?? 0) + 1;
  }
  const data = Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const total = accounts.length;

  return (
    <Panel
      title="Chart of Accounts Composition"
      subtitle={`${total} active general ledger accounts classified under US GAAP`}
    >
      {!data.length ? (
        <p className="p-4 text-sm text-ink3">No accounts registered.</p>
      ) : (
        <div className="grid gap-3 p-3 sm:grid-cols-2 items-center">
          <div className="h-60 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart accessibilityLayer>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={3}
                  label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {data.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: number) => [val, "Accounts"]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-2 text-xs">
            {data.map((d, idx) => (
              <div
                key={d.name}
                className="flex items-center justify-between rounded border border-line/50 bg-white/60 p-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
                  />
                  <span className="font-medium text-ink">{d.name}</span>
                </div>
                <span className="font-mono text-ink2">
                  {d.value} ({total > 0 ? ((d.value / total) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

export function OperationsVolumeChart({
  revenue,
  payables,
  cashInflows,
  cashOutflows,
}: {
  revenue: number;
  payables: number;
  cashInflows: number;
  cashOutflows: number;
}) {
  const data = [
    { name: "Invoiced Revenue", value: revenue, fill: "#2563eb" },
    { name: "Vendor Payables", value: payables, fill: "#dc2626" },
    { name: "Cash Inflows", value: cashInflows, fill: "#059669" },
    { name: "Cash Outflows", value: cashOutflows, fill: "#d97706" },
  ];

  return (
    <Panel
      title="Operational & Cash Volumes"
      subtitle="Period receivables, payables, and realized cash movements"
    >
      <div className="h-60 w-full min-w-0 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 16, bottom: 8, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dce1e8" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={compact} tick={{ fontSize: 10 }} width={50} />
            <Tooltip formatter={(value: number) => [usd(value), "Volume"]} />
            <Bar dataKey="value" name="Volume (USD)" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
