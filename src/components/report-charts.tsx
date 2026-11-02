import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  PieChart as PieIcon,
  LineChart as LineIcon,
  Table as TableIcon,
  TrendingUp,
  Layers,
  Sparkles,
  LayoutGrid,
  Hexagon,
  Gauge,
  SlidersHorizontal,
} from "lucide-react";
import type { Report, Row } from "@/lib/report-engine";
import { usd } from "@/lib/format";

const PALETTE = [
  "#2563eb", // blue-600
  "#059669", // emerald-600
  "#d97706", // amber-600
  "#7c3aed", // violet-600
  "#dc2626", // red-600
  "#0891b2", // cyan-600
  "#ea580c", // orange-600
  "#4f46e5", // indigo-600
  "#0284c7", // sky-600
  "#16a34a", // green-600
  "#9333ea", // purple-600
  "#e11d48", // rose-600
];

const compactNumber = (val: number) => {
  if (Math.abs(val) >= 1_000_000) {
    return (val / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (Math.abs(val) >= 1_000) {
    return (val / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return Number.isInteger(val) ? val.toString() : val.toFixed(2);
};

const formatCurrencyOrNumber = (val: number, isCurrency = true) => {
  if (isCurrency) {
    return usd(val);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(val);
};

const truncateText = (text: string, max = 20) => {
  if (!text) return "—";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
};

// ============================================================================
// Quick Report Templates with Charts
// ============================================================================

export function ReportTemplatesGrid({
  onSelectPreset,
}: {
  onSelectPreset: (preset: Report) => void;
}) {
  return (
    <section className="rounded-xl border border-line/70 bg-white/70 p-4 shadow-2xs backdrop-blur-xs">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-brand" />
          <h3 className="text-xs font-semibold text-ink uppercase tracking-wider">
            Report Templates with Visual Charts
          </h3>
        </div>
        <span className="text-[11px] text-ink3">
          Select a template to immediately open the report with interactive charts
        </span>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <button
          onClick={() =>
            onSelectPreset({
              name: "Cash Flow by Category",
              source: "cashTransactions",
              joins: [],
              columns: [],
              filters: [],
              groups: ["cashTransactions.category"],
              metric: "cashTransactions.amount",
              operation: "sum",
              summary: true,
              sort: "resultado",
              descending: true,
            })
          }
          className="flex flex-col items-start rounded-lg border border-line/80 bg-white p-3 text-left transition-all hover:border-brand/60 hover:bg-brand/5 shadow-2xs group cursor-pointer"
        >
          <span className="text-xs font-semibold text-ink group-hover:text-brand flex items-center gap-1.5">
            <BarChart3 size={13} /> Cash Flow by Category
          </span>
          <span className="text-[11px] text-ink3 mt-1">
            Total transaction amounts grouped by cash flow activity category.
          </span>
        </button>

        <button
          onClick={() =>
            onSelectPreset({
              name: "Revenue by Customer",
              source: "invoices",
              joins: [],
              columns: [],
              filters: [],
              groups: ["invoices.customerName"],
              metric: "invoices.total",
              operation: "sum",
              summary: true,
              sort: "resultado",
              descending: true,
            })
          }
          className="flex flex-col items-start rounded-lg border border-line/80 bg-white p-3 text-left transition-all hover:border-brand/60 hover:bg-brand/5 shadow-2xs group cursor-pointer"
        >
          <span className="text-xs font-semibold text-ink group-hover:text-brand flex items-center gap-1.5">
            <TrendingUp size={13} /> Revenue by Customer
          </span>
          <span className="text-[11px] text-ink3 mt-1">
            Total sales and invoice revenue consolidated by customer.
          </span>
        </button>

        <button
          onClick={() =>
            onSelectPreset({
              name: "Payables by Vendor",
              source: "bills",
              joins: [],
              columns: [],
              filters: [],
              groups: ["bills.vendorName"],
              metric: "bills.usdAmount",
              operation: "sum",
              summary: true,
              sort: "resultado",
              descending: true,
            })
          }
          className="flex flex-col items-start rounded-lg border border-line/80 bg-white p-3 text-left transition-all hover:border-brand/60 hover:bg-brand/5 shadow-2xs group cursor-pointer"
        >
          <span className="text-xs font-semibold text-ink group-hover:text-brand flex items-center gap-1.5">
            <Layers size={13} /> Payables by Vendor
          </span>
          <span className="text-[11px] text-ink3 mt-1">
            Vendor bills and operational payables consolidated by supplier.
          </span>
        </button>

        <button
          onClick={() =>
            onSelectPreset({
              name: "Chart of Accounts by Classification",
              source: "accounts",
              joins: [],
              columns: [],
              filters: [],
              groups: ["accounts.type"],
              metric: "",
              operation: "count",
              summary: true,
              sort: "resultado",
              descending: true,
            })
          }
          className="flex flex-col items-start rounded-lg border border-line/80 bg-white p-3 text-left transition-all hover:border-brand/60 hover:bg-brand/5 shadow-2xs group cursor-pointer"
        >
          <span className="text-xs font-semibold text-ink group-hover:text-brand flex items-center gap-1.5">
            <PieIcon size={13} /> Accounts by US GAAP Class
          </span>
          <span className="text-[11px] text-ink3 mt-1">
            Count of active general ledger accounts classified under US GAAP.
          </span>
        </button>
      </div>
    </section>
  );
}

// ============================================================================
// Dynamic Report Chart Visualizer
// ============================================================================

export type DynamicChartType =
  | "tower" // Tower / Vertical Columns
  | "pie" // Pie / Donut
  | "line" // Line Trend
  | "area" // Gradient Area
  | "hbar" // Horizontal Bars
  | "composed" // Composed: Column + Average Line
  | "radar" // Polar Radar
  | "radial"; // Radial / Gauge

export function ReportDynamicChart({
  report,
  data,
  labelFn,
  viewLayout,
  onViewLayoutChange,
}: {
  report: Report;
  data: { rows: Row[]; columns: string[]; matched: number; expanded: boolean };
  labelFn: (field: string) => string;
  viewLayout: "both" | "chart" | "table";
  onViewLayoutChange: (layout: "both" | "chart" | "table") => void;
}) {
  const [chartType, setChartType] = useState<DynamicChartType>("tower");
  const [limitTop, setLimitTop] = useState<number>(15);
  const [pieMode, setPieMode] = useState<"donut" | "full">("donut");
  const [curveType, setCurveType] = useState<"monotone" | "linear">("monotone");

  // Identify numeric and categorical columns
  const { numericCols, stringCols } = useMemo(() => {
    if (!data.rows.length) return { numericCols: [], stringCols: [] };

    const sample = data.rows[0] ?? {};
    const nums: string[] = [];
    const strs: string[] = [];

    for (const col of data.columns) {
      const val = sample[col];
      if (typeof val === "number" || col === "resultado") {
        nums.push(col);
      } else {
        strs.push(col);
      }
    }

    for (const col of data.columns) {
      if (!nums.includes(col) && !strs.includes(col)) {
        const found = data.rows.slice(0, 10).find((r) => r[col] != null);
        if (found && typeof found[col] === "number") {
          nums.push(col);
        } else {
          strs.push(col);
        }
      }
    }

    return { numericCols: nums, stringCols: strs };
  }, [data]);

  // Selected column for X Axis (Category) and Y Axis (Metric)
  const defaultCategoryCol = useMemo(() => {
    if (report.summary && report.groups.length) return report.groups[0];
    if (stringCols.length) return stringCols[0];
    return data.columns[0] ?? "";
  }, [report, stringCols, data.columns]);

  const defaultMetricCol = useMemo(() => {
    if (report.summary && data.columns.includes("resultado")) return "resultado";
    if (numericCols.length) return numericCols[0];
    return "";
  }, [report, numericCols, data.columns]);

  const [categoryCol, setCategoryCol] = useState<string>("");
  const [metricCol, setMetricCol] = useState<string>("");

  const effectiveCategoryCol = categoryCol && data.columns.includes(categoryCol) ? categoryCol : defaultCategoryCol;
  const effectiveMetricCol = metricCol && data.columns.includes(metricCol) ? metricCol : defaultMetricCol;

  // Prepared chart data
  const chartData = useMemo(() => {
    if (!data.rows.length || !effectiveCategoryCol) return [];

    let rowsToUse = data.rows;

    if (effectiveMetricCol) {
      const mapped = rowsToUse.map((r, i) => {
        const rawCategory = r[effectiveCategoryCol];
        const name =
          rawCategory == null || rawCategory === ""
            ? `(Empty #${i + 1})`
            : String(rawCategory);
        const rawVal = r[effectiveMetricCol];
        const value = typeof rawVal === "number" ? rawVal : Number(rawVal) || 0;
        return { name, value, item: r };
      });

      if (limitTop > 0 && mapped.length > limitTop) {
        return mapped.slice(0, limitTop);
      }
      return mapped;
    }

    const countMap = new Map<string, number>();
    for (const r of rowsToUse) {
      const cat = String(r[effectiveCategoryCol] ?? "Empty");
      countMap.set(cat, (countMap.get(cat) ?? 0) + 1);
    }

    const mapped = Array.from(countMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    if (limitTop > 0 && mapped.length > limitTop) {
      return mapped.slice(0, limitTop);
    }
    return mapped;
  }, [data.rows, effectiveCategoryCol, effectiveMetricCol, limitTop]);

  // Summary statistics for metric
  const stats = useMemo(() => {
    if (!chartData.length) return null;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;

    for (const d of chartData) {
      const v = d.value;
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }

    const avg = sum / chartData.length;
    return { sum, avg, min, max, count: chartData.length };
  }, [chartData]);

  // Data for composed chart
  const composedData = useMemo(() => {
    const avg = stats?.avg ? Number(stats.avg.toFixed(2)) : 0;
    return chartData.map((d) => ({
      ...d,
      media: avg,
    }));
  }, [chartData, stats]);

  // Data for radial bar chart
  const radialData = useMemo(() => {
    return chartData.slice(0, 8).map((d, idx) => ({
      ...d,
      fill: PALETTE[idx % PALETTE.length],
    }));
  }, [chartData]);

  const isCurrencyMetric = useMemo(() => {
    const colName = (effectiveMetricCol ?? "").toLowerCase();
    return (
      colName.includes("amount") ||
      colName.includes("total") ||
      colName.includes("usd") ||
      colName.includes("balance") ||
      colName.includes("inflow") ||
      colName.includes("outflow") ||
      (report.summary && report.operation === "sum" && !colName.includes("qty"))
    );
  }, [effectiveMetricCol, report]);

  if (!data.columns.length) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Visualizer Top Bar & Controls */}
      <div className="flex flex-col gap-3 rounded-lg border border-line/70 bg-white/70 p-3 shadow-2xs">
        {/* Row 1: View mode and chart types */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* View mode toggle */}
          <div className="flex items-center rounded-md border border-line bg-white p-0.5 text-xs shadow-2xs">
            <button
              title="Show chart and table"
              onClick={() => onViewLayoutChange("both")}
              className={`flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                viewLayout === "both" ? "bg-brand text-white shadow-2xs" : "text-ink2 hover:text-ink"
              }`}
            >
              <LayoutGrid size={13} />
              <span>Both</span>
            </button>
            <button
              title="Show chart only"
              onClick={() => onViewLayoutChange("chart")}
              className={`flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                viewLayout === "chart" ? "bg-brand text-white shadow-2xs" : "text-ink2 hover:text-ink"
              }`}
            >
              <BarChart3 size={13} />
              <span>Chart</span>
            </button>
            <button
              title="Show table only"
              onClick={() => onViewLayoutChange("table")}
              className={`flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                viewLayout === "table" ? "bg-brand text-white shadow-2xs" : "text-ink2 hover:text-ink"
              }`}
            >
              <TableIcon size={13} />
              <span>Table</span>
            </button>
          </div>

          {/* Chart Type Selector Pills: Tower, Pie, Line, Area, Bar, Composed, Radar, Radial */}
          {viewLayout !== "table" && (
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-white p-0.5 text-xs shadow-2xs">
              <button
                title="Tower / Vertical Column Chart"
                onClick={() => setChartType("tower")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  chartType === "tower" ? "bg-brand text-white shadow-2xs" : "text-ink2 hover:text-ink hover:bg-slate-50"
                }`}
              >
                <BarChart3 size={13} />
                <span>Tower</span>
              </button>
              <button
                title="Pie / Donut Chart"
                onClick={() => setChartType("pie")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  chartType === "pie" ? "bg-brand text-white shadow-2xs" : "text-ink2 hover:text-ink hover:bg-slate-50"
                }`}
              >
                <PieIcon size={13} />
                <span>Pie</span>
              </button>
              <button
                title="Line Trend Chart"
                onClick={() => setChartType("line")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  chartType === "line" ? "bg-brand text-white shadow-2xs" : "text-ink2 hover:text-ink hover:bg-slate-50"
                }`}
              >
                <LineIcon size={13} />
                <span>Lines</span>
              </button>
              <button
                title="Gradient Area Chart"
                onClick={() => setChartType("area")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  chartType === "area" ? "bg-brand text-white shadow-2xs" : "text-ink2 hover:text-ink hover:bg-slate-50"
                }`}
              >
                <TrendingUp size={13} />
                <span>Area</span>
              </button>
              <button
                title="Horizontal Bar Chart"
                onClick={() => setChartType("hbar")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  chartType === "hbar" ? "bg-brand text-white shadow-2xs" : "text-ink2 hover:text-ink hover:bg-slate-50"
                }`}
              >
                <BarChart3 size={13} className="rotate-90" />
                <span>Bars</span>
              </button>
              <button
                title="Composed: Columns + Reference Average Line"
                onClick={() => setChartType("composed")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  chartType === "composed" ? "bg-brand text-white shadow-2xs" : "text-ink2 hover:text-ink hover:bg-slate-50"
                }`}
              >
                <SlidersHorizontal size={13} />
                <span>Composed</span>
              </button>
              <button
                title="Polar Radar Chart"
                onClick={() => setChartType("radar")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  chartType === "radar" ? "bg-brand text-white shadow-2xs" : "text-ink2 hover:text-ink hover:bg-slate-50"
                }`}
              >
                <Hexagon size={13} />
                <span>Radar</span>
              </button>
              <button
                title="Radial Gauge Chart"
                onClick={() => setChartType("radial")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                  chartType === "radial" ? "bg-brand text-white shadow-2xs" : "text-ink2 hover:text-ink hover:bg-slate-50"
                }`}
              >
                <Gauge size={13} />
                <span>Radial</span>
              </button>
            </div>
          )}
        </div>

        {/* Row 2: Sub-options (Donut vs Full, Curve type, Axis selectors, Limits) */}
        {viewLayout !== "table" && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/50 pt-2 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {/* Axis category selector */}
              <label className="flex items-center gap-1.5 text-ink3">
                <span className="font-medium text-ink">X-Axis (Dimension):</span>
                <select
                  className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-hidden"
                  value={effectiveCategoryCol}
                  onChange={(e) => setCategoryCol(e.target.value)}
                >
                  {data.columns.map((c) => (
                    <option key={c} value={c}>
                      {labelFn(c)}
                    </option>
                  ))}
                </select>
              </label>

              {/* Metric selector */}
              <label className="flex items-center gap-1.5 text-ink3">
                <span className="font-medium text-ink">Y-Metric (Value):</span>
                <select
                  className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-hidden"
                  value={effectiveMetricCol}
                  onChange={(e) => setMetricCol(e.target.value)}
                >
                  <option value="">Frequency / Row Count</option>
                  {numericCols.map((c) => (
                    <option key={c} value={c}>
                      {labelFn(c)}
                    </option>
                  ))}
                </select>
              </label>

              {/* Chart-specific fine-tuning controls */}
              {chartType === "pie" && (
                <div className="flex items-center rounded-md border border-line bg-white p-0.5 text-xs">
                  <button
                    onClick={() => setPieMode("donut")}
                    className={`rounded px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                      pieMode === "donut" ? "bg-slate-800 text-white" : "text-ink2 hover:text-ink"
                    }`}
                  >
                    Donut
                  </button>
                  <button
                    onClick={() => setPieMode("full")}
                    className={`rounded px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                      pieMode === "full" ? "bg-slate-800 text-white" : "text-ink2 hover:text-ink"
                    }`}
                  >
                    Full Pie
                  </button>
                </div>
              )}

              {(chartType === "line" || chartType === "area") && (
                <div className="flex items-center rounded-md border border-line bg-white p-0.5 text-xs">
                  <button
                    onClick={() => setCurveType("monotone")}
                    className={`rounded px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                      curveType === "monotone" ? "bg-slate-800 text-white" : "text-ink2 hover:text-ink"
                    }`}
                  >
                    Smooth
                  </button>
                  <button
                    onClick={() => setCurveType("linear")}
                    className={`rounded px-2 py-0.5 font-medium transition-colors cursor-pointer ${
                      curveType === "linear" ? "bg-slate-800 text-white" : "text-ink2 hover:text-ink"
                    }`}
                  >
                    Linear
                  </button>
                </div>
              )}
            </div>

            {/* Limit items */}
            {data.rows.length > 15 && (
              <label className="flex items-center gap-1.5 text-ink3">
                <span className="font-medium text-ink">Show:</span>
                <select
                  className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-hidden"
                  value={limitTop}
                  onChange={(e) => setLimitTop(Number(e.target.value))}
                >
                  <option value={10}>Top 10</option>
                  <option value={15}>Top 15</option>
                  <option value={25}>Top 25</option>
                  <option value={0}>All ({data.rows.length})</option>
                </select>
              </label>
            )}
          </div>
        )}
      </div>

      {/* Dynamic Chart Box */}
      {viewLayout !== "table" && (
        <div className="rounded-xl border border-line/70 bg-white/90 p-4 shadow-2xs backdrop-blur-xs">
          {/* Quick Metrics Bar */}
          {stats && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5 border-b border-line/50 pb-3 text-xs">
              <div>
                <span className="text-[10px] text-ink3 uppercase tracking-wider">Total</span>
                <p className="font-semibold text-ink tabular-nums">
                  {formatCurrencyOrNumber(stats.sum, isCurrencyMetric)}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-ink3 uppercase tracking-wider">Average</span>
                <p className="font-semibold text-ink tabular-nums">
                  {formatCurrencyOrNumber(stats.avg, isCurrencyMetric)}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-ink3 uppercase tracking-wider">Highest</span>
                <p className="font-semibold text-emerald-700 tabular-nums">
                  {formatCurrencyOrNumber(stats.max, isCurrencyMetric)}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-ink3 uppercase tracking-wider">Lowest</span>
                <p className="font-semibold text-ink2 tabular-nums">
                  {formatCurrencyOrNumber(stats.min, isCurrencyMetric)}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-[10px] text-ink3 uppercase tracking-wider">Data Points</span>
                <p className="font-semibold text-ink tabular-nums">
                  {stats.count} {stats.count === 1 ? "record" : "records"}
                </p>
              </div>
            </div>
          )}

          {/* Render Active Chart Type */}
          <div className="h-72 w-full min-w-0">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-ink3">
                No numeric data available to render charts for this report.
              </div>
            ) : chartType === "tower" ? (
              /* Tower / Column Chart */
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  accessibilityLayer
                  data={chartData}
                  margin={{ top: 12, right: 16, bottom: 20, left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tickFormatter={(v) => truncateText(String(v), 14)}
                    tick={{ fontSize: 10 }}
                    angle={chartData.length > 8 ? -25 : 0}
                    textAnchor={chartData.length > 8 ? "end" : "middle"}
                    height={40}
                  />
                  <YAxis
                    tickFormatter={(v) => compactNumber(Number(v))}
                    tick={{ fontSize: 10 }}
                    width={52}
                  />
                  <Tooltip
                    formatter={(val: number) => [
                      formatCurrencyOrNumber(val, isCurrencyMetric),
                      effectiveMetricCol ? labelFn(effectiveMetricCol) : "Count",
                    ]}
                    labelFormatter={(lbl) => String(lbl)}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                  />
                  <ReferenceLine y={0} stroke="#94a3b8" />
                  <Bar
                    dataKey="value"
                    name={effectiveMetricCol ? labelFn(effectiveMetricCol) : "Count"}
                    fill="#2563eb"
                    radius={[5, 5, 0, 0]}
                    isAnimationActive={false}
                  >
                    {chartData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PALETTE[index % PALETTE.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : chartType === "pie" ? (
              /* Pie / Donut Chart */
              <ResponsiveContainer width="100%" height="100%">
                <PieChart accessibilityLayer>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={pieMode === "donut" ? 50 : 0}
                    outerRadius={85}
                    paddingAngle={pieMode === "donut" ? 3 : 1}
                    label={({ name, percent }) =>
                      `${truncateText(name, 12)} (${(percent * 100).toFixed(0)}%)`
                    }
                    labelLine={false}
                  >
                    {chartData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PALETTE[index % PALETTE.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number) => [
                      formatCurrencyOrNumber(val, isCurrencyMetric),
                      effectiveMetricCol ? labelFn(effectiveMetricCol) : "Count",
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : chartType === "line" ? (
              /* Line Trend Chart */
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  accessibilityLayer
                  data={chartData}
                  margin={{ top: 12, right: 16, bottom: 20, left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tickFormatter={(v) => truncateText(String(v), 14)}
                    tick={{ fontSize: 10 }}
                    angle={chartData.length > 8 ? -25 : 0}
                    textAnchor={chartData.length > 8 ? "end" : "middle"}
                    height={40}
                  />
                  <YAxis
                    tickFormatter={(v) => compactNumber(Number(v))}
                    tick={{ fontSize: 10 }}
                    width={52}
                  />
                  <Tooltip
                    formatter={(val: number) => [
                      formatCurrencyOrNumber(val, isCurrencyMetric),
                      effectiveMetricCol ? labelFn(effectiveMetricCol) : "Count",
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  />
                  <ReferenceLine y={0} stroke="#94a3b8" />
                  <Line
                    type={curveType}
                    dataKey="value"
                    name={effectiveMetricCol ? labelFn(effectiveMetricCol) : "Count"}
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#2563eb" }}
                    activeDot={{ r: 6 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : chartType === "area" ? (
              /* Gradient Area Chart */
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  accessibilityLayer
                  data={chartData}
                  margin={{ top: 12, right: 16, bottom: 20, left: 10 }}
                >
                  <defs>
                    <linearGradient id="colorValueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tickFormatter={(v) => truncateText(String(v), 14)}
                    tick={{ fontSize: 10 }}
                    angle={chartData.length > 8 ? -25 : 0}
                    textAnchor={chartData.length > 8 ? "end" : "middle"}
                    height={40}
                  />
                  <YAxis
                    tickFormatter={(v) => compactNumber(Number(v))}
                    tick={{ fontSize: 10 }}
                    width={52}
                  />
                  <Tooltip
                    formatter={(val: number) => [
                      formatCurrencyOrNumber(val, isCurrencyMetric),
                      effectiveMetricCol ? labelFn(effectiveMetricCol) : "Count",
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  />
                  <ReferenceLine y={0} stroke="#94a3b8" />
                  <Area
                    type={curveType}
                    dataKey="value"
                    name={effectiveMetricCol ? labelFn(effectiveMetricCol) : "Count"}
                    stroke="#2563eb"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorValueGrad)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : chartType === "hbar" ? (
              /* Horizontal Bar Chart */
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  accessibilityLayer
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 8, right: 24, bottom: 8, left: 30 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => compactNumber(Number(v))}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickFormatter={(name) => truncateText(String(name), 16)}
                    width={110}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(val: number) => [
                      formatCurrencyOrNumber(val, isCurrencyMetric),
                      effectiveMetricCol ? labelFn(effectiveMetricCol) : "Count",
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  />
                  <Bar
                    dataKey="value"
                    name={effectiveMetricCol ? labelFn(effectiveMetricCol) : "Count"}
                    fill="#2563eb"
                    radius={[0, 4, 4, 0]}
                    isAnimationActive={false}
                  >
                    {chartData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PALETTE[index % PALETTE.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : chartType === "composed" ? (
              /* Composed: Column + Average Line */
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  accessibilityLayer
                  data={composedData}
                  margin={{ top: 12, right: 16, bottom: 20, left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tickFormatter={(v) => truncateText(String(v), 14)}
                    tick={{ fontSize: 10 }}
                    angle={chartData.length > 8 ? -25 : 0}
                    textAnchor={chartData.length > 8 ? "end" : "middle"}
                    height={40}
                  />
                  <YAxis
                    tickFormatter={(v) => compactNumber(Number(v))}
                    tick={{ fontSize: 10 }}
                    width={52}
                  />
                  <Tooltip
                    formatter={(val: number, name: string) => [
                      formatCurrencyOrNumber(val, isCurrencyMetric),
                      name === "media" ? "Average Benchmark" : (effectiveMetricCol ? labelFn(effectiveMetricCol) : "Value"),
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="value"
                    name={effectiveMetricCol ? labelFn(effectiveMetricCol) : "Value (Tower)"}
                    fill="#2563eb"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  >
                    {composedData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PALETTE[index % PALETTE.length]}
                      />
                    ))}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="media"
                    name="Reference Average"
                    stroke="#dc2626"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : chartType === "radar" ? (
              /* Polar Radar Chart */
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  accessibilityLayer
                  cx="50%"
                  cy="50%"
                  outerRadius="75%"
                  data={chartData.slice(0, 10)}
                >
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis
                    dataKey="name"
                    tickFormatter={(v) => truncateText(String(v), 12)}
                    tick={{ fontSize: 10, fill: "#475569" }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    tickFormatter={(v) => compactNumber(Number(v))}
                    tick={{ fontSize: 9 }}
                  />
                  <Tooltip
                    formatter={(val: number) => [
                      formatCurrencyOrNumber(val, isCurrencyMetric),
                      effectiveMetricCol ? labelFn(effectiveMetricCol) : "Count",
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  />
                  <Radar
                    name={effectiveMetricCol ? labelFn(effectiveMetricCol) : "Distribution"}
                    dataKey="value"
                    stroke="#2563eb"
                    fill="#3b82f6"
                    fillOpacity={0.45}
                    isAnimationActive={false}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              /* Radial / Gauge Chart */
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  accessibilityLayer
                  cx="50%"
                  cy="50%"
                  innerRadius="20%"
                  outerRadius="90%"
                  barSize={12}
                  data={radialData}
                >
                  <RadialBar
                    background={{ fill: "#f1f5f9" }}
                    dataKey="value"
                    label={{
                      position: "insideStart",
                      fill: "#fff",
                      fontSize: 10,
                      formatter: (v: number) => compactNumber(Number(v)),
                    }}
                    isAnimationActive={false}
                  />
                  <Tooltip
                    formatter={(val: number) => [
                      formatCurrencyOrNumber(val, isCurrencyMetric),
                      effectiveMetricCol ? labelFn(effectiveMetricCol) : "Count",
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  />
                  <Legend
                    iconSize={10}
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
