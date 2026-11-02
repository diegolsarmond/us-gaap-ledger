import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompanies } from "@/components/company-context";
import { PageTitle, Panel } from "@/components/ui-kit";
import { loadReportSources } from "@/lib/reports";
import { runReport, type Report } from "@/lib/report-engine";
import { Download, Eye, Pencil, Plus, Save, Trash2, BarChart3 } from "lucide-react";
import { ReportOverviewCharts, ReportDynamicChart } from "@/components/report-charts";

export const Route = createFileRoute("/reports")({ component: ReportsPage });

const initial: Report = {
  name: "Meu Relatório",
  source: "cashTransactions",
  joins: [],
  columns: [],
  filters: [],
  groups: [],
  metric: "",
  operation: "count",
  summary: false,
  sort: "",
  descending: false,
};

const control = "w-full rounded-md border border-line bg-white px-3 py-2 text-xs text-ink focus:outline-hidden";
const button =
  "inline-flex items-center justify-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-xs font-medium text-ink hover:bg-brand/5 transition-colors disabled:opacity-40";

function ReportsPage() {
  const { activeCompany, user } = useCompanies();
  const companyId = activeCompany!.id;
  const storageKey = `reports-v1:${user.id}:${companyId}`;
  const [report, setReport] = useState<Report>(initial);
  const [saved, setSaved] = useState<Report[]>([]);
  const [mode, setMode] = useState<"list" | "builder" | "view">("list");
  const [viewLayout, setViewLayout] = useState<"both" | "chart" | "table">("both");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(0);

  const query = useQuery({
    queryKey: ["report-sources", companyId],
    queryFn: () => loadReportSources({ data: { companyId } }),
  });

  const sources = query.data ?? [];

  useEffect(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(value))
        setSaved(
          value.filter(
            (v) =>
              v &&
              typeof v.name === "string" &&
              Array.isArray(v.columns) &&
              Array.isArray(v.joins) &&
              Array.isArray(v.filters) &&
              Array.isArray(v.groups),
          ),
        );
    } catch {
      setNotice("Não foi possível carregar os modelos salvos neste navegador.");
    }
  }, [storageKey]);

  const patch = (value: Partial<Report>) => {
    setReport((r) => ({ ...r, ...value }));
    setPage(0);
  };

  const fields = [report.source, ...report.joins.map((j) => j.source)].flatMap(
    (id) => sources.find((s) => s.id === id)?.fields.map((f) => `${id}.${f}`) ?? [],
  );

  const label = (field: string) => {
    const dot = field.indexOf(".");
    return field === "resultado"
      ? "Resultado / Métrica"
      : `${sources.find((s) => s.id === field.slice(0, dot))?.label ?? field.slice(0, dot)} · ${field.slice(dot + 1)}`;
  };

  const result = useMemo(() => {
    if (!query.data) return { data: null, error: "" };
    try {
      return { data: runReport(query.data, report), error: "" };
    } catch (e) {
      return {
        data: null,
        error: e instanceof Error ? e.message : "Não foi possível gerar o relatório.",
      };
    }
  }, [query.data, report]);

  const data = result.data;

  const selectFields = (
    value: string,
    change: (s: string) => void,
    options = fields,
    placeholder = "Selecione um campo",
  ) => (
    <select className={control} value={value} onChange={(e) => change(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((f) => (
        <option key={f} value={f}>
          {label(f)}
        </option>
      ))}
    </select>
  );

  const save = () => {
    if (!report.name.trim()) {
      setNotice("Informe um nome para o relatório.");
      return;
    }
    const next = [...saved.filter((s) => s.name !== report.name), report];
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(next);
      setNotice("Relatório salvo com sucesso neste navegador.");
      setMode("list");
    } catch {
      setNotice("Não foi possível salvar o modelo neste navegador.");
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const cell = (v: unknown) => {
      let text = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(text) && typeof v !== "number") text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const csv =
      "\uFEFF" +
      [data.columns.map(label), ...data.rows.map((row) => data.columns.map((c) => row[c]))]
        .map((row) => row.map(cell).join(";"))
        .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${report.name.replace(/[^\p{L}\p{N}_-]/gu, "_") || "relatorio"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (query.isPending) return <p role="status" className="p-6 text-sm text-ink3">Loading reports…</p>;
  if (query.isError)
    return (
      <div role="alert" className="p-6 text-sm text-down space-y-2">
        <p>Não foi possível carregar os dados das fontes.</p>
        <button className={button} onClick={() => void query.refetch()}>
          Tentar novamente
        </button>
      </div>
    );

  return (
    <div className="space-y-4">
      <PageTitle
        title={mode === "list" ? "Relatórios & Gráficos" : mode === "view" ? report.name : "Construtor de Relatórios"}
        description={`Combine dados de ${activeCompany!.name}, gere gráficos analíticos, escolha campos e personalize análises.`}
        actions={
          <>
            <button className={button} onClick={() => void query.refetch()}>
              Atualizar dados
            </button>
            {mode !== "list" && (
              <button className={button} onClick={() => setMode("list")}>
                <BarChart3 size={14} />
                Painel & Relatórios Salvos
              </button>
            )}
            {mode === "view" && (
              <button className={button} onClick={() => setMode("builder")}>
                <Pencil size={14} />
                Editar relatório
              </button>
            )}
            {mode === "builder" && (
              <button className={button} onClick={save}>
                <Save size={14} />
                Salvar relatório
              </button>
            )}
            {mode !== "list" && (
              <button className={button} disabled={!data?.columns.length} onClick={exportCsv}>
                <Download size={14} />
                Exportar CSV
              </button>
            )}
          </>
        }
      />

      {notice && (
        <p role="status" className="rounded-md bg-brand/10 p-2.5 text-xs text-brand font-medium">
          {notice}
        </p>
      )}

      {/* Mode List: Overview Charts & Saved Reports */}
      {mode === "list" && (
        <div className="space-y-4">
          {/* Executive Overview Display Charts */}
          <ReportOverviewCharts
            sources={sources}
            onSelectPreset={(preset) => {
              patch(preset);
              setMode("view");
              setNotice("");
              void query.refetch();
            }}
          />

          {/* Saved Reports Panel */}
          <Panel
            title="Relatórios Salvos"
            subtitle="As definições de relatórios ficam gravadas no navegador para esta empresa e usuário. Ao abrir, os resultados são recalculados com dados em tempo real."
          >
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <input
                className={control + " sm:max-w-sm"}
                aria-label="Buscar relatórios salvos"
                placeholder="Buscar relatórios salvos…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                className={button}
                onClick={() => {
                  patch(initial);
                  setMode("builder");
                  setNotice("");
                }}
              >
                <Plus size={14} />
                Novo relatório
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    {["Nome do Relatório", "Fonte Primária", "Tipo", "Configuração", "Ações"].map(
                      (h) => (
                        <th key={h} className="border-b border-line p-3 font-semibold text-ink">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {saved
                    .filter((s) => s.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
                    .map((s) => (
                      <tr key={s.name} className="hover:bg-brand/5 transition-colors">
                        <td className="border-b border-line/50 p-3 font-medium text-ink">{s.name}</td>
                        <td className="border-b border-line/50 p-3 text-ink2">
                          {sources.find((source) => source.id === s.source)?.label ?? s.source}
                        </td>
                        <td className="border-b border-line/50 p-3 text-ink2">
                          {s.summary ? "Resumo / Agrupado" : "Detalhado"}
                        </td>
                        <td className="border-b border-line/50 p-3 text-ink3">
                          {s.joins.length} cruzamentos · {s.filters.length} filtros ·{" "}
                          {s.summary ? s.groups.length + " grupos" : s.columns.length + " colunas"}
                        </td>
                        <td className="border-b border-line/50 p-3">
                          <div className="flex gap-2">
                            <button
                              className={button}
                              aria-label={`Ver relatório ${s.name}`}
                              onClick={() => {
                                patch(s);
                                setMode("view");
                                setNotice("");
                                void query.refetch();
                              }}
                            >
                              <Eye size={14} />
                              Ver Gráficos & Dados
                            </button>
                            <button
                              className={button}
                              aria-label={`Editar relatório ${s.name}`}
                              onClick={() => {
                                patch(s);
                                setMode("builder");
                                setNotice("");
                              }}
                            >
                              <Pencil size={14} />
                              Editar
                            </button>
                            <button
                              className={button}
                              aria-label={`Excluir relatório ${s.name}`}
                              onClick={() => {
                                const next = saved.filter((v) => v.name !== s.name);
                                try {
                                  localStorage.setItem(storageKey, JSON.stringify(next));
                                  setSaved(next);
                                  setNotice("Relatório excluído.");
                                } catch {
                                  setNotice("Não foi possível excluir o relatório.");
                                }
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  {!saved.filter((s) =>
                    s.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
                  ).length && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-ink3">
                          {saved.length
                            ? "Nenhum relatório salvo corresponde à sua busca."
                            : "Nenhum relatório personalizado salvo ainda. Crie um novo relatório ou use os modelos rápidos acima."}
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* Mode Builder: Configuration Panels */}
      {mode === "builder" && (
        <>
          <Panel
            title="1. Fontes de Dados e Cruzamentos (Joins)"
            subtitle="Cada linha representa um registro da fonte primária. Registros filhos são vinculados por parentId."
          >
            <div className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs">
                  <span className="font-medium text-ink">Nome do relatório</span>
                  <input
                    className={control}
                    value={report.name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="font-medium text-ink">Fonte primária de dados</span>
                  <select
                    className={control}
                    value={report.source}
                    onChange={(e) =>
                      patch({ ...initial, name: report.name, source: e.target.value })
                    }
                  >
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} ({s.rows.length} registros)
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {report.joins.map((j, i) => (
                <div
                  key={i}
                  className="grid items-end gap-2 rounded-lg border border-line p-3 lg:grid-cols-5"
                >
                  <label className="text-xs">
                    Cruzamento com
                    <select
                      className={control}
                      value={j.source}
                      onChange={(e) =>
                        patch({
                          joins: report.joins.map((v, n) =>
                            n === i ? { ...v, source: e.target.value, right: "" } : v,
                          ),
                          columns: [],
                          groups: [],
                          filters: [],
                        })
                      }
                    >
                      <option value="">Selecione a fonte</option>
                      {sources
                        .filter(
                          (s) =>
                            s.id !== report.source &&
                            !report.joins.some((v, n) => n !== i && v.source === s.id),
                        )
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    Campo de origem
                    {selectFields(
                      j.left,
                      (left) =>
                        patch({
                          joins: report.joins.map((v, n) => (n === i ? { ...v, left } : v)),
                        }),
                      [report.source, ...report.joins.slice(0, i).map((v) => v.source)].flatMap(
                        (id) =>
                          sources.find((s) => s.id === id)?.fields.map((f) => `${id}.${f}`) ?? [],
                      ),
                    )}
                  </label>
                  <label className="text-xs">
                    Campo correspondente
                    <select
                      className={control}
                      value={j.right}
                      onChange={(e) =>
                        patch({
                          joins: report.joins.map((v, n) =>
                            n === i ? { ...v, right: e.target.value } : v,
                          ),
                        })
                      }
                    >
                      <option value="">Selecione</option>
                      {sources
                        .find((s) => s.id === j.source)
                        ?.fields.map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    Tipo de cruzamento
                    <select
                      className={control}
                      value={j.kind}
                      onChange={(e) =>
                        patch({
                          joins: report.joins.map((v, n) =>
                            n === i ? { ...v, kind: e.target.value as "left" | "inner" } : v,
                          ),
                        })
                      }
                    >
                      <option value="left">Manter todos da origem (LEFT)</option>
                      <option value="inner">Apenas correspondentes (INNER)</option>
                    </select>
                  </label>
                  <button
                    className={button}
                    onClick={() =>
                      patch({
                        joins: report.joins.slice(0, i),
                        columns: [],
                        groups: [],
                        filters: [],
                        metric: "",
                        sort: "",
                      })
                    }
                  >
                    Remover cruzamento
                  </button>
                </div>
              ))}
              <button
                className={button}
                onClick={() =>
                  patch({
                    joins: [...report.joins, { source: "", left: "", right: "", kind: "left" }],
                  })
                }
              >
                <Plus size={14} />
                Adicionar cruzamento
              </button>
            </div>
          </Panel>

          <Panel title="2. Colunas e Filtros">
            <div className="space-y-4 p-4">
              <fieldset>
                <legend className="mb-2 text-xs font-semibold text-ink">Colunas do relatório</legend>
                <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
                  {fields.map((f) => (
                    <label key={f} className="flex items-center gap-2 text-xs text-ink2 hover:text-ink cursor-pointer">
                      <input
                        type="checkbox"
                        checked={report.columns.includes(f)}
                        onChange={(e) =>
                          patch({
                            columns: e.target.checked
                              ? [...report.columns, f]
                              : report.columns.filter((c) => c !== f),
                          })
                        }
                      />
                      {label(f)}
                    </label>
                  ))}
                </div>
              </fieldset>
              {report.filters.map((f, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-4">
                  {selectFields(f.field, (field) =>
                    patch({
                      filters: report.filters.map((v, n) => (n === i ? { ...v, field } : v)),
                    }),
                  )}
                  <select
                    className={control}
                    value={f.operator}
                    onChange={(e) =>
                      patch({
                        filters: report.filters.map((v, n) =>
                          n === i ? { ...v, operator: e.target.value as typeof f.operator } : v,
                        ),
                      })
                    }
                  >
                    {Object.entries({
                      contains: "Contém",
                      eq: "Igual a",
                      neq: "Diferente de",
                      gte: "Maior ou igual a",
                      lte: "Menor ou igual a",
                      empty: "Está vazio",
                    }).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Valor do filtro"
                    className={control}
                    disabled={f.operator === "empty"}
                    placeholder="Valor ou data AAAA-MM-DD"
                    value={f.value}
                    onChange={(e) =>
                      patch({
                        filters: report.filters.map((v, n) =>
                          n === i ? { ...v, value: e.target.value } : v,
                        ),
                      })
                    }
                  />
                  <button
                    className={button}
                    onClick={() => patch({ filters: report.filters.filter((_, n) => n !== i) })}
                  >
                    Remover filtro
                  </button>
                </div>
              ))}
              <button
                className={button}
                onClick={() =>
                  patch({
                    filters: [
                      ...report.filters,
                      { field: fields[0] ?? "", operator: "contains", value: "" },
                    ],
                  })
                }
              >
                <Plus size={14} />
                Adicionar filtro (E)
              </button>
            </div>
          </Panel>

          <Panel title="3. Análise, Agrupamento e Ordenação">
            <div className="space-y-3 p-4">
              <label className="flex items-center gap-2 text-xs font-medium text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={report.summary}
                  onChange={(e) => patch({ summary: e.target.checked, sort: "" })}
                />
                Resumir com agrupamentos e cálculos estatísticos (gera gráficos instantâneos)
              </label>
              {report.summary && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs">
                      <span className="font-medium text-ink">Operação de cálculo</span>
                      <select
                        className={control}
                        value={report.operation}
                        onChange={(e) =>
                          patch({ operation: e.target.value as Report["operation"] })
                        }
                      >
                        {Object.entries({
                          count: "Contagem de linhas",
                          sum: "Soma",
                          avg: "Média",
                          min: "Mínimo",
                          max: "Máximo",
                        }).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    {report.operation !== "count" && (
                      <label className="text-xs">
                        <span className="font-medium text-ink">Campo numérico métrico</span>
                        {selectFields(report.metric, (metric) => patch({ metric }))}
                      </label>
                    )}
                  </div>
                  <fieldset>
                    <legend className="text-xs font-semibold text-ink mb-2">
                      Agrupar por (selecione categorias, clientes ou tipos para o eixo do gráfico)
                    </legend>
                    <div className="grid max-h-36 gap-2 overflow-y-auto sm:grid-cols-2">
                      {fields.map((f) => (
                        <label key={f} className="flex items-center gap-2 text-xs text-ink2 hover:text-ink cursor-pointer">
                          <input
                            type="checkbox"
                            checked={report.groups.includes(f)}
                            onChange={(e) =>
                              patch({
                                groups: e.target.checked
                                  ? [...report.groups, f]
                                  : report.groups.filter((g) => g !== f),
                              })
                            }
                          />
                          {label(f)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </>
              )}
              <div className="flex items-center gap-3">
                {selectFields(
                  report.sort,
                  (sort) => patch({ sort }),
                  report.summary ? [...report.groups, "resultado"] : report.columns,
                  "Sem ordenação",
                )}
                <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={report.descending}
                    onChange={(e) => patch({ descending: e.target.checked })}
                  />
                  Decrescente
                </label>
              </div>
            </div>
          </Panel>
        </>
      )}

      {/* Errors or Notices in Builder / View */}
      {mode !== "list" && result.error && (
        <p role="alert" className="rounded-lg border border-line bg-rose-50/70 p-4 text-sm text-down">
          {result.error}
        </p>
      )}

      {mode !== "list" && data?.expanded && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200">
          Múltiplas correspondências encontradas: registros da fonte foram duplicados no cruzamento.
        </p>
      )}

      {/* Dynamic Display Chart and Result Table in Builder / View */}
      {mode !== "list" && data && (
        <div className="space-y-3">
          {/* Dynamic Interactive Chart */}
          <ReportDynamicChart
            report={report}
            data={data}
            labelFn={label}
            viewLayout={viewLayout}
            onViewLayoutChange={setViewLayout}
          />

          {/* Results Table (when layout is 'both' or 'table') */}
          {viewLayout !== "chart" && (
            <Panel
              title={report.name || "Resultado"}
              subtitle={`${data.matched} linhas após os filtros · ${data.rows.length} registros no total. Valores em sua moeda e unidade originais.`}
            >
              <div className="overflow-x-auto">
                {!data.columns.length ? (
                  <p className="p-6 text-sm text-ink3">
                    Selecione colunas na seção 2 ou marque resumo para visualizar dados.
                  </p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr>
                        {data.columns.map((c) => (
                          <th className="whitespace-nowrap border-b border-line p-3 font-semibold text-ink" key={c}>
                            {label(c)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.slice(page * 50, (page + 1) * 50).map((row, i) => (
                        <tr key={i} className="hover:bg-brand/5 transition-colors">
                          {data.columns.map((c) => (
                            <td
                              key={c}
                              className="max-w-md whitespace-pre-wrap border-b border-line/50 p-3 text-ink"
                            >
                              {row[c] == null
                                ? "—"
                                : typeof row[c] === "boolean"
                                  ? row[c]
                                    ? "Sim"
                                    : "Não"
                                  : String(row[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {!data.rows.length && (
                        <tr>
                          <td className="p-6 text-center text-ink3" colSpan={data.columns.length}>
                            Nenhum registro encontrado para esta combinação de filtros.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="flex items-center justify-between p-3 text-xs border-t border-line/60">
                <button className={button} disabled={!page} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </button>
                <span className="text-ink3">
                  Página {page + 1} de {Math.max(1, Math.ceil(data.rows.length / 50))} · O CSV exporta todas as linhas
                </span>
                <button
                  className={button}
                  disabled={(page + 1) * 50 >= data.rows.length}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </button>
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
