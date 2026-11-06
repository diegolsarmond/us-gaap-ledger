import { useCompanies } from "./company-context";
import { CompanySwitcher } from "./company-switcher";
import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  BookOpen,
  Building,
  Building2,
  CalendarClock,
  CalendarRange,
  ChevronRight,
  Clock,
  Coins,
  CreditCard,
  FileBarChart2,
  FolderKanban,
  History,
  Landmark,
  Layers,
  LayoutDashboard,
  ListTree,
  LockKeyhole,
  MapPin,
  Menu,
  Package,
  Percent,
  PieChart,
  Receipt,
  Scale,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  Tags,
  TrendingUp,
  UploadCloud,
  UserCog,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { SignOutButton } from "./sign-out-button";
import { CurrencyRateTicker } from "./currency-rate-ticker";
import { isModuleAvailable } from "@/lib/module-availability";

interface MenuItem {
  label: string;
  route: string;
  icon: LucideIcon;
  permission?: "manage_users" | "manage_profiles" | "view_audit";
  badge?: string;
}

interface MenuGroup {
  label: string;
  description?: string;
  items: MenuItem[];
}

/**
 * 1. Functional Business Modules (Daily operations, general ledger and reports)
 */
const functionalGroups: MenuGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", route: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Operations",
    description: "Invoicing, payables, inventory & contacts",
    items: [
      { label: "Invoices & AR", route: "/invoices", icon: Receipt },
      { label: "Bills & AP", route: "/payables", icon: CreditCard },
      { label: "Customers", route: "/customers", icon: Users },
      { label: "Vendors", route: "/vendors", icon: Building2 },
      { label: "Inventory Catalog", route: "/inventory", icon: Package },
      { label: "Projects & Margin", route: "/projects", icon: FolderKanban },
    ],
  },
  {
    label: "General Ledger",
    description: "Journals and chart of accounts",
    items: [
      { label: "Journal Entries", route: "/journals", icon: BookOpen },
      { label: "Chart of Accounts", route: "/accounts", icon: ListTree },
      { label: "Trial Balance", route: "/trial-balance", icon: Scale },
    ],
  },
  {
    label: "Financial Statements",
    description: "Financial statements, P&L & balance sheet",
    items: [
      { label: "Income Statement (P&L)", route: "/dre", icon: TrendingUp },
      { label: "Balance Sheet", route: "/balance-sheet", icon: Landmark },
      { label: "Cash Flow & Forecast", route: "/cash-flow", icon: Wallet },
      { label: "Sales Tax Summary", route: "/taxes", icon: Percent },
      { label: "AR Aging Position", route: "/receivables", icon: Clock },
    ],
  },
  {
    label: "Banking & Reports",
    description: "Bank feeds, staging & report builder",
    items: [
      { label: "Bank Feeds & Staging", route: "/statements", icon: Building },
      { label: "Report Builder", route: "/reports", icon: FileBarChart2 },
    ],
  },
];

/**
 * 2. Global System Settings (Multi-tenant governance, security, audit and US GAAP parameters)
 */
const settingsGroups: MenuGroup[] = [
  {
    label: "Administration & Access",
    description: "Multi-tenant governance, users & security",
    items: [
      { label: "Companies", route: "/companies", icon: Building },
      { label: "Users", route: "/users", icon: UserCog, permission: "manage_users" },
      { label: "Access profiles", route: "/access", icon: ShieldCheck, permission: "manage_profiles" },
      { label: "Action logs", route: "/audit-log", icon: History, permission: "view_audit" },
      { label: "Bulk Import", route: "/imports", icon: UploadCloud },
    ],
  },
  {
    label: "System Parameters",
    description: "Tax rules, periods, currencies & dimensions",
    items: [
      { label: "Modules Overview", route: "/parameters", icon: SlidersHorizontal },
      { label: "Fiscal Periods", route: "/parameters/fiscal-periods", icon: CalendarRange },
      { label: "Currencies & FX Rates", route: "/parameters/currencies", icon: Coins },
      { label: "Tax Jurisdictions", route: "/parameters/tax-jurisdictions", icon: MapPin },
      { label: "Payment Terms", route: "/parameters/payment-terms", icon: CalendarClock },
      { label: "Cost Centers", route: "/parameters/cost-centers", icon: PieChart },
      { label: "Dimensions & Tags", route: "/dimensions", icon: Tags },
      { label: "Expense Categories", route: "/parameters/expense-categories", icon: Tag },
      { label: "Cash flow categories", route: "/parameters/cash-categories", icon: ArrowLeftRight },
    ],
  },
];

