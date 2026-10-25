import { useCompanies } from "@/components/company-context";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuditEvents } from "@/lib/admin";
import { PageTitle, Panel, Table, Th, Td } from "@/components/ui-kit";
export const Route = createFileRoute("/audit-log")({ component: AuditPage });
function AuditPage() {
  const { activeCompany } = useCompanies();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const query = useQuery({
    queryKey: ["system-audit", activeCompany?.id, page],
    queryFn: () => getAuditEvents({ data: { page, companyId: activeCompany?.id } }),
  });
  const rows =
    query.data?.events.filter(
      (r) =>
        (!action || r.action === action) &&
        `${r.actor_name} ${r.entity} ${r.target_id}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  return (
    <div className="space-y-4">
      <PageTitle
        title="Auditoria · Logs de ações"
        description="Histórico de logins e alterações de usuários, perfis, contas e lançamentos. Datas no horário local."
      />
      {query.isPending && <p role="status">Carregando logs…</p>}
      {query.isError && (
        <p role="alert">
          Não foi possível consultar a auditoria. Verifique sua permissão, a conexão e a migração
          003_access_audit.sql.{" "}
          <button className="underline" onClick={() => void query.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Buscar logs nesta página"
          placeholder="Buscar nesta página por usuário, entidade ou ID…"
          className="min-w-64 flex-1 rounded-md border border-line bg-white p-2 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Ação"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="rounded-md border border-line bg-white p-2 text-sm"
        >
          <option value="">Todas as ações</option>
          <option value="LOGIN">Login</option>
          <option value="INSERT">Criação</option>
          <option value="UPDATE">Alteração</option>
          <option value="DELETE">Exclusão</option>
        </select>
      </div>
      {query.isSuccess && (
        <Panel
          title={`Registros · página ${page}`}
          subtitle={`${rows.length} registros exibidos · até 100 por página`}
        >
          <Table>
            <thead>
              <tr>
                <Th>Data e hora</Th>
                <Th>Responsável</Th>
                <Th>Ação</Th>
                <Th>Entidade / registro</Th>
                <Th>Detalhes</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>{new Date(r.occurred_at).toLocaleString("pt-BR")}</Td>
                  <Td>{r.actor_name}</Td>
                  <Td>
                    {{ LOGIN: "Login", INSERT: "Criação", UPDATE: "Alteração", DELETE: "Exclusão" }[
                      r.action
                    ] ?? r.action}
                  </Td>
                  <Td>
                    {r.entity}
                    <span className="block font-mono text-xs text-ink3">{r.target_id}</span>
                  </Td>
                  <Td>
                    <details>
                      <summary className="cursor-pointer text-brand">Ver alterações</summary>
                      <pre className="max-w-sm overflow-auto whitespace-pre-wrap text-xs">
                        {JSON.stringify(
                          {
                            antes: r.before_data ? JSON.parse(r.before_data) : null,
                            depois: r.after_data ? JSON.parse(r.after_data) : null,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </Td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <Td colSpan={5}>Nenhum log encontrado.</Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Panel>
      )}
      <div className="flex items-center gap-4 text-sm">
        <button
          disabled={page === 1 || query.isFetching}
          onClick={() => setPage((p) => p - 1)}
          className="text-brand disabled:opacity-40"
        >
          Anterior
        </button>
        <span>Página {page}</span>
        <button
          disabled={!query.data?.hasMore || query.isFetching}
          onClick={() => setPage((p) => p + 1)}
          className="text-brand disabled:opacity-40"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
