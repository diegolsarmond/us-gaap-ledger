import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { LockKeyhole, Menu, X, SlidersHorizontal, HelpCircle, BookOpen } from "lucide-react";
import { SignOutButton } from "./sign-out-button";
import { CurrencyRateTicker } from "./currency-rate-ticker";
const groups = [
  {
    label: "Operations",
    items: ["Dashboard", "Invoices & AR", "Bills & AP", "Inventory Catalog", "Projects & Margin"],
  },
  { label: "General Ledger", items: ["Journal Entries", "Chart of Accounts", "Trial Balance"] },
  {
    label: "Financial Statements",
    items: [
      "Income Statement (P&L)",
      "Balance Sheet",
      "Cash Flow & Forecast",
      "Sales Tax Summary",
      "AR Aging Position",
    ],
  },
  {
    label: "Banking & Governance",
    items: ["Bank Feeds & Staging"],
  },
  {
    label: "Configurações",
    items: ["Perfis de acesso", "Usuários"],
  },
  {
    label: "Auditoria",
    items: ["Logs de ações"],
  },
  {
    label: "System Parameters",
    items: [
      "Modules Overview",
      "Currencies & FX Rates",
      "Tax Jurisdictions",
      "Payment Terms",
      "Cost Centers",
      "Expense Categories",
      "Fiscal Periods",
    ],
  },
];
const menuRoutes: Record<string, string> = {
  "Cash Flow & Forecast": "/cash-flow",
  "Perfis de acesso": "/access",
  Usuários: "/users",
  "Logs de ações": "/audit-log",
};
export function CashShell({
  children,
  user,
}: {
  children: ReactNode;
  user: { name: string; email: string };
}) {
  const [open, setOpen] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const [workspace, setWorkspace] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
  const branding = (
    <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line/70 px-4">
      <img
        src="/logo-interna.png"
        alt="Quantum Tecnologia"
        className="size-7 rounded-md object-contain shrink-0"
      />
      <div className="leading-tight">
        <p className="text-[13px] font-semibold tracking-tight">Quantum Tecnologia</p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink3">US GAAP Multi-Tenant</p>
      </div>
    </div>
  );
  const navigation = (
    <>
      <nav
        aria-label="Módulos"
        className="flex-1 overflow-y-auto px-2.5 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overscroll-contain"
      >
        {groups.map((g) => (
          <div
            key={g.label}
            className={
              g.label === "System Parameters"
                ? "mb-2.5 rounded-lg border border-line/50 bg-ink/[0.015] p-1"
                : "mb-2"
            }
          >
            <p className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink3">
              {g.label === "System Parameters" && (
                <SlidersHorizontal className="size-3.5 text-brand" />
              )}
              {g.label}
            </p>
            {g.items.map((label) =>
              menuRoutes[label] ? (
                <Link
                  key={label}
                  to={menuRoutes[label]}
                  activeOptions={{ exact: true }}
                  activeProps={{
                    className:
                      "mt-0.5 flex items-center gap-2 rounded-md bg-white/90 px-2.5 py-1.5 text-[12.5px] font-semibold text-ink ring-1 ring-line shadow-2xs",
                  }}
                  onClick={() => setOpen(false)}
                  className="mt-0.5 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] text-ink2 transition-colors hover:bg-white/60 hover:text-ink"
                >
                  <span
                    className={`size-1.5 rounded-full ${path === menuRoutes[label] ? "bg-brand" : "bg-line"}`}
                  />
                  {label}
                </Link>
              ) : (
                <button
                  key={label}
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Módulo indisponível nesta etapa"
                  className="mt-0.5 flex w-full cursor-not-allowed items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-ink3 opacity-50"
                >
                  <LockKeyhole className="size-3 shrink-0" />
                  {label}
                </button>
              ),
            )}
          </div>
        ))}
      </nav>
      <div className="mx-3 mb-3 rounded-lg bg-ink/[0.03] p-2.5 text-[11px] text-ink3 ring-1 ring-line/70">
        Fluxo de caixa, configurações e auditoria disponíveis.
        <br />
        Demais módulos indisponíveis nesta etapa.
      </div>
      <div className="px-3 pb-3">
        <button
          onClick={() => setTutorial(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-brand/20 bg-brand/10 px-2 py-1.5 text-[11.5px] font-semibold text-brand shadow-2xs"
        >
          <BookOpen className="size-3.5" />
          Guia & Tutoriais
        </button>
      </div>
    </>
  );
  return (
    <div className="flex min-h-screen w-full bg-canvas text-ink">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line/80 frost-bar md:flex">
        {branding}
        {navigation}
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-ink/40 backdrop-blur-xs"
          />
          <div className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col border-r border-line bg-canvas shadow-2xl">
            {branding}
            <button
              aria-label="Fechar menu"
              onClick={() => setOpen(false)}
              className="absolute right-2 top-4"
            >
              <X className="size-5" />
            </button>
            {navigation}
          </div>
        </div>
      )}
      <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-line/70 frost-bar px-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex md:hidden items-center justify-center size-8.5 rounded-lg border border-line bg-white/80 text-ink hover:text-brand hover:bg-white transition-colors cursor-pointer shadow-2xs shrink-0"
              aria-label="Abrir menu de navegação"
            >
              <Menu className="size-4.5" />
            </button>
            <div className="flex md:hidden items-center gap-1.5 shrink-0">
              <img
                src="/logo-interna.png"
                alt="Quantum"
                className="size-6 rounded-md object-contain shrink-0"
              />
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[12px] sm:text-[12.5px] text-ink3 truncate min-w-0">
              <span className="hidden lg:inline">Workspace</span>
              <span className="hidden lg:inline text-line">/</span>
              <span className="font-medium text-ink truncate">
                {path === "/cash-flow"
                  ? "Cash Flow & Forecast"
                  : path === "/access"
                    ? "Configurações · Perfis de acesso"
                    : path === "/audit-log"
                      ? "Auditoria · Logs de ações"
                      : path === "/users"
                        ? "Configurações · Usuários"
                        : "Workspace"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setTutorial(true)}
              className="flex items-center gap-1 sm:gap-1.5 rounded-lg border border-brand/30 bg-brand/10 hover:bg-brand/15 px-2 sm:px-2.5 py-1.5 text-brand text-[11.5px] sm:text-[12px] font-semibold transition-all shadow-2xs cursor-pointer active:scale-95 shrink-0"
              title="Abrir tutorial explicativo deste módulo"
            >
              <HelpCircle className="size-3.5 text-brand shrink-0" />
              <span className="hidden md:inline">Tutorial</span>
              <span className="rounded bg-brand/20 px-1 py-0.2 font-mono text-[9px] font-bold">
                GUIA
              </span>
            </button>
            <SignOutButton />
            <div className="relative">
              <button
                type="button"
                aria-expanded={workspace}
                onClick={() => setWorkspace(!workspace)}
                className="flex items-center gap-1.5 sm:gap-2 rounded-lg bg-white/80 px-2 sm:px-2.5 py-1.5 text-left ring-1 ring-line transition-colors hover:bg-white shadow-2xs cursor-pointer"
                title={`Workspace: ${user.name}`}
              >
                <div className="grid size-6 place-items-center rounded bg-brand/10 font-mono text-[10px] font-semibold text-brand shrink-0">
                  {initials}
                </div>
                <div className="leading-tight hidden sm:block">
                  <p className="text-[12px] font-medium text-ink truncate max-w-[95px] md:max-w-40">
                    {user.name}
                  </p>
                  <p className="text-[10px] text-ink3 truncate">Workspace pessoal</p>
                </div>
                <span className="ml-0.5 sm:ml-1 text-[10px] text-ink3">▾</span>
              </button>
              {workspace && (
                <div className="absolute right-0 top-11 z-30 w-72 max-w-[calc(100vw-24px)] rounded-lg bg-white p-3 text-xs shadow-lg ring-1 ring-line">
                  <p className="font-semibold">{user.name}</p>
                  <p className="mt-1 text-ink3">{user.email}</p>
                  <p className="mt-3 text-ink3">
                    Dados de caixa vinculados ao seu usuário. O cadastro de empresas ainda não está
                    disponível.
                  </p>
                </div>
              )}
            </div>
            <CurrencyRateTicker baseCurrency="USD" />
          </div>
        </header>
        <main className="p-3.5 sm:p-5 md:p-6 flex-1 max-w-full overflow-x-hidden">{children}</main>
        <footer className="border-t border-line/60 px-3.5 sm:px-6 py-3 text-[11px] text-ink3 flex flex-col sm:flex-row items-center justify-between gap-2 bg-canvas/80 text-center sm:text-left">
          <span>
            US GAAP Financial Platform · Client Workspace:{" "}
            <span className="font-medium text-ink">{user.name}</span>
          </span>
          <span>
            Notice: Accounting and tax reports are for internal management review prior to CPA
            sign-off.
          </span>
        </footer>
      </div>
      {tutorial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cash-guide"
            className="frost w-full max-w-lg space-y-4 p-6"
          >
            <div className="flex items-center justify-between">
              <h2 id="cash-guide" className="font-semibold">
                Guia · Fluxo de caixa
              </h2>
              <button aria-label="Fechar guia" onClick={() => setTutorial(false)}>
                <X className="size-5" />
              </button>
            </div>
            <ol className="list-decimal space-y-3 pl-5 text-sm">
              <li>Cadastre uma conta com moeda, data e saldo inicial.</li>
              <li>Registre entradas e saídas com vencimento e categoria.</li>
              <li>Ao receber ou pagar, edite para Realizado e informe a data efetiva.</li>
              <li>
                Selecione o período, agrupamento e visão. A projeção usa somente valores
                cadastrados.
              </li>
              <li>Exporte o resumo em CSV.</li>
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}
