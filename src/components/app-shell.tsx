import { Link, useRouterState } from "@tanstack/react-router";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { useAccounting, USER_PERSONAS, type UserRole } from "@/lib/accounting-store";
import { Badge } from "@/components/ui-kit";
import { useModal } from "@/components/modal-provider";
import { ChevronDown, ChevronRight, SlidersHorizontal, BookOpen, HelpCircle } from "lucide-react";
import { CurrencyRateTicker } from "@/components/currency-rate-ticker";
import { ModuleTutorialModal } from "@/components/module-tutorial-modal";

interface NavGroup {
  label: string;
  isCollapsible?: boolean;
  items: { to: string; label: string; minRole?: UserRole }[];
}

const navGroups: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { to: "/", label: "Dashboard" },
      { to: "/invoices", label: "Invoices & AR" },
      { to: "/payables", label: "Bills & AP" },
      { to: "/inventory", label: "Inventory Catalog" },
      { to: "/projects", label: "Projects & Margin" },
    ],
  },
  {
    label: "General Ledger",
    items: [
      { to: "/journals", label: "Journal Entries" },
      { to: "/accounts", label: "Chart of Accounts" },
      { to: "/trial-balance", label: "Trial Balance" },
    ],
  },
  {
    label: "Financial Statements",
    items: [
      { to: "/dre", label: "Income Statement (P&L)" },
      { to: "/balance-sheet", label: "Balance Sheet" },
      { to: "/cash-flow", label: "Cash Flow & Forecast" },
      { to: "/taxes", label: "Sales Tax Summary" },
      { to: "/receivables", label: "AR Aging Position" },
    ],
  },
  {
    label: "Banking & Governance",
    items: [
      { to: "/statements", label: "Bank Feeds & Staging" },
      { to: "/audit-log", label: "Audit Trail Log" },
      { to: "/access", label: "Roles & Tenants" },
    ],
  },
  {
    label: "System Parameters",
    isCollapsible: true,
    items: [
      { to: "/parameters", label: "Modules Overview" },
      { to: "/parameters/currencies", label: "Currencies & FX Rates" },
      { to: "/parameters/tax-jurisdictions", label: "Tax Jurisdictions" },
      { to: "/parameters/payment-terms", label: "Payment Terms" },
      { to: "/parameters/cost-centers", label: "Cost Centers" },
      { to: "/parameters/expense-categories", label: "Expense Categories" },
      { to: "/parameters/fiscal-periods", label: "Fiscal Periods" },
    ],
  },
];

function crumbFor(path: string) {
  if (path === "/parameters") return "Parameters · Modules Overview";
  if (path === "/parameters/currencies") return "Parameters · Currencies & FX Rates";
  if (path === "/parameters/tax-jurisdictions") return "Parameters · Tax Jurisdictions";
  if (path === "/parameters/payment-terms") return "Parameters · Payment Terms";
  if (path === "/parameters/cost-centers") return "Parameters · Cost Centers";
  if (path === "/parameters/expense-categories") return "Parameters · Expense Categories";
  if (path === "/parameters/fiscal-periods") return "Parameters · Fiscal Periods";

  for (const g of navGroups) {
    const found = g.items.find((i) => i.to === path);
    if (found) return found.label;
  }
  return "Dashboard";
}

