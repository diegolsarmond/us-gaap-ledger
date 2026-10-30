import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompanies } from "@/components/company-context";
import { PageTitle, Panel } from "@/components/ui-kit";
import { loadReportSources } from "@/lib/reports";
import { runReport, type Report } from "@/lib/report-engine";
import { Download, Plus, Save, Trash2 } from "lucide-react";

export const Route = createFileRoute("/reports")({ component: ReportsPage });
const initial: Report = {
  name: "Meu relatório",
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
const control = "w-full rounded-md border border-line bg-white px-3 py-2 text-xs";
const button =
  "inline-flex items-center justify-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-xs hover:bg-brand/5 disabled:opacity-40";
function ReportsPage() {
  const { activeCompany, user } = useCompanies();
  const companyId = activeCompany!.id;
  const storageKey = `reports-v1:${user.id}:${companyId}`;
  const [report, setReport] = useState<Report>(initial);
  const [saved, setSaved] = useState<Report[]>([]);
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
      ? "Resultado"
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
      setNotice("Modelo salvo neste navegador para esta empresa e usuário.");
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
  if (query.isPending) return <p role="status">Carregando fontes de relatórios…</p>;
  if (query.isError)
    return (
      <div role="alert">
        Não foi possível carregar os dados.{" "}
        <button className={button} onClick={() => void query.refetch()}>
          Tentar novamente
        </button>
      </div>
    );
  return (
    <div className="space-y-4">
      <PageTitle
        title="Central de relatórios"
        description={`Combine dados de ${activeCompany!.name}, escolha campos e personalize suas análises.`}
        actions={
          <>
            <button className={button} onClick={() => void query.refetch()}>
              Atualizar dados
            </button>
            <button className={button} onClick={save}>
              <Save size={14} />
              Salvar modelo
            </button>
            <button className={button} disabled={!data?.columns.length} onClick={exportCsv}>
              <Download size={14} />
              Exportar CSV
            </button>
          </>
        }
      />
      {notice && (
        <p role="status" className="text-xs text-brand">
          {notice}
        </p>
      )}
      <Panel
        title="Modelos de relatório"
        subtitle="Salvos apenas neste navegador. Os dados são consultados novamente ao abrir."
      >
        <div className="flex flex-wrap gap-2 p-4">
          <button className={button} onClick={() => patch(initial)}>
            <Plus size={14} />
            Novo relatório
          </button>
          {saved.map((s) => (
            <div key={s.name} className="flex gap-1">
              <button className={button} onClick={() => patch(s)}>
                {s.name}
              </button>
              <button
                className={button}
                aria-label={`Excluir modelo ${s.name}`}
                onClick={() => {
                  const next = saved.filter((v) => v.name !== s.name);
                  try {
                    localStorage.setItem(storageKey, JSON.stringify(next));
                    setSaved(next);
                  } catch {
                    setNotice("Não foi possível excluir o modelo.");
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </Panel>
      <Panel
        title="1. Fontes e cruzamentos"
        subtitle="Cada linha representa um registro da fonte principal. Itens e lotes estão disponíveis como fontes próprias, ligados por parentId."
      >
        <div className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              Nome do relatório
              <input
                className={control}
                value={report.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <label className="space-y-1 text-xs">
              Fonte principal
              <select
                className={control}
                value={report.source}
                onChange={(e) => patch({ ...initial, name: report.name, source: e.target.value })}
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.rows.length})
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
                Cruzar com
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
                    patch({ joins: report.joins.map((v, n) => (n === i ? { ...v, left } : v)) }),
                  [report.source, ...report.joins.slice(0, i).map((v) => v.source)].flatMap(
                    (id) => sources.find((s) => s.id === id)?.fields.map((f) => `${id}.${f}`) ?? [],
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
                Tipo
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
                  <option value="left">Manter todos da origem</option>
                  <option value="inner">Somente correspondências</option>
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
                Remover cruzamento e seguintes
              </button>
            </div>
          ))}
          <button
            className={button}
            onClick={() =>
              patch({ joins: [...report.joins, { source: "", left: "", right: "", kind: "left" }] })
            }
          >
            <Plus size={14} />
            Adicionar cruzamento
          </button>
          <p className="text-xs text-ink3">
            Exemplos: cashTransactions.account_id → cashAccounts.id; bills.vendorId → vendors.id;
            invoices.projectId → projects.id. Campos sem valor não são relacionados.
          </p>
        </div>
      </Panel>
      <Panel title="2. Campos e filtros">
        <div className="space-y-4 p-4">
          <fieldset>
            <legend className="mb-2 text-xs">Colunas do relatório</legend>
            <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
              {fields.map((f) => (
                <label key={f} className="flex items-center gap-2 text-xs">
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
                patch({ filters: report.filters.map((v, n) => (n === i ? { ...v, field } : v)) }),
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
                  gte: "Maior ou igual",
                  lte: "Menor ou igual",
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
      <Panel title="3. Análise e apresentação">
        <div className="space-y-3 p-4">
          <label className="flex gap-2 text-xs">
            <input
              type="checkbox"
              checked={report.summary}
              onChange={(e) => patch({ summary: e.target.checked, sort: "" })}
            />
            Resumir com agrupamentos e cálculos
          </label>
          {report.summary && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs">
                  Cálculo
                  <select
                    className={control}
                    value={report.operation}
                    onChange={(e) => patch({ operation: e.target.value as Report["operation"] })}
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
                    Campo numérico{selectFields(report.metric, (metric) => patch({ metric }))}
                  </label>
                )}
              </div>
              <fieldset>
                <legend className="text-xs mb-2">
                  Agrupar por (selecione moeda ao somar valores monetários)
                </legend>
                <div className="grid max-h-36 gap-2 overflow-y-auto sm:grid-cols-2">
                  {fields.map((f) => (
                    <label key={f} className="flex gap-2 text-xs">
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
            <label className="flex gap-2 text-xs">
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
      {result.error && (
        <p role="alert" className="rounded-lg border border-line p-4 text-sm text-down">
          {result.error}
        </p>
      )}
      {data?.expanded && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          Há múltiplas correspondências: registros da origem foram repetidos no cruzamento. Somas e
          contagens refletem essas linhas; revise as chaves antes de interpretar os totais.
        </p>
      )}
      {data && (
        <Panel
          title={report.name || "Resultado"}
          subtitle={`${data.matched} linhas após os filtros · ${data.rows.length} linhas no resultado. Valores na unidade e moeda originais, sem conversão.`}
        >
          <div className="overflow-x-auto">
            {!data.columns.length ? (
              <p className="p-6 text-sm text-ink3">
                Selecione as colunas ou ative o resumo para visualizar o relatório.
              </p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    {data.columns.map((c) => (
                      <th className="whitespace-nowrap border-b border-line p-3" key={c}>
                        {label(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.slice(page * 50, (page + 1) * 50).map((row, i) => (
                    <tr key={i}>
                      {data.columns.map((c) => (
                        <td
                          key={c}
                          className="max-w-md whitespace-pre-wrap border-b border-line/50 p-3"
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
                        Nenhum registro encontrado para esta combinação.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex items-center justify-between p-3 text-xs">
            <button className={button} disabled={!page} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </button>
            <span>
              Página {page + 1} de {Math.max(1, Math.ceil(data.rows.length / 50))} · CSV inclui
              todas as linhas
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
  );
}
