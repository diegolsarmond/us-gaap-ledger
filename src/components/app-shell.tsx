import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useAccounting, USER_PERSONAS, type UserRole } from "@/lib/accounting-store";
import { Badge } from "@/components/ui-kit";

interface NavGroup {
  label: string;
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
];

function crumbFor(path: string) {
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
  const path = useRouterState({ select: (s) => s.location.pathname });

  // Client portal filter: Only allowed to view designated reports and statement uploads
  const filteredNavGroups = navGroups
    .map((group) => {
      if (userPersona.allowedReportsOnly) {
        if (group.label === "Financial Statements") {
          // Client portal allowed: Income Statement, Trial Balance, Cash Flow
          return {
            ...group,
            items: group.items.filter((i) =>
              ["/dre", "/trial-balance", "/cash-flow"].includes(i.to)
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
        return { ...group, items: [] };
      }
      return group;
    })
    .filter((g) => g.items.length > 0);

  const handlePeriodLockClick = () => {
    if (!userPersona.canClosePeriod) {
      alert("Access Denied: Only Platform or Accounting Administrators can lock or unlock accounting periods.");
      return;
    }
    if (!activeCompany.isPeriodClosed) {
      const confirmLock = window.confirm(
        `Are you sure you want to LOCK period ${activeCompany.activePeriod}? Once locked, non-admin postings are blocked and adjustments require mandatory audit override reasons.`
      );
      if (confirmLock) {
        togglePeriodLock("Normal month-end closing procedures completed.");
      }
    } else {
      const reason = window.prompt(
        `Provide an authorized reason to UNLOCK period ${activeCompany.activePeriod}:`,
        "CPA post-closing audit adjustment needed."
      );
      if (reason) {
        togglePeriodLock(reason);
      }
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-canvas text-ink">
      {/* Left Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line/80 frost-bar md:flex">
        {/* Logo & Title */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line/70 px-4">
          <div className="grid size-7 place-items-center rounded-md bg-ink font-mono text-[11px] font-semibold text-white">
            LX
          </div>
          <div className="leading-tight">
            <p className="text-[13px] font-semibold tracking-tight">LedgerX Platform</p>
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink3">US GAAP Multi-Tenant</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overscroll-contain">
          {filteredNavGroups.map((g) => (
            <div key={g.label} className="mb-2">
              <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink3">
                {g.label}
              </p>
              {g.items.map((i) => (
                <Link
                  key={i.to}
                  to={i.to}
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
          ))}
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
            <span className={`font-semibold ${isLedgerBalanced ? "text-up" : "text-down font-bold"}`}>
              {isLedgerBalanced ? "Balanced (Δ $0.00)" : "UNBALANCED Δ"}
            </span>
          </div>
        </div>

        {/* US GAAP CPA Disclaimer */}
        <div className="px-3 pb-3 text-[9.5px] leading-tight text-ink3">
          <p>
            US GAAP Operational Model. Financial policies and year-end statements require approval by a qualified U.S. CPA.
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
          <div className="ml-auto flex items-center gap-3">
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
                  <p className="text-[9.5px] text-ink3 uppercase tracking-wider">{userPersona.title}</p>
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
                        className={`w-full rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors hover:bg-panel flex flex-col ${
                          isSelected ? "bg-brand/10 text-brand font-medium" : "text-ink2"
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
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] transition-colors hover:bg-panel ${
                        c.id === activeCompany.id ? "font-semibold text-brand bg-brand/5" : "text-ink2"
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

            {/* Base Currency Badge */}
            <div className="hidden items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-[11.5px] ring-1 ring-line lg:flex">
              <span className="text-ink3">Base:</span>
              <span className="font-semibold text-ink">{activeCompany.baseCurrency}</span>
            </div>
          </div>
        </header>

        {/* Page Body */}
        <div className="p-6 flex-1">{children}</div>

        {/* Global Footer Disclaimer */}
        <footer className="border-t border-line/60 px-6 py-3 text-[11px] text-ink3 flex flex-wrap items-center justify-between gap-2 bg-canvas/80">
          <div>
            <span>US GAAP Financial Platform · Client Workspace: </span>
            <span className="font-medium text-ink">{activeCompany.name}</span>
            <span> ({activeCompany.entity}, {activeCompany.state})</span>
          </div>
          <div className="text-right">
            <span>Notice: Accounting and tax reports are for internal management review prior to CPA sign-off.</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