export function AppShell({ children }: { children: ReactNode }) {
  const {
    activeCompany,
    companies,
    setActiveCompanyId,
    currentRole,
    setCurrentRole,
    userPersona,
    isLedgerBalanced,
    togglePeriodLock,
  } = useAccounting();

  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [autoOpenTutorial, setAutoOpenTutorial] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("quantum_auto_open_tutorial");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  const handleToggleAutoOpen = (enabled: boolean) => {
    setAutoOpenTutorial(enabled);
    try {
      localStorage.setItem("quantum_auto_open_tutorial", String(enabled));
    } catch {}
  };

  const path = useRouterState({ select: (s) => s.location.pathname });
  const prevPathRef = useRef<string>(path);

  // Abre automaticamente o tutorial do módulo ao navegar entre rotas
  useEffect(() => {
    if (autoOpenTutorial && prevPathRef.current !== path) {
      setTutorialOpen(true);
    }
    prevPathRef.current = path;
  }, [path, autoOpenTutorial]);

  // Client portal filter: Only allowed to view designated reports and statement uploads
  const filteredNavGroups = navGroups
    .map((group) => {
      if (userPersona.allowedReportsOnly) {
        if (group.label === "Financial Statements") {
          // Client portal allowed: Income Statement, Trial Balance, Cash Flow
          return {
            ...group,
            items: group.items.filter((i) =>
              ["/dre", "/trial-balance", "/cash-flow"].includes(i.to),
            ),
          };
        }
        if (group.label === "Banking & Governance") {
          // Allowed: Statements only
          return {
            ...group,
            items: group.items.filter((i) => i.to === "/statements"),
          };
        }
        if (group.label === "System Parameters") {
          // Blocked on Client Portal
          return { ...group, items: [] };
        }
        return { ...group, items: [] };
      }
      return group;
    })
    .filter((g) => g.items.length > 0);

  const modal = useModal();

  const handlePeriodLockClick = async () => {
    if (!userPersona.canClosePeriod) {
      await modal.showAlert({
        title: "Acesso Negado",
        message: "Apenas administradores da plataforma ou contadores responsáveis podem bloquear ou desbloquear períodos contábeis.",
        tone: "error",
      });
      return;
    }
    if (!activeCompany.isPeriodClosed) {
      const confirmLock = await modal.showConfirm({
        title: `Bloquear Período Contábil (${activeCompany.activePeriod})`,
        message: `Tem certeza que deseja BLOQUEAR o período ${activeCompany.activePeriod}?\n\nApós o bloqueio, novos lançamentos por usuários operacionais serão impedidos e ajustes contábeis exigirão justificativa obrigatória de auditoria.`,
        tone: "warning",
        confirmText: "Sim, Bloquear Período",
        cancelText: "Cancelar",
      });
      if (confirmLock) {
        togglePeriodLock("Procedimento normal de fechamento mensal concluído.");
        await modal.showAlert({
          title: "Período Bloqueado",
          message: `O período contábil ${activeCompany.activePeriod} foi bloqueado com sucesso.`,
          tone: "success",
        });
      }
    } else {
      const reason = await modal.showPrompt({
        title: `Desbloquear Período Contábil (${activeCompany.activePeriod})`,
        message: `Informe a justificativa formal de auditoria para reabertura do período ${activeCompany.activePeriod}:`,
        defaultValue: "Ajuste contábil pós-fechamento solicitado pelo CPA.",
        placeholder: "Motivo do desbloqueio...",
        confirmText: "Desbloquear Período",
        cancelText: "Cancelar",
      });
      if (reason) {
        togglePeriodLock(reason);
        await modal.showAlert({
          title: "Período Reaberto",
          message: `O período contábil ${activeCompany.activePeriod} foi reaberto com sucesso.\nMotivo registrado no log de auditoria: "${reason}"`,
          tone: "success",
        });
      }
    }
  };

  const [paramsMenuOpen, setParamsMenuOpen] = useState(true);

  return (
    <div className="flex min-h-screen w-full bg-canvas text-ink">
      {/* Left Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line/80 frost-bar md:flex">
        {/* Logo & Title */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line/70 px-4">
          <img
            src="/logo-interna.png"
            alt="Quantum Tecnologia"
            className="size-7 rounded-md object-contain shrink-0"
          />
          <div className="leading-tight">
            <p className="text-[13px] font-semibold tracking-tight">Quantum Tecnologia</p>
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink3">
              US GAAP Multi-Tenant
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overscroll-contain">
          {filteredNavGroups.map((g) => {
            const isCollapsible = g.isCollapsible;
            const isCurrentSection = g.items.some((i) => path === i.to || (i.to !== "/parameters" && path.startsWith(i.to)));

            if (isCollapsible) {
              return (
                <div key={g.label} className="mb-2.5 rounded-lg border border-line/50 bg-ink/[0.015] p-1">
                  <button
                    type="button"
                    onClick={() => setParamsMenuOpen((v) => !v)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink2 transition-colors hover:bg-ink/[0.04] hover:text-ink"
                  >
                    <span className="flex items-center gap-1.5">
                      <SlidersHorizontal className="size-3.5 text-brand" />
                      {g.label}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="rounded bg-brand/10 px-1 py-0.2 font-mono text-[9px] font-medium text-brand">
                        CRUDs
                      </span>
                      {paramsMenuOpen ? (
                        <ChevronDown className="size-3 text-ink3" />
                      ) : (
                        <ChevronRight className="size-3 text-ink3" />
                      )}
                    </span>
                  </button>

                  {paramsMenuOpen && (
                    <div className="mt-1 space-y-0.5 pl-1.5 border-l-2 border-brand/20 ml-2 py-0.5">
                      {g.items.map((i) => (
                        <Link
                          key={i.to}
                          to={i.to}
                          onClick={() => {
                            if (autoOpenTutorial) setTutorialOpen(true);
                          }}
                          activeOptions={{ exact: i.to === "/parameters" }}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-ink2 transition-colors hover:bg-ink/[0.03] hover:text-ink"
                          activeProps={{
                            className:
                              "flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-[12px] font-semibold text-brand ring-1 ring-line shadow-2xs",
                          }}
                        >
                          {({ isActive }) => (
                            <>
                              <span
                                className={`size-1.5 rounded-full transition-colors ${isActive ? "bg-brand ring-2 ring-brand/20" : "bg-line"
                                  }`}
                              />
                              <span className="truncate">{i.label}</span>
                            </>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div key={g.label} className="mb-2">
                <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink3">
                  {g.label}
                </p>
                {g.items.map((i) => (
                  <Link
                    key={i.to}
                    to={i.to}
                    onClick={() => {
                      if (autoOpenTutorial) setTutorialOpen(true);
                    }}
                    activeOptions={{ exact: i.to === "/" }}
                    className="mt-0.5 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] text-ink2 transition-colors hover:text-ink"
                    activeProps={{
                      className:
                        "mt-0.5 flex items-center gap-2 rounded-md bg-white/90 px-2.5 py-1.5 text-[12.5px] font-semibold text-ink ring-1 ring-line shadow-2xs",
                    }}
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={`size-1.5 rounded-full ${isActive ? "bg-brand" : "bg-line"}`}
                        />
                        {i.label}
                      </>
                    )}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>

        {/* Period Lock & Ledger Balance Status Widget */}
        <div className="mx-3 mb-3 shrink-0 rounded-lg bg-ink/[0.03] p-2.5 ring-1 ring-line/70 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-ink2">Period Status</span>
            <button
              type="button"
              onClick={handlePeriodLockClick}
              title="Click to toggle lock (Admin only)"
              className="hover:opacity-80 transition-opacity"
            >
              <Badge tone={activeCompany.isPeriodClosed ? "down" : "brand"}>
                {activeCompany.isPeriodClosed ? "Locked" : "Open"}
              </Badge>
            </button>
          </div>
          <div className="flex items-center justify-between text-[11.5px]">
            <span className="font-semibold">{activeCompany.activePeriod}</span>
            <span className="font-mono text-[10.5px] text-ink3">
              Cost: {activeCompany.costMethod === "FIFO" ? "FIFO" : "Weighted Avg"}
            </span>
          </div>
          <div className="pt-1 border-t border-line/50 flex items-center justify-between text-[10.5px]">
            <span className="text-ink3">Ledger Balance</span>
            <span
              className={`font-semibold ${isLedgerBalanced ? "text-up" : "text-down font-bold"}`}
            >
              {isLedgerBalanced ? "Balanced (Δ $0.00)" : "UNBALANCED Δ"}
            </span>
          </div>
        </div>

        {/* US GAAP CPA Disclaimer & Quick Tutorial Shortcut */}
        <div className="px-3 pb-3 space-y-2 text-[9.5px] leading-tight text-ink3">
          <button
            type="button"
            onClick={() => setTutorialOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md bg-brand/10 hover:bg-brand/15 text-brand text-[11.5px] font-semibold transition-colors cursor-pointer border border-brand/20 shadow-2xs"
          >
            <BookOpen className="size-3.5" />
            <span>Guia & Tutoriais</span>
          </button>
          <p>
            US GAAP Operational Model. Financial policies and year-end statements require approval
            by a qualified U.S. CPA.
          </p>
        </div>
      </aside>

      {/* Main Container */}
      <main className="min-w-0 flex-1 flex flex-col">
        {/* Header Bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line/70 frost-bar px-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-[12.5px] text-ink3">
            <span>Workspace</span>
            <span className="text-line">/</span>
            <span className="font-medium text-ink">{crumbFor(path)}</span>
          </div>

          {/* Right Action Tools */}
          <div className="ml-auto flex items-center gap-2.5">
            {/* Botão de Tutorial Contextual do Módulo */}
            <button
              type="button"
              onClick={() => setTutorialOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/10 hover:bg-brand/15 px-2.5 py-1.5 text-brand text-[12px] font-semibold transition-all shadow-2xs cursor-pointer active:scale-95"
              title="Abrir tutorial explicativo deste módulo com diagrama em setas"
            >
              <HelpCircle className="size-3.5 text-brand" />
              <span className="hidden sm:inline">Tutorial do Módulo</span>
              <span className="rounded bg-brand/20 px-1 py-0.2 font-mono text-[9px] font-bold">
                {autoOpenTutorial ? "AUTO" : "GUIA"}
              </span>
            </button>

            {/* Persona / Role Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setRoleDropdownOpen((v) => !v);
                  setCompanyDropdownOpen(false);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-ink/[0.04] px-2.5 py-1.5 text-left ring-1 ring-line/80 hover:bg-ink/[0.07] transition-colors"
              >
                <div className="size-2 rounded-full bg-brand" />
                <div className="leading-tight text-left">
                  <p className="text-[11.5px] font-semibold text-ink">{userPersona.name}</p>
                  <p className="text-[9.5px] text-ink3 uppercase tracking-wider">
                    {userPersona.title}
                  </p>
                </div>
                <span className="text-[10px] text-ink3 ml-1">▾</span>
              </button>

              {roleDropdownOpen && (
                <div className="absolute right-0 top-11 w-64 overflow-hidden rounded-lg bg-white p-1.5 shadow-lg ring-1 ring-line z-30">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase text-ink3">
                    Switch Test Persona (RBAC)
                  </p>
                  {(Object.keys(USER_PERSONAS) as UserRole[]).map((rKey) => {
                    const p = USER_PERSONAS[rKey];
                    const isSelected = rKey === currentRole;
                    return (
                      <button
                        key={rKey}
                        type="button"
                        onClick={() => {
                          setCurrentRole(rKey);
                          setRoleDropdownOpen(false);
                        }}
                        className={`w-full rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors hover:bg-panel flex flex-col ${isSelected ? "bg-brand/10 text-brand font-medium" : "text-ink2"
                          }`}
                      >
                        <span className="font-semibold">{p.name}</span>
                        <span className="text-[10px] text-ink3">{p.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tenant / Company Switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setCompanyDropdownOpen((v) => !v);
                  setRoleDropdownOpen(false);
                }}
                className="flex items-center gap-2 rounded-lg bg-white/80 px-2.5 py-1.5 text-left ring-1 ring-line transition-colors hover:bg-white shadow-2xs"
              >
                <div className="grid size-6 place-items-center rounded bg-brand/10 font-mono text-[10px] font-semibold text-brand">
                  {activeCompany.initials}
                </div>
                <div className="leading-tight">
                  <p className="text-[12px] font-medium text-ink">{activeCompany.name}</p>
                  <p className="text-[10px] text-ink3">
                    EIN {activeCompany.ein} · {activeCompany.entity} ({activeCompany.state})
                  </p>
                </div>
                <span className="ml-1 text-[10px] text-ink3">▾</span>
              </button>

              {companyDropdownOpen && (
                <div className="absolute right-0 top-11 w-72 overflow-hidden rounded-lg bg-white p-1 shadow-lg ring-1 ring-line z-30">
                  <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink3">
                    Select Client Workspace (Strict Isolation)
                  </p>
                  {companies.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setActiveCompanyId(c.id);
                        setCompanyDropdownOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] transition-colors hover:bg-panel ${c.id === activeCompany.id
                        ? "font-semibold text-brand bg-brand/5"
                        : "text-ink2"
                        }`}
                    >
                      <span className="grid size-6 place-items-center rounded bg-panel font-mono text-[10px] ring-1 ring-line font-medium">
                        {c.initials}
                      </span>
                      <span className="flex-1">
                        {c.name}
                        <span className="block text-[10px] text-ink3">
                          {c.entity} · {c.state} · Base USD · {c.costMethod}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Base Currency & Live FX Ticker Dropdown */}
            <CurrencyRateTicker baseCurrency={activeCompany.baseCurrency} />
          </div>
        </header>

        {/* Page Body */}
        <div className="p-6 flex-1">{children}</div>

        {/* Global Footer Disclaimer */}
        <footer className="border-t border-line/60 px-6 py-3 text-[11px] text-ink3 flex flex-wrap items-center justify-between gap-2 bg-canvas/80">
          <div>
            <span>US GAAP Financial Platform · Client Workspace: </span>
            <span className="font-medium text-ink">{activeCompany.name}</span>
            <span>
              {" "}
              ({activeCompany.entity}, {activeCompany.state})
            </span>
          </div>
          <div className="text-right">
            <span>
              Notice: Accounting and tax reports are for internal management review prior to CPA
              sign-off.
            </span>
          </div>
        </footer>
      </main>

      {/* Modal de Tutoriais Explicativos com Setas */}
      <ModuleTutorialModal
        isOpen={tutorialOpen}
        onClose={() => setTutorialOpen(false)}
        currentPath={path}
        autoOpenOnNavigate={autoOpenTutorial}
        onToggleAutoOpen={handleToggleAutoOpen}
      />
    </div>
  );
}
