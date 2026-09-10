import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { clients, period } from "@/lib/mock";
import { useBook } from "@/components/book-context";

const groups: { label: string; items: { to: string; label: string }[] }[] = [
  {
    label: "Workspace",
    items: [
      { to: "/", label: "Dashboard" },
      { to: "/journals", label: "Lançamentos" },
      { to: "/accounts", label: "Plano de contas" },
      { to: "/invoices", label: "Invoices" },
      { to: "/payables", label: "Accounts Payable" },
      { to: "/receivables", label: "Accounts Receivable" },
      { to: "/inventory", label: "Inventory" },
    ],
  },
  {
    label: "Reports",
    items: [
      { to: "/trial-balance", label: "Trial Balance" },
      { to: "/dre", label: "DRE · P&L" },
      { to: "/cash-flow", label: "Cash Flow" },
      { to: "/taxes", label: "Tax Filing" },
    ],
  },
  {
    label: "Operação",
    items: [
      { to: "/statements", label: "Extratos e importação" },
      { to: "/access", label: "Perfis e acessos" },
    ],
  },
];

function crumbFor(path: string) {
  for (const g of groups) {
    const found = g.items.find((i) => i.to === path);
    if (found) return found.label;
  }
  return "Dashboard";
}

export function AppShell({ children }: { children: ReactNode }) {
  const { book, clientId, setClientId } = useBook();
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen w-full bg-canvas text-ink">
      <aside className="hidden w-60 shrink-0 border-r border-line/80 frost-bar md:block">
        <div className="flex h-14 items-center gap-2.5 border-b border-line/70 px-4">
          <div className="grid size-7 place-items-center rounded-md bg-ink font-mono text-[11px] font-semibold text-white">
            LX
          </div>
          <div className="leading-tight">
            <p className="text-[13px] font-semibold tracking-tight">LedgerX</p>
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink3">US GAAP</p>
          </div>
        </div>
        <nav className="px-2.5 py-3">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="px-2 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink3 first:pt-1">
                {g.label}
              </p>
              {g.items.map((i) => (
                <Link
                  key={i.to}
                  to={i.to}
                  activeOptions={{ exact: i.to === "/" }}
                  className="mt-0.5 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink2 transition-colors hover:text-ink"
                  activeProps={{
                    className:
                      "mt-0.5 flex items-center gap-2.5 rounded-md bg-white/80 px-2.5 py-2 text-[13px] font-medium text-ink ring-1 ring-line",
                  }}
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`size-1 rounded-full ${isActive ? "bg-brand" : "bg-line"}`}
                      />
                      {i.label}
                    </>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="mx-3 mb-6 mt-3 rounded-lg bg-ink/[0.04] p-3 ring-1 ring-line/70">
          <p className="text-[11px] font-medium text-ink2">Período</p>
          <p className="text-[12px] font-semibold">{period.label}</p>
          <p className="mt-1 text-[11px] text-up">Fechado · variação $0.00</p>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line/70 frost-bar px-6">
          <div className="flex items-center gap-2 text-[13px] text-ink3">
            <span>Workspace</span>
            <span className="text-line">/</span>
            <span className="font-medium text-ink">{crumbFor(path)}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-left ring-1 ring-line transition-colors hover:bg-white"
              >
                <div className="grid size-6 place-items-center rounded bg-brand/10 font-mono text-[10px] font-semibold text-brand">
                  {book.client.initials}
                </div>
                <div className="leading-tight">
                  <p className="text-[12px] font-medium">{book.client.name}</p>
                  <p className="text-[10px] text-ink3">
                    EIN {book.client.ein} · {book.client.basis}
                  </p>
                </div>
                <span className="ml-1 text-[10px] text-ink3">▾</span>
              </button>
              {open && (
                <div className="absolute right-0 top-11 w-64 overflow-hidden rounded-lg bg-white p-1 ring-1 ring-line">
                  {clients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setClientId(c.id);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[12px] transition-colors hover:bg-panel ${
                        c.id === clientId ? "font-medium text-brand" : "text-ink2"
                      }`}
                    >
                      <span className="grid size-6 place-items-center rounded bg-panel font-mono text-[10px] ring-1 ring-line">
                        {c.initials}
                      </span>
                      <span className="flex-1">
                        {c.name}
                        <span className="block text-[10px] text-ink3">
                          {c.entity} · {c.state} · base separada
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="hidden items-center gap-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-[12px] ring-1 ring-line lg:flex">
              <span className="text-ink3">Period</span>
              <span className="font-medium">{period.code}</span>
              <span className="text-line">·</span>
              <span className="text-ink3">Base {period.base}</span>
            </div>
            <div className="grid size-8 place-items-center rounded-full bg-panel text-[11px] font-semibold ring-1 ring-line">
              CA
            </div>
          </div>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
