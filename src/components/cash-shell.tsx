import { useCompanies } from "./company-context";
import { CompanySwitcher } from "./company-switcher";
import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { LockKeyhole, Menu, X, SlidersHorizontal } from "lucide-react";
import { SignOutButton } from "./sign-out-button";
import { CurrencyRateTicker } from "./currency-rate-ticker";
import { isModuleAvailable } from "@/lib/module-availability";
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
    label: "Settings",
    items: ["Companies", "Access profiles", "Users"],
  },
  {
    label: "Audit",
    items: ["Action logs"],
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
      "Cash flow categories",
      "Fiscal Periods",
    ],
  },
];
const menuRoutes: Record<string, string> = {
  Dashboard: "/dashboard",
  "Invoices & AR": "/invoices",
  "Bills & AP": "/payables",
  "Inventory Catalog": "/inventory",
  "Projects & Margin": "/projects",
  "Journal Entries": "/journals",
  "Chart of Accounts": "/accounts",
  "Trial Balance": "/trial-balance",
  "Income Statement (P&L)": "/dre",
  "Balance Sheet": "/balance-sheet",
  "Sales Tax Summary": "/taxes",
  "AR Aging Position": "/receivables",
  "Bank Feeds & Staging": "/statements",
  Companies: "/companies",
  "Modules Overview": "/parameters",
  "Currencies & FX Rates": "/parameters/currencies",
  "Tax Jurisdictions": "/parameters/tax-jurisdictions",
  "Payment Terms": "/parameters/payment-terms",
  "Cost Centers": "/parameters/cost-centers",
  "Cash flow categories": "/parameters/cash-categories",
  "Expense Categories": "/parameters/expense-categories",
  "Fiscal Periods": "/parameters/fiscal-periods",
  "Cash Flow & Forecast": "/cash-flow",
  "Access profiles": "/access",
  Users: "/users",
  "Action logs": "/audit-log",
};
export function CashShell({
  children,
  user,
}: {
  children: ReactNode;
  user: { name: string; email: string };
}) {
  const { permissions, activeCompany } = useCompanies();
  const [open, setOpen] = useState(false);
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
        src="/world-business.svg"
        alt="World Business"
        className="size-7 rounded-md object-contain shrink-0"
      />
      <div className="leading-tight">
        <p className="text-[13px] font-semibold tracking-tight">World Business</p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-ink3">US GAAP Multi-Tenant</p>
      </div>
    </div>
  );
  const navigation = (
    <>
      <nav
        aria-label="Modules"
        className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overscroll-contain"
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
            {g.items
              .filter((label) => label !== "Users" || permissions.manage_users)
              .filter((label) => label !== "Access profiles" || permissions.manage_profiles)
              .filter((label) => label !== "Action logs" || permissions.view_audit)
              .map((label) =>
                menuRoutes[label] && isModuleAvailable(menuRoutes[label]) ? (
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
                    title="Module unavailable at this stage"
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
      <footer className="shrink-0 border-t border-line/70 p-3 space-y-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-xs font-semibold text-brand"
            aria-hidden="true"
          >
            {initials}
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[12px] font-semibold text-ink" title={user.name}>
              {user.name}
            </p>
            <p className="mt-1 truncate text-[11px] text-ink3" title={user.email}>
              {user.email}
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <SignOutButton />
        </div>
      </footer>
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
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-ink/40 backdrop-blur-xs"
          />
          <div className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col border-r border-line bg-canvas shadow-2xl">
            {branding}
            <button
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute right-2 top-4"
            >
              <X className="size-5" />
            </button>
            {navigation}
          </div>
        </div>
      )}
      <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-hidden pt-14">
        <header className="fixed top-0 left-0 right-0 md:left-64 z-20 flex h-14 items-center justify-between gap-2 border-b border-line/70 frost-bar px-3 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex md:hidden items-center justify-center size-8.5 rounded-lg border border-line bg-white/80 text-ink hover:text-brand hover:bg-white transition-colors cursor-pointer shadow-2xs shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="size-4.5" />
            </button>
            <div className="flex md:hidden items-center gap-1.5 shrink-0">
              <img
                src="/world-business.svg"
                alt="World Business"
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
                    ? "Settings · Access profiles"
                    : path === "/audit-log"
                      ? "Audit · Action logs"
                      : path === "/users"
                        ? "Settings · Users"
                        : "Workspace"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <CompanySwitcher />
            <CurrencyRateTicker baseCurrency="USD" />
          </div>
        </header>
        <main className="p-3.5 sm:p-5 md:p-6 flex-1 max-w-full overflow-x-hidden">{children}</main>
        <footer className="border-t border-line/60 px-3.5 sm:px-6 py-3 text-[11px] text-ink3 flex flex-col sm:flex-row items-center justify-between gap-2 bg-canvas/80 text-center sm:text-left">
          <span>
            US GAAP Financial Platform · Client Workspace:{" "}
            <span className="font-medium text-ink">{activeCompany?.name ?? user.name}</span>
          </span>
          <span>
            Notice: Accounting and tax reports are for internal management review prior to CPA
            sign-off.
          </span>
        </footer>
      </div>
    </div>
  );
}