function isSettingsRoute(pathname: string): boolean {
  return settingsGroups.some((group) =>
    group.items.some(
      (item) => pathname === item.route || (item.route !== "/" && pathname.startsWith(item.route + "/")),
    ),
  );
}

function getRouteMeta(pathname: string) {
  for (const group of functionalGroups) {
    for (const item of group.items) {
      if (pathname === item.route || (item.route !== "/" && pathname.startsWith(item.route + "/"))) {
        return {
          section: "Features",
          group: group.label,
          label: item.label,
        };
      }
    }
  }
  for (const group of settingsGroups) {
    for (const item of group.items) {
      if (pathname === item.route || (item.route !== "/" && pathname.startsWith(item.route + "/"))) {
        return {
          section: "Global Settings",
          group: group.label,
          label: item.label,
        };
      }
    }
  }
  return null;
}

export function CashShell({
  children,
  user,
}: {
  children: ReactNode;
  user: { name: string; email: string };
}) {
  const { permissions, activeCompany } = useCompanies();
  const [open, setOpen] = useState(false);
  const [userTab, setUserTab] = useState<"features" | "settings" | null>(null);

  const path = useRouterState({ select: (s) => s.location.pathname });
  const currentIsSettings = isSettingsRoute(path);
  const activeSection = userTab ?? (currentIsSettings ? "settings" : "features");

  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const routeMeta = getRouteMeta(path);

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

  const currentGroups = activeSection === "features" ? functionalGroups : settingsGroups;

  const navigation = (
    <>
      {/* Section Switcher: Features vs Global Settings */}
      <div className="px-3 pt-3 pb-2 shrink-0 border-b border-line/60 bg-ink/[0.015]">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-ink/[0.05] p-1 border border-line/60">
          <button
            type="button"
            onClick={() => setUserTab("features")}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 px-2 text-[11.5px] font-medium transition-all cursor-pointer ${
              activeSection === "features"
                ? "bg-white text-ink shadow-2xs font-semibold ring-1 ring-line/70"
                : "text-ink3 hover:text-ink hover:bg-white/50"
            }`}
          >
            <Layers className="size-3.5 shrink-0" />
            <span className="truncate">Features</span>
          </button>
          <button
            type="button"
            onClick={() => setUserTab("settings")}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 px-2 text-[11.5px] font-medium transition-all cursor-pointer ${
              activeSection === "settings"
                ? "bg-white text-ink shadow-2xs font-semibold ring-1 ring-line/70"
                : "text-ink3 hover:text-ink hover:bg-white/50"
            }`}
          >
            <Settings2 className="size-3.5 shrink-0" />
            <span className="truncate">Settings</span>
          </button>
        </div>
      </div>

      <nav
        aria-label="Modules"
        className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overscroll-contain"
      >
        {/* Contextual overview banner in Global Settings */}
        {activeSection === "settings" && (
          <div className="mb-3 rounded-lg border border-line/70 bg-white/70 p-2.5 shadow-2xs">
            <div className="flex items-start gap-2">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand mt-0.5">
                <SlidersHorizontal className="size-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11.5px] font-semibold leading-tight text-ink">
                  Global Settings
                </p>
                <p className="mt-0.5 text-[10px] text-ink3 leading-snug">
                  Multi-tenant environment, access control & accounting parameters
                </p>
              </div>
            </div>
          </div>
        )}

        {currentGroups.map((g) => (
          <div
            key={g.label}
            className={
              g.label === "System Parameters"
                ? "mb-3 rounded-lg border border-line/60 bg-ink/[0.015] p-1.5"
                : "mb-3"
            }
          >
            <div className="flex items-center justify-between px-2 pb-1 pt-1.5">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink3">
                {g.label === "System Parameters" && (
                  <SlidersHorizontal className="size-3 text-brand" />
                )}
                {g.label}
              </p>
            </div>
            <div className="space-y-0.5">
              {g.items
                .filter((item) => {
                  if (item.permission === "manage_users") return permissions.manage_users;
                  if (item.permission === "manage_profiles") return permissions.manage_profiles;
                  if (item.permission === "view_audit") return permissions.view_audit;
                  return true;
                })
                .map((item) => {
                  const isAvailable = isModuleAvailable(item.route);
                  const isActive = path === item.route;
                  const Icon = item.icon;

                  if (!isAvailable) {
                    return (
                      <button
                        key={item.label}
                        type="button"
                        disabled
                        aria-disabled="true"
                        title="Module unavailable at this stage"
                        className="mt-0.5 flex w-full cursor-not-allowed items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-ink3 opacity-50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className="size-3.5 shrink-0 text-ink3" />
                          <span className="truncate">{item.label}</span>
                        </div>
                        <LockKeyhole className="size-3 shrink-0 text-ink3/70" />
                      </button>
                    );
                  }

                  return (
                    <Link
                      key={item.label}
                      to={item.route}
                      activeOptions={{ exact: true }}
                      activeProps={{
                        className:
                          "mt-0.5 flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-ink shadow-2xs ring-1 ring-line/80",
                      }}
                      onClick={() => {
                        setUserTab(null);
                        setOpen(false);
                      }}
                      className="group mt-0.5 flex items-center justify-between rounded-md px-2.5 py-1.5 text-[12.5px] text-ink2 transition-colors hover:bg-white/60 hover:text-ink"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon
                          className={`size-3.5 shrink-0 transition-colors ${
                            isActive ? "text-brand" : "text-ink3 group-hover:text-ink2"
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {isActive && (
                        <span className="size-1.5 rounded-full bg-brand shrink-0" />
                      )}
                    </Link>
                  );
                })}
            </div>
          </div>
        ))}

        {/* Quick access footer shortcut in Features to jump to Global Settings */}
        {activeSection === "features" && (
          <div className="mt-4 pt-3 border-t border-line/60">
            <button
              type="button"
              onClick={() => setUserTab("settings")}
              className="group flex w-full items-center justify-between rounded-lg border border-line/60 bg-white/50 p-2.5 text-left transition-all hover:border-brand/40 hover:bg-white hover:shadow-2xs cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand group-hover:bg-brand group-hover:text-white transition-colors">
                  <SlidersHorizontal className="size-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-ink leading-tight truncate">
                    Global Settings
                  </p>
                  <p className="text-[10px] text-ink3 leading-tight truncate">
                    Companies, users and parameters
                  </p>
                </div>
              </div>
              <ChevronRight className="size-3.5 text-ink3 group-hover:translate-x-0.5 group-hover:text-brand transition-all shrink-0" />
            </button>
          </div>
        )}

        {/* Quick button to return to Features from Settings */}
        {activeSection === "settings" && (
          <div className="mt-3 pt-2 border-t border-line/60">
            <button
              type="button"
              onClick={() => setUserTab("features")}
              className="group flex w-full items-center justify-center gap-1.5 rounded-md border border-line/60 bg-white/50 py-1.5 px-2 text-[11.5px] font-medium text-ink2 hover:bg-white hover:text-brand transition-all cursor-pointer shadow-2xs"
            >
              <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
              <span>Back to Features</span>
            </button>
          </div>
        )}
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
              {routeMeta ? (
                <>
                  <span className="hidden md:inline font-medium text-ink2">
                    {routeMeta.section}
                  </span>
                  <span className="hidden md:inline text-line">/</span>
                  <span className="font-semibold text-ink truncate">{routeMeta.label}</span>
                </>
              ) : (
                <span className="font-medium text-ink truncate">Workspace</span>
              )}
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
