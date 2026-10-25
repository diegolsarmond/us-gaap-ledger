import { useModal } from "@/components/modal-provider";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanies } from "@/components/company-context";
import { loadCashData, saveCashCategory, deleteCashCategory } from "@/lib/cash-flow";
import type { CashCategory } from "@/lib/cash-flow-model";
import { PageTitle, Panel, Table, Th, Td } from "@/components/ui-kit";
export const Route = createFileRoute("/parameters/cash-categories")({ component: CategoriesPage });
const control = "rounded-md border border-line bg-white px-3 py-2 text-sm";
function CategoriesPage() {
  const { activeCompany, companies, permissions } = useCompanies();
  const companyId = activeCompany!.id;
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["cash-flow", companyId],
    queryFn: () => loadCashData({ data: { companyId } }),
  });
  const [editing, setEditing] = useState<CashCategory | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const modal = useModal();
  async function mutate(action: () => Promise<unknown>) {
    setPending(true);
    setError("");
    try {
      await action();
      await cache.invalidateQueries({ queryKey: ["cash-flow"] });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setPending(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void mutate(() =>
      saveCashCategory({
        data: {
          companyId,
          ...(editing ? { id: editing.id } : {}),
          name: String(f.get("name")),
          company_id: String(f.get("scope")) || null,
        },
      }),
    );
  }
  return (
    <div className="space-y-5">
      <PageTitle
        title="Categorias do fluxo de caixa"
        description="Categorias globais aparecem em todas as empresas. Categorias específicas aparecem somente na empresa selecionada."
        actions={
          <button
            disabled={pending || !permissions.write_cash}
            className={control}
            onClick={() => {
              setEditing(null);
              setOpen(true);
              setError("");
            }}
          >
            Nova categoria
          </button>
        }
      />
      <Link to="/cash-flow" className="text-brand underline">
        Voltar ao fluxo de caixa
      </Link>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {query.isPending && <p role="status">Carregando categorias…</p>}
      {query.isError && (
        <p role="alert">
          Não foi possível carregar as categorias. Verifique a migração 007_cash_categories.sql.{" "}
          <button onClick={() => void query.refetch()}>Tentar novamente</button>
        </p>
      )}
      {open && (
        <Panel title={editing ? "Editar categoria" : "Nova categoria"}>
          <form key={editing?.id ?? "new"} onSubmit={submit} className="space-y-4 p-4">
            <fieldset disabled={pending} className="space-y-4">
              <label className="block">
                Nome{" "}
                <input
                  autoFocus
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={editing?.name}
                  className={control + " block w-full"}
                />
              </label>
              <label className="block">
                Escopo{" "}
                <select
                  name="scope"
                  defaultValue={editing ? (editing.company_id ?? "") : companyId}
                  className={control + " block w-full"}
                >
                  <option value="">Global — todas as empresas</option>
                  {companies
                    .filter((c) => c.active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <p className="text-xs text-ink3">
                Alterações globais exigem permissão de escrita em todas as empresas. Categorias
                utilizadas em lançamentos ficam protegidas contra alterações e exclusão.
              </p>
              <div className="flex gap-3">
                <button className={control}>{pending ? "Salvando…" : "Salvar"}</button>
                <button type="button" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
              </div>
            </fieldset>
          </form>
        </Panel>
      )}
      <input
        aria-label="Buscar categoria"
        placeholder="Buscar categoria…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={control}
      />
      <Panel title={`Categorias disponíveis para ${activeCompany!.name}`}>
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>Escopo</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.categories ?? [])
              .filter((c) => c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
              .map((c) => (
                <tr key={c.id}>
                  <Td>{c.name}</Td>
                  <Td>
                    {c.company_id ? companies.find((x) => x.id === c.company_id)?.name : "Global"}
                  </Td>
                  <Td>
                    <div className="flex gap-3">
                      <button
                        disabled={pending || !permissions.write_cash}
                        onClick={() => {
                          setEditing(c);
                          setOpen(true);
                          setError("");
                        }}
                      >
                        Editar
                      </button>
                      <button
                        disabled={pending || !permissions.write_cash}
                        onClick={async () => {
                          const confirmed = await modal.showConfirm({
                            title: "Excluir categoria?",
                            message: `Deseja excluir a categoria “${c.name}”? Esta ação não pode ser desfeita.`,
                            tone: "error",
                            confirmText: "Excluir",
                          });
                          if (confirmed) {
                            void mutate(() =>
                              deleteCashCategory({ data: { id: c.id, companyId } }),
                            );
                          }
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            {query.isSuccess && !query.data.categories.length && (
              <tr>
                <Td colSpan={3}>Nenhuma categoria cadastrada.</Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
