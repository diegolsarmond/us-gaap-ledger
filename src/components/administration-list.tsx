import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { loadAdministration, updateProfile, updateUser } from "@/lib/admin";
import type { Profile, ManagedUser } from "@/lib/admin-model";
import { PageTitle, Panel, Table, Th, Td, Badge } from "./ui-kit";
const control = "rounded-md border border-line bg-white px-3 py-2 text-sm w-full";
const button = "rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const permissions = {
  manage_users: "Gerenciar usuários",
  manage_profiles: "Gerenciar perfis",
  view_audit: "Consultar auditoria",
  write_cash: "Alterar fluxo de caixa",
} as const;
export function AdministrationList({ kind }: { kind: "users" | "profiles" }) {
  const query = useQuery({ queryKey: ["administration"], queryFn: () => loadAdministration() });
  const client = useQueryClient();
  const [editing, setEditing] = useState<ManagedUser | Profile | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const users = kind === "users";
  const allowed = users
    ? query.data?.permissions.manage_users
    : query.data?.permissions.manage_profiles;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    setNotice("");
    try {
      const base = {
        ...(editing && editing !== "new" ? { id: editing.id } : {}),
        name: String(f.get("name")),
      };
      if (users)
        await updateUser({
          data: {
            ...base,
            email: String(f.get("email")),
            profile_id: String(f.get("profile_id")),
            active: f.get("active") === "on",
            ...(f.get("password") ? { password: String(f.get("password")) } : {}),
          },
        });
      else
        await updateProfile({
          data: {
            ...base,
            manage_users: f.get("manage_users") === "on",
            manage_profiles: f.get("manage_profiles") === "on",
            view_audit: f.get("view_audit") === "on",
            write_cash: f.get("write_cash") === "on",
          },
        });
      await client.invalidateQueries({ queryKey: ["administration"] });
      setEditing(null);
      setNotice("Alterações salvas e registradas na auditoria.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setPending(false);
    }
  }
  const rows =
    (users ? query.data?.users : query.data?.profiles)?.filter((r) =>
      `${r.name} ${"email" in r ? r.email : ""}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  return (
    <div className="space-y-4">
      <PageTitle
        title={users ? "Configurações · Usuários" : "Configurações · Perfis de acesso"}
        description="Gerencie os acessos ao sistema em listas."
        actions={
          allowed ? (
            <button
              className={button}
              onClick={() => {
                setEditing("new");
                setError("");
                setNotice("");
              }}
            >
              {users ? "Novo usuário" : "Novo perfil"}
            </button>
          ) : undefined
        }
      />
      {query.isPending && <p role="status">Carregando…</p>}
      {query.isError && (
        <p role="alert">
          Não foi possível carregar. Verifique a conexão e a migração 003_access_audit.sql.{" "}
          <button onClick={() => void query.refetch()} className="underline">
            Tentar novamente
          </button>
        </p>
      )}
      {query.isSuccess && !allowed && (
        <p role="alert">Seu perfil não permite gerenciar esta lista.</p>
      )}
      {error && (
        <p role="alert" className="text-down">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-up">
          {notice}
        </p>
      )}
      {allowed && (
        <>
          <input
            aria-label="Buscar na lista"
            placeholder="Buscar por nome ou e-mail…"
            className={control}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Panel title={`${users ? "Usuários" : "Perfis de acesso"} (${rows.length})`}>
            <Table>
              <thead>
                <tr>
                  <Th>Nome</Th>
                  {users ? (
                    <>
                      <Th>E-mail</Th>
                      <Th>Perfil</Th>
                      <Th>Status</Th>
                    </>
                  ) : (
                    <>
                      <Th>Permissões</Th>
                      <Th>Usuários / manutenção</Th>
                    </>
                  )}
                  <Th>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td>{r.name}</Td>
                    {"email" in r ? (
                      <>
                        <Td>{r.email}</Td>
                        <Td>
                          {query.data?.profiles.find((p) => p.id === r.profile_id)?.name ??
                            "Sem perfil"}
                        </Td>
                        <Td>
                          <Badge tone={r.active ? "brand" : "neutral"}>
                            {r.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </Td>
                      </>
                    ) : (
                      <>
                        <Td>
                          {Object.entries(permissions)
                            .filter(([key]) => r[key as keyof typeof permissions])
                            .map(([, label]) => label)
                            .join(" · ") || "Somente consulta"}
                        </Td>
                        <Td>{r.system_admin ? "Administrador protegido" : "Personalizável"}</Td>
                      </>
                    )}
                    <Td>
                      <button
                        disabled={pending || ("system_admin" in r && r.system_admin)}
                        className="text-brand underline disabled:opacity-40"
                        onClick={() => {
                          setEditing(r);
                          setError("");
                          setNotice("");
                        }}
                      >
                        Editar
                      </button>
                    </Td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <Td colSpan={5}>Nenhum registro encontrado.</Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Panel>
          {editing && (
            <Panel title={editing === "new" ? "Novo registro" : "Editar registro"}>
              <form
                key={editing === "new" ? "new" : editing.id}
                onSubmit={submit}
                className="space-y-3 p-4"
              >
                <label className="block text-xs">
                  Nome
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                    defaultValue={editing === "new" ? "" : editing.name}
                    className={control}
                  />
                </label>
                {users ? (
                  <>
                    <label className="block text-xs">
                      E-mail
                      <input
                        name="email"
                        type="email"
                        required
                        maxLength={254}
                        defaultValue={editing !== "new" && "email" in editing ? editing.email : ""}
                        className={control}
                      />
                    </label>
                    <label className="block text-xs">
                      Perfil de acesso
                      <select
                        name="profile_id"
                        required
                        defaultValue={
                          editing !== "new" && "profile_id" in editing
                            ? (editing.profile_id ?? "")
                            : ""
                        }
                        className={control}
                      >
                        <option value="" disabled>
                          Selecione um perfil
                        </option>
                        {query.data?.profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs">
                      {editing === "new"
                        ? "Senha (mínimo de 12 caracteres)"
                        : "Nova senha (opcional)"}
                      <input
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        required={editing === "new"}
                        minLength={12}
                        maxLength={256}
                        className={control}
                      />
                    </label>
                    <label className="flex gap-2 text-sm">
                      <input
                        name="active"
                        type="checkbox"
                        defaultChecked={
                          editing === "new" || ("active" in editing && editing.active)
                        }
                      />
                      Usuário ativo
                    </label>
                  </>
                ) : (
                  <ul className="divide-y divide-line">
                    {Object.entries(permissions).map(([key, label]) => (
                      <li key={key} className="py-3">
                        <label className="flex items-center justify-between text-sm">
                          {label}
                          <input
                            type="checkbox"
                            name={key}
                            defaultChecked={
                              editing !== "new" &&
                              "system_admin" in editing &&
                              !!editing[key as keyof typeof permissions]
                            }
                          />
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <button className={button} disabled={pending}>
                    {pending ? "Salvando…" : "Salvar"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className="text-sm text-ink2"
                    onClick={() => setEditing(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
