import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
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
import {
  BarChart3,
  PieChart as PieIcon,
  LineChart as LineIcon,
  Table as TableIcon,
  TrendingUp,
  DollarSign,
  Layers,
  ArrowUpDown,
  Filter,
  Sparkles,
  LayoutGrid,
} from "lucide-react";
import type { Report, Row, Source } from "@/lib/report-engine";
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

const truncateText = (text: string, max = 22) => {
  if (!text) return "—";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
};

// ============================================================================
// 1. Report Overview Charts (Shown on main reports page in mode === "list")
// ============================================================================

export function ReportOverviewCharts({
  sources,
  onSelectPreset,
}: {
  sources: Source[];
  onSelectPreset: (preset: Report) => void;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "coa" | "cash" | "operations">("overview");

  // Invoices metrics
  const invoicesSource = sources.find((s) => s.id === "invoices");
  const invoiceRows = invoicesSource?.rows ?? [];
  const invoiceStats = useMemo(() => {
    let total = 0;
    let openTotal = 0;
    let paidTotal = 0;
    let openCount = 0;
    let paidCount = 0;
    let overdueCount = 0;

    for (const r of invoiceRows) {
      const rawTotal = r["total"];
      const val = typeof rawTotal === "number" ? rawTotal : Number(rawTotal) || 0;
      total += val;
      const status = String(r["status"] ?? "").toLowerCase();
      if (status === "paid") {
        paidTotal += val;
        paidCount++;
      } else {
        openTotal += val;
        openCount++;
        if (status === "overdue") overdueCount++;
      }
    }
    return { total, openTotal, paidTotal, count: invoiceRows.length, openCount, paidCount, overdueCount };
  }, [invoiceRows]);

  // Bills metrics
  const billsSource = sources.find((s) => s.id === "bills");
  const billRows = billsSource?.rows ?? [];
  const billStats = useMemo(() => {
    let total = 0;
    let openTotal = 0;
    let paidTotal = 0;
    let openCount = 0;
    let paidCount = 0;

    for (const r of billRows) {
      const rawUsd = r["usdAmount"];
      const rawAmt = r["amount"];
      const val =
        typeof rawUsd === "number"
          ? rawUsd
          : typeof rawAmt === "number"
            ? rawAmt
            : Number(rawUsd || rawAmt) || 0;
      total += val;
      const status = String(r["status"] ?? "").toLowerCase();
      if (status === "paid") {
        paidTotal += val;
        paidCount++;
      } else {
        openTotal += val;
        openCount++;
      }
    }
    return { total, openTotal, paidTotal, count: billRows.length, openCount, paidCount };
  }, [billRows]);

  // Cash flow metrics
  const cashSource = sources.find((s) => s.id === "cashTransactions");
  const cashRows = cashSource?.rows ?? [];
  const cashStats = useMemo(() => {
    let inflows = 0;
    let outflows = 0;
    const categoryMap = new Map<string, { inflows: number; outflows: number; total: number }>();

    for (const r of cashRows) {
      const rawAmt = r["amount"];
      const amt = typeof rawAmt === "number" ? rawAmt : Number(rawAmt) || 0;
      const dir = String(r["direction"] ?? "").toLowerCase();
      const cat = String(r["category"] || "Unclassified");

      if (dir === "inflow" || dir === "in") {
        inflows += amt;
      } else {
        outflows += amt;
      }

      const curr = categoryMap.get(cat) ?? { inflows: 0, outflows: 0, total: 0 };
      if (dir === "inflow" || dir === "in") {
        curr.inflows += amt;
      } else {
        curr.outflows += amt;
      }
      curr.total += amt;
      categoryMap.set(cat, curr);
    }

    const categories = Array.from(categoryMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 7);

    return {
      inflows,
      outflows,
      net: inflows - outflows,
      count: cashRows.length,
      categories,
    };
  }, [cashRows]);

  // Chart of Accounts metrics
  const accountsSource = sources.find((s) => s.id === "accounts");
  const accountRows = accountsSource?.rows ?? [];
  const coaStats = useMemo(() => {
    const typeCountMap: Record<string, number> = {};
    for (const r of accountRows) {
      const type = String(r["type"] || "Other");
      typeCountMap[type] = (typeCountMap[type] ?? 0) + 1;
    }

    const typeDistribution = Object.entries(typeCountMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return {
      total: accountRows.length,
      typeDistribution,
    };
  }, [accountRows]);

  // Financial comparative bar chart data
  const comparativeData = useMemo(() => {
    return [
      {
        name: "Faturamento (A/R)",
        value: invoiceStats.total,
        realized: invoiceStats.paidTotal,
        pending: invoiceStats.openTotal,
        fill: "#2563eb",
      },
      {
        name: "Contas a Pagar (A/P)",
        value: billStats.total,
        realized: billStats.paidTotal,
        pending: billStats.openTotal,
        fill: "#dc2626",
      },
      {
        name: "Entradas de Caixa",
        value: cashStats.inflows,
        realized: cashStats.inflows,
        pending: 0,
        fill: "#059669",
      },
      {
        name: "Saídas de Caixa",
        value: cashStats.outflows,
        realized: cashStats.outflows,
        pending: 0,
        fill: "#d97706",
      },
    ];
  }, [invoiceStats, billStats, cashStats]);

  // Operations status comparison
  const operationalStatusData = useMemo(() => {
    return [
      {
        name: "Faturas / A/R",
        Liquidados: invoiceStats.paidCount,
        Pendentes: invoiceStats.openCount,
      },
      {
        name: "Contas a Pagar / A/P",
        Liquidados: billStats.paidCount,
        Pendentes: billStats.openCount,
      },
    ];
  }, [invoiceStats, billStats]);

  return (
    <div className="space-y-4">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-line/70 bg-white/70 p-4 shadow-2xs backdrop-blur-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-ink3">
              Faturamento Total (A/R)
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-600">
              <DollarSign size={13} />
            </span>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-ink sm:text-2xl tabular-nums">
            {usd(invoiceStats.total)}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-ink3">
            <span>{invoiceStats.count} faturas</span>
            <span className="text-amber-700 font-medium">{invoiceStats.openCount} pendentes</span>
          </div>
        </div>

        <div className="rounded-xl border border-line/70 bg-white/70 p-4 shadow-2xs backdrop-blur-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-ink3">
              Contas a Pagar (A/P)
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-50 text-rose-600">
              <TrendingUp size={13} />
            </span>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-ink sm:text-2xl tabular-nums">
            {usd(billStats.total)}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-ink3">
            <span>{billStats.count} contas</span>
            <span className="text-rose-700 font-medium">{billStats.openCount} a pagar</span>
          </div>
        </div>

        <div className="rounded-xl border border-line/70 bg-white/70 p-4 shadow-2xs backdrop-blur-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-ink3">
              Fluxo Líquido Realizado
            </span>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-md ${
                cashStats.net >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              }`}
            >
              <ArrowUpDown size={13} />
            </span>
          </div>
          <p
            className={`mt-2 text-xl font-bold tracking-tight sm:text-2xl tabular-nums ${
              cashStats.net >= 0 ? "text-emerald-700" : "text-rose-600"
            }`}
          >
            {usd(cashStats.net)}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-ink3">
            <span className="text-emerald-700">+{compactNumber(cashStats.inflows)}</span>
            <span className="text-amber-700">-{compactNumber(cashStats.outflows)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-line/70 bg-white/70 p-4 shadow-2xs backdrop-blur-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-ink3">
              Plano de Contas (COA)
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-50 text-violet-600">
              <Layers size={13} />
            </span>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-ink sm:text-2xl tabular-nums">
            {coaStats.total}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-ink3">
            <span>Contas cadastradas</span>
            <span className="text-violet-700 font-medium">
              {coaStats.typeDistribution.length} classes
            </span>
          </div>
        </div>
      </div>

      {/* Main Charts Section */}
      <section className="rounded-xl border border-line/70 bg-white/80 p-4 shadow-2xs backdrop-blur-xs">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line/60 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-brand" />
              <h2 className="text-sm font-semibold tracking-tight text-ink">
                Gráficos de Exibição · Visão Geral Analítica
              </h2>
            </div>
            <p className="text-[11px] text-ink3 mt-0.5">
              Visualização consolidada de faturamento, liquidações, fluxo de caixa e composição contábil.
            </p>
          </div>

          {/* Navigation tabs */}
          <div className="flex items-center gap-1 rounded-lg border border-line/80 bg-white p-0.5 text-xs shadow-2xs">
            <button
              onClick={() => setActiveTab("overview")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                activeTab === "overview"
                  ? "bg-brand text-white shadow-2xs"
                  : "text-ink2 hover:text-ink hover:bg-black/5"
              }`}
            >
              Financeiro Global
            </button>
            <button
              onClick={() => setActiveTab("coa")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                activeTab === "coa"
                  ? "bg-brand text-white shadow-2xs"
                  : "text-ink2 hover:text-ink hover:bg-black/5"
              }`}
            >
              Plano de Contas
            </button>
            <button
              onClick={() => setActiveTab("cash")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                activeTab === "cash"
                  ? "bg-brand text-white shadow-2xs"
                  : "text-ink2 hover:text-ink hover:bg-black/5"
              }`}
            >
              Categorias de Caixa
            </button>
            <button
              onClick={() => setActiveTab("operations")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                activeTab === "operations"
                  ? "bg-brand text-white shadow-2xs"
                  : "text-ink2 hover:text-ink hover:bg-black/5"
              }`}
            >
              Status Operacional
            </button>
          </div>
        </div>

        {/* Tab 1: Global Financial Comparative */}
        {activeTab === "overview" && (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-line/60 bg-white/60 p-3 lg:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">
                  Comparativo de Volumes Financeiros (USD)
                </span>
                <span className="text-[10px] text-ink3">Valores totais cadastrados no sistema</span>
              </div>
              <div className="h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    accessibilityLayer
                    data={comparativeData}
                    margin={{ top: 12, right: 16, bottom: 8, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis
                      tickFormatter={(v) => compactNumber(Number(v))}
                      tick={{ fontSize: 10 }}
                      width={52}
                    />
                    <Tooltip
                      formatter={(val: number) => [usd(val), "Volume Total"]}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "12px",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                    />
                    <Bar
                      dataKey="value"
                      name="Volume Total"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={false}
                    >
                      {comparativeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-lg border border-line/60 bg-white/60 p-3">
              <div>
                <span className="text-xs font-semibold text-ink">Resumo das Operações</span>
                <p className="text-[11px] text-ink3 mt-0.5 mb-3">
                  Detalhamento de faturamento e contas a pagar liquidadas vs pendentes.
                </p>
                <div className="space-y-3">
                  <div className="rounded-md border border-line/60 bg-white p-2.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-ink">Faturamento Liquidado</span>
                      <span className="font-semibold text-emerald-700">
                        {usd(invoiceStats.paidTotal)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-emerald-600 transition-all"
                        style={{
                          width: `${invoiceStats.total > 0 ? (invoiceStats.paidTotal / invoiceStats.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-ink3">
                      <span>{invoiceStats.paidCount} pagas</span>
                      <span>
                        {invoiceStats.total > 0
                          ? ((invoiceStats.paidTotal / invoiceStats.total) * 100).toFixed(0)
                          : 0}
                        % recebido
                      </span>
                    </div>
                  </div>

                  <div className="rounded-md border border-line/60 bg-white p-2.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-ink">Contas a Pagar Liquidadas</span>
                      <span className="font-semibold text-rose-700">{usd(billStats.paidTotal)}</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-rose-600 transition-all"
                        style={{
                          width: `${billStats.total > 0 ? (billStats.paidTotal / billStats.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-ink3">
                      <span>{billStats.paidCount} pagas</span>
                      <span>
                        {billStats.total > 0
                          ? ((billStats.paidTotal / billStats.total) * 100).toFixed(0)
                          : 0}
                        % quitado
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-md bg-slate-50 p-2.5 text-[11px] text-ink2">
                <span className="font-medium text-ink">Saldo Operacional:</span>{" "}
                {usd(invoiceStats.total - billStats.total)}{" "}
                <span className="text-ink3">(Faturamento total menos Contas a Pagar)</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Chart of Accounts Composition */}
        {activeTab === "coa" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-line/60 bg-white/60 p-3">
              <span className="text-xs font-semibold text-ink">
                Distribuição das Contas por Classificação US GAAP
              </span>
              <p className="text-[11px] text-ink3 mb-2">
                Proporção das classes contábeis ativas no livro razão da empresa.
              </p>
              <div className="h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart accessibilityLayer>
                    <Pie
                      data={coaStats.typeDistribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      label={({ name, percent }) =>
                        `${truncateText(name, 12)} (${(percent * 100).toFixed(0)}%)`
                      }
                      labelLine={false}
                    >
                      {coaStats.typeDistribution.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PALETTE[index % PALETTE.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: number) => [val, "Contas"]}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-lg border border-line/60 bg-white/60 p-3">
              <span className="text-xs font-semibold text-ink">Detalhamento por Grupo</span>
              <div className="mt-3 max-h-60 overflow-y-auto space-y-2 pr-1">
                {coaStats.typeDistribution.map((item, idx) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-md border border-line/50 bg-white p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
                      />
                      <span className="font-medium text-ink">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-ink3">
                        {coaStats.total > 0
                          ? ((item.value / coaStats.total) * 100).toFixed(1)
                          : 0}
                        %
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-ink tabular-nums">
                        {item.value} contas
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Cash Flow by Category */}
        {activeTab === "cash" && (
          <div className="rounded-lg border border-line/60 bg-white/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink">
                Movimentação por Categoria de Caixa (Top Categorias)
              </span>
              <span className="text-[10px] text-ink3">Entradas vs Saídas registradas</span>
            </div>
            {cashStats.categories.length === 0 ? (
              <p className="p-8 text-center text-xs text-ink3">
                Nenhuma transação de caixa com categoria registrada.
              </p>
            ) : (
              <div className="h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    accessibilityLayer
                    data={cashStats.categories}
                    layout="vertical"
                    margin={{ top: 8, right: 24, bottom: 8, left: 40 }}
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
                      formatter={(val: number) => [usd(val), ""]}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar
                      dataKey="inflows"
                      name="Entradas"
                      fill="#059669"
                      radius={[0, 3, 3, 0]}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="outflows"
                      name="Saídas"
                      fill="#d97706"
                      radius={[0, 3, 3, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Operational Status */}
        {activeTab === "operations" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-line/60 bg-white/60 p-3">
              <span className="text-xs font-semibold text-ink">
                Status de Faturas e Contas a Pagar (Quantidade)
              </span>
              <div className="h-64 w-full min-w-0 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    accessibilityLayer
                    data={operationalStatusData}
                    margin={{ top: 12, right: 16, bottom: 8, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} width={36} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "12px",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar
                      dataKey="Liquidados"
                      name="Liquidados / Pagos"
                      fill="#059669"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="Pendentes"
                      name="Pendentes / Em Aberto"
                      fill="#ea580c"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-lg border border-line/60 bg-white/60 p-3">
              <div>
                <span className="text-xs font-semibold text-ink">
                  Atrasos e Atenção Necessária
                </span>
                <p className="text-[11px] text-ink3 mb-3">
                  Indicadores de contas e faturas que requerem atenção operacional imediata.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs">
                    <div>
                      <p className="font-semibold text-amber-900">Faturas Vencidas (Overdue)</p>
                      <p className="text-[11px] text-amber-700">Faturas emitidas com prazo expirado</p>
                    </div>
                    <span className="rounded-full bg-amber-200/80 px-2.5 py-1 font-bold text-amber-900">
                      {invoiceStats.overdueCount}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-md border border-rose-200 bg-rose-50/60 p-3 text-xs">
                    <div>
                      <p className="font-semibold text-rose-900">Contas a Pagar em Aberto</p>
                      <p className="text-[11px] text-rose-700">
                        Obrigações aguardando pagamento
                      </p>
                    </div>
                    <span className="rounded-full bg-rose-200/80 px-2.5 py-1 font-bold text-rose-900">
                      {billStats.openCount}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-md border border-line/70 bg-white p-3 text-[11px] text-ink2">
                💡 <span className="font-medium text-ink">Dica de Relatórios:</span> Utilize os modelos rápidos abaixo para abrir relatórios detalhados com gráficos por cliente, fornecedor ou categoria.
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Quick Visual Report Presets */}
      <section className="rounded-xl border border-line/70 bg-white/70 p-4 shadow-2xs backdrop-blur-xs">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={15} className="text-brand" />
          <h3 className="text-xs font-semibold text-ink uppercase tracking-wider">
            Modelos Rápidos de Relatórios com Gráficos
          </h3>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <button
            onClick={() =>
              onSelectPreset({
                name: "Fluxo de Caixa por Categoria",
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
            className="flex flex-col items-start rounded-lg border border-line/80 bg-white p-3 text-left transition-all hover:border-brand/60 hover:bg-brand/5 shadow-2xs group"
          >
            <span className="text-xs font-semibold text-ink group-hover:text-brand flex items-center gap-1.5">
              <BarChart3 size={13} /> Fluxo por Categoria
            </span>
            <span className="text-[11px] text-ink3 mt-1">
              Soma de movimentações agrupadas por categoria de caixa.
            </span>
          </button>

          <button
            onClick={() =>
              onSelectPreset({
                name: "Faturamento por Cliente",
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
            className="flex flex-col items-start rounded-lg border border-line/80 bg-white p-3 text-left transition-all hover:border-brand/60 hover:bg-brand/5 shadow-2xs group"
          >
            <span className="text-xs font-semibold text-ink group-hover:text-brand flex items-center gap-1.5">
              <TrendingUp size={13} /> Faturamento por Cliente
            </span>
            <span className="text-[11px] text-ink3 mt-1">
              Volume total de faturas agrupadas por cliente emitente.
            </span>
          </button>

          <button
            onClick={() =>
              onSelectPreset({
                name: "Contas a Pagar por Fornecedor",
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
            className="flex flex-col items-start rounded-lg border border-line/80 bg-white p-3 text-left transition-all hover:border-brand/60 hover:bg-brand/5 shadow-2xs group"
          >
            <span className="text-xs font-semibold text-ink group-hover:text-brand flex items-center gap-1.5">
              <Layers size={13} /> Contas a Pagar por Fornecedor
            </span>
            <span className="text-[11px] text-ink3 mt-1">
              Despesas e contas a pagar consolidadas por fornecedor.
            </span>
          </button>

          <button
            onClick={() =>
              onSelectPreset({
                name: "Plano de Contas por Classificação",
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
            className="flex flex-col items-start rounded-lg border border-line/80 bg-white p-3 text-left transition-all hover:border-brand/60 hover:bg-brand/5 shadow-2xs group"
          >
            <span className="text-xs font-semibold text-ink group-hover:text-brand flex items-center gap-1.5">
              <PieIcon size={13} /> Contas Contábeis por Classe
            </span>
            <span className="text-[11px] text-ink3 mt-1">
              Contagem de contas ativas no razão agrupadas por tipo.
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// 2. Report Dynamic Visualizer (Shown above report results table)
// ============================================================================

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
  const [chartType, setChartType] = useState<"bar" | "hbar" | "line" | "area" | "pie">("bar");
  const [limitTop, setLimitTop] = useState<number>(15);

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

    // Double check across up to 10 rows for columns with null in first row
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

    // If there is a metric, map rows to { name, value, raw }
    if (effectiveMetricCol) {
      const mapped = rowsToUse.map((r, i) => {
        const rawCategory = r[effectiveCategoryCol];
        const name =
          rawCategory == null || rawCategory === ""
            ? `(Vazio #${i + 1})`
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

    // If no numeric column, calculate frequency / counts of categories
    const countMap = new Map<string, number>();
    for (const r of rowsToUse) {
      const cat = String(r[effectiveCategoryCol] ?? "Vazio");
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
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-line/70 bg-white/70 p-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center rounded-md border border-line bg-white p-0.5 text-xs shadow-2xs">
            <button
              title="Exibir gráfico e tabela"
              onClick={() => onViewLayoutChange("both")}
              className={`flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors ${
                viewLayout === "both" ? "bg-brand text-white shadow-2xs" : "text-ink2 hover:text-ink"
              }`}
            >
              <LayoutGrid size={13} />
              <span>Ambos</span>
            </button>
            <button
              title="Exibir somente gráfico"
              onClick={() => onViewLayoutChange("chart")}
              className={`flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors ${
                viewLayout === "chart" ? "bg-brand text-white shadow-2xs" : "text-ink2 hover:text-ink"
              }`}
            >
              <BarChart3 size={13} />
              <span>Gráfico</span>
            </button>
            <button
              title="Exibir somente tabela"
              onClick={() => onViewLayoutChange("table")}
              className={`flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors ${
                viewLayout === "table" ? "bg-brand text-white shadow-2xs" : "text-ink2 hover:text-ink"
              }`}
            >
              <TableIcon size={13} />
              <span>Tabela</span>
            </button>
          </div>

          {/* Chart Type Buttons (Only active when chart is visible) */}
          {viewLayout !== "table" && (
            <div className="flex items-center rounded-md border border-line bg-white p-0.5 text-xs shadow-2xs">
              <button
                title="Gráfico de Barras Verticais"
                onClick={() => setChartType("bar")}
                className={`p-1.5 rounded transition-colors ${
                  chartType === "bar" ? "bg-brand text-white" : "text-ink2 hover:text-ink"
                }`}
              >
                <BarChart3 size={13} />
              </button>
              <button
                title="Gráfico de Barras Horizontais"
                onClick={() => setChartType("hbar")}
                className={`p-1.5 rounded transition-colors ${
                  chartType === "hbar" ? "bg-brand text-white" : "text-ink2 hover:text-ink"
                }`}
              >
                <BarChart3 size={13} className="rotate-90" />
              </button>
              <button
                title="Gráfico de Linhas"
                onClick={() => setChartType("line")}
                className={`p-1.5 rounded transition-colors ${
                  chartType === "line" ? "bg-brand text-white" : "text-ink2 hover:text-ink"
                }`}
              >
                <LineIcon size={13} />
              </button>
              <button
                title="Gráfico de Área"
                onClick={() => setChartType("area")}
                className={`p-1.5 rounded transition-colors ${
                  chartType === "area" ? "bg-brand text-white" : "text-ink2 hover:text-ink"
                }`}
              >
                <TrendingUp size={13} />
              </button>
              <button
                title="Gráfico de Pizza / Rosca"
                onClick={() => setChartType("pie")}
                className={`p-1.5 rounded transition-colors ${
                  chartType === "pie" ? "bg-brand text-white" : "text-ink2 hover:text-ink"
                }`}
              >
                <PieIcon size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Axis & Metric Selectors */}
        {viewLayout !== "table" && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5 text-ink3">
              <span>Eixo X:</span>
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

            <label className="flex items-center gap-1.5 text-ink3">
              <span>Métrica:</span>
              <select
                className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-hidden"
                value={effectiveMetricCol}
                onChange={(e) => setMetricCol(e.target.value)}
              >
                <option value="">Frequência / Contagem</option>
                {numericCols.map((c) => (
                  <option key={c} value={c}>
                    {labelFn(c)}
                  </option>
                ))}
              </select>
            </label>

            {data.rows.length > 15 && (
              <label className="flex items-center gap-1.5 text-ink3">
                <span>Itens:</span>
                <select
                  className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-hidden"
                  value={limitTop}
                  onChange={(e) => setLimitTop(Number(e.target.value))}
                >
                  <option value={10}>Top 10</option>
                  <option value={15}>Top 15</option>
                  <option value={25}>Top 25</option>
                  <option value={0}>Todos ({data.rows.length})</option>
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
                <span className="text-[10px] text-ink3 uppercase tracking-wider">Média</span>
                <p className="font-semibold text-ink tabular-nums">
                  {formatCurrencyOrNumber(stats.avg, isCurrencyMetric)}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-ink3 uppercase tracking-wider">Maior</span>
                <p className="font-semibold text-emerald-700 tabular-nums">
                  {formatCurrencyOrNumber(stats.max, isCurrencyMetric)}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-ink3 uppercase tracking-wider">Menor</span>
                <p className="font-semibold text-ink2 tabular-nums">
                  {formatCurrencyOrNumber(stats.min, isCurrencyMetric)}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-[10px] text-ink3 uppercase tracking-wider">Pontos</span>
                <p className="font-semibold text-ink tabular-nums">
                  {stats.count} {stats.count === 1 ? "registro" : "registros"}
                </p>
              </div>
            </div>
          )}

          {/* Render Active Chart Type */}
          <div className="h-72 w-full min-w-0">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-ink3">
                Não há dados numéricos suficientes para renderizar o gráfico neste relatório.
              </div>
            ) : chartType === "bar" ? (
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
                      effectiveMetricCol ? labelFn(effectiveMetricCol) : "Quantidade",
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
                    name={effectiveMetricCol ? labelFn(effectiveMetricCol) : "Quantidade"}
                    fill="#2563eb"
                    radius={[4, 4, 0, 0]}
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
            ) : chartType === "hbar" ? (
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
                      effectiveMetricCol ? labelFn(effectiveMetricCol) : "Quantidade",
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  />
                  <Bar
                    dataKey="value"
                    name={effectiveMetricCol ? labelFn(effectiveMetricCol) : "Quantidade"}
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
            ) : chartType === "line" ? (
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
                      effectiveMetricCol ? labelFn(effectiveMetricCol) : "Quantidade",
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  />
                  <ReferenceLine y={0} stroke="#94a3b8" />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={effectiveMetricCol ? labelFn(effectiveMetricCol) : "Quantidade"}
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#2563eb" }}
                    activeDot={{ r: 6 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : chartType === "area" ? (
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
                      effectiveMetricCol ? labelFn(effectiveMetricCol) : "Quantidade",
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  />
                  <ReferenceLine y={0} stroke="#94a3b8" />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name={effectiveMetricCol ? labelFn(effectiveMetricCol) : "Quantidade"}
                    stroke="#2563eb"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorValueGrad)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart accessibilityLayer>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={3}
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
                      effectiveMetricCol ? labelFn(effectiveMetricCol) : "Quantidade",
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
