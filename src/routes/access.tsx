import { createFileRoute } from "@tanstack/react-router";
import { Badge, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { pageHead } from "@/lib/head";
import { clients, roles, users } from "@/lib/mock";

export const Route = createFileRoute("/access")({
  head: () =>
    pageHead(
      "Perfis de acesso e bases por cliente · LedgerX",
      "Perfis parametrizáveis por módulo, usuários internos e portal do cliente com dados segregados.",
    ),
  component: Access,
});

function Access() {
  return (
    <div className="space-y-3">
      <PageTitle
        title="Perfis e acessos"
        description="Cada cliente tem base separada; os perfis liberam módulos sem intervenção técnica."
      />

      <Panel title="Perfis de acesso" subtitle="Módulos liberados por perfil">
        <Table>
          <thead>
            <tr className="border-b border-line/60">
              <Th>Perfil</Th>
              <Th>Escopo</Th>
              <Th align="right">Usuários</Th>
              <Th>Módulos</Th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.name} className="border-b border-line/50 last:border-0">
                <Td className="font-medium">{r.name}</Td>
                <Td>
                  <Badge tone={r.scope === "Interno" ? "brand" : "neutral"}>{r.scope}</Badge>
                </Td>
                <Td align="right">{r.members}</Td>
                <Td className="text-ink2">
                  <div className="flex flex-wrap gap-1">
                    {r.modules.map((m) => (
                      <span
                        key={m}
                        className="rounded bg-white/80 px-1.5 py-0.5 text-[11px] ring-1 ring-line"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="p-4">
          <Note tone="brand">
            Clientes não lançam nada: veem relatórios e enviam extratos, sempre limitados à própria
            base.
          </Note>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Usuários" subtitle="Internos e portal do cliente">
          <Table>
            <thead>
              <tr className="border-b border-line/60">
                <Th>Nome</Th>
                <Th>E-mail</Th>
                <Th>Perfil</Th>
                <Th>Base</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.email} className="border-b border-line/50 last:border-0">
                  <Td className="font-medium">{u.name}</Td>
                  <Td className="font-mono text-[12px] text-ink2">{u.email}</Td>
                  <Td className="text-ink2">{u.role}</Td>
                  <Td className="text-ink2">{u.client}</Td>
                  <Td align="right">
                    <Badge tone={u.active ? "up" : "neutral"}>
                      {u.active ? "Ativo" : "Convite"}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>

        <Panel title="Bases contábeis" subtitle="Uma base por cliente">
          <div className="divide-y divide-line/60">
            {clients.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-7 place-items-center rounded bg-panel font-mono text-[10px] font-semibold ring-1 ring-line">
                  {c.initials}
                </span>
                <div className="leading-tight">
                  <p className="text-[12px] font-medium">{c.name}</p>
                  <p className="text-[10px] text-ink3">
                    {c.entity} · {c.state} · EIN {c.ein} · {c.basis}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
