import { createFileRoute, Link } from "@tanstack/react-router";

import { useAccounting } from "@/lib/parameters-context";
import { Badge, Kpi, Note, PageTitle, Panel } from "@/components/ui-kit";
import { pageHead } from "@/lib/head";

import {
  Coins,
  Scale,
  CalendarDays,
  Building2,
  Tag,
  Clock,
  SlidersHorizontal,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/parameters/")({
  head: () =>
    pageHead(
      "Parameters & Module Settings · LedgerX",
      "Manage accounting rules, currencies, taxes, payment terms, and operational settings.",
    ),
  component: ParametersIndexPage,
});

function ParametersIndexPage() {
  const {
    activeCompany,
    currencies,
    taxJurisdictions,
    paymentTerms,
    costCenters,
    expenseCategories,
    fiscalPeriods,
  } = useAccounting();

  const activeCurrenciesCount = currencies.filter((c) => c.status === "Active").length;
  const activeTaxesCount = taxJurisdictions.filter((t) => t.status === "Active").length;
  const activeTermsCount = paymentTerms.filter((p) => p.status === "Active").length;
  const activeCostCentersCount = costCenters.filter((c) => c.status === "Active").length;
  const activeCategoriesCount = expenseCategories.filter((e) => e.status === "Active").length;
  const openPeriodsCount = fiscalPeriods.filter((f) => f.status === "Open").length;

  const modules = [
    {
      id: "cash-categories",
      title: "Cash flow categories",
      subtitle: "Inflow and outflow classification",
      description: "Add global or company-specific categories for cash flow transactions.",
      to: "/parameters/cash-categories",
      icon: Tag,
      countLabel: "Global or company-specific",
      badgeTone: "brand" as const,
      tag: "Cash flow",
    },
    {
      id: "currencies",
      title: "Currencies & FX Rates",
      subtitle: "US GAAP ASC 830 · Multi-Currency & FX Rates",
      description:
        "Manage supported foreign currencies (EUR, GBP, CAD, MXN, BRL), daily exchange rates against USD (functional currency), and quotation types.",
      to: "/parameters/currencies",
      icon: Coins,
      countLabel: `${activeCurrenciesCount} active currencies`,
      badgeTone: "brand" as const,
      tag: "FX & Treasury",
    },
    {
      id: "taxes",
      title: "Tax Jurisdictions & Sales Tax",
      subtitle: "State Department of Revenue · Nexus & Rates",
      description:
        "Sales tax rates by US state (FL, TX, CA, NY, WA), filing frequency, and links to liability account 2200.",
      to: "/parameters/tax-jurisdictions",
      icon: Scale,
      countLabel: `${activeTaxesCount} active jurisdictions`,
      badgeTone: "brand" as const,
      tag: "Tax & Compliance",
    },
    {
      id: "terms",
      title: "Payment & Credit Terms",
      subtitle: "Credit Terms · Net 15, Net 30, Net 60, Early Discounts",
      description:
        "Set due dates for customer invoices (AR) and vendor bills (AP), with automatic early payment discount calculations.",
      to: "/parameters/payment-terms",
      icon: Clock,
      countLabel: `${activeTermsCount} payment terms`,
      badgeTone: "neutral" as const,
      tag: "AR / AP Terms",
    },
    {
      id: "cost-centers",
      title: "Cost Centers & Units",
      subtitle: "Departmental Accounting & Budget Control",
      description:
        "Allocate costs and revenue by department (Operations, Sales, R&D, IT), responsible manager, and annual budget limits.",
      to: "/parameters/cost-centers",
      icon: Building2,
      countLabel: `${activeCostCentersCount} cost centers`,
      badgeTone: "brand" as const,
      tag: "Cost Accounting",
    },
    {
      id: "expense-cats",
      title: "Expense Categories & Mapping",
      subtitle: "Operational Taxonomy & GL Account Mapping",
      description:
        "Map operating expenses (SaaS, Legal, Travel, Marketing) to US GAAP accounts with tax deductibility rules.",
      to: "/parameters/expense-categories",
      icon: Tag,
      countLabel: `${activeCategoriesCount} mapped categories`,
      badgeTone: "neutral" as const,
      tag: "Chart of Accounts",
    },
    {
      id: "periods",
      title: "Fiscal Periods & Accounting Calendar",
      subtitle: "Hard & Soft Period Close Governance",
      description:
        "Manage fiscal years, monthly accounting periods, cutoff dates, and closing locks to prevent retroactive changes.",
      to: "/parameters/fiscal-periods",
      icon: CalendarDays,
      countLabel: `${openPeriodsCount} open periods`,
      badgeTone: "brand" as const,
      tag: "SOX & Governance",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PageTitle
          title="Parameters & Module Settings"
          description={`Accounting and operational settings for ${activeCompany.name} (${activeCompany.entity} - ${activeCompany.state})`}
        />
      </div>

      {/* KPI Overview Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          label="Active Currencies"
          value={activeCurrenciesCount.toString()}
          hint={`Base: ${activeCompany.baseCurrency}`}
        />
        <Kpi label="Tax Jurisdictions" value={activeTaxesCount.toString()} hint="Sales Tax Nexus" />
        <Kpi label="Payment Terms" value={activeTermsCount.toString()} hint="Default: Net 30" />
        <Kpi
          label="Cost Centers"
          value={activeCostCentersCount.toString()}
          hint="Cost Allocation"
        />
        <Kpi
          label="Category Mapping"
          value={activeCategoriesCount.toString()}
          hint="Mapped to the General Ledger"
        />
        <Kpi
          label="Fiscal Periods"
          value={fiscalPeriods.length.toString()}
          hint={`Active: ${activeCompany.activePeriod}`}
        />
      </div>

      {/* Modules Cards Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.id}
              to={m.to}
              className="group relative flex flex-col justify-between rounded-xl border border-line/80 bg-white p-5 transition-all hover:border-brand/40 hover:shadow-md hover:-translate-y-0.5"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                    <Icon className="size-5" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-panel px-2 py-0.5 text-[10.5px] font-medium text-ink2 ring-1 ring-line/70">
                      {m.tag}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-[14.5px] font-bold text-ink group-hover:text-brand transition-colors">
                    {m.title}
                  </h3>
                  <p className="mt-0.5 text-[11px] font-mono text-brand/80 font-medium">
                    {m.subtitle}
                  </p>
                  <p className="mt-2 text-[12px] leading-relaxed text-ink3">{m.description}</p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-line/60 pt-3">
                <span className="text-[11.5px] font-semibold text-ink2">{m.countLabel}</span>
                <span className="flex items-center gap-1 text-[12px] font-semibold text-brand transition-transform group-hover:translate-x-1">
                  Manage <ArrowRight className="size-3.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Compliance & US GAAP Notice */}
      <Panel
        title="Parameter Governance & US GAAP Compliance"
        aside={<Badge tone="brand">Audit Rules</Badge>}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 pt-2">
          <div className="flex items-start gap-3 rounded-lg bg-canvas p-3 ring-1 ring-line/60">
            <ShieldCheck className="size-5 text-brand shrink-0 mt-0.5" />
            <div className="text-[12px]">
              <p className="font-semibold text-ink">Company Data Isolation (Multi-Tenant)</p>
              <p className="text-ink3 mt-0.5 leading-relaxed">
                All changes to currencies, tax rates, cost centers, and categories remain isolated
                within the active client company.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-canvas p-3 ring-1 ring-line/60">
            <CheckCircle2 className="size-5 text-up shrink-0 mt-0.5" />
            <div className="text-[12px]">
              <p className="font-semibold text-ink">Automatic Audit Trail</p>
              <p className="text-ink3 mt-0.5 leading-relaxed">
                Creating a parameter, updating a rate, or deleting a parameter immediately records
                an event in the SOC 1 / SOX compliance log.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-canvas p-3 ring-1 ring-line/60">
            <SlidersHorizontal className="size-5 text-ink2 shrink-0 mt-0.5" />
            <div className="text-[12px]">
              <p className="font-semibold text-ink">Immediate General Ledger Integration</p>
              <p className="text-ink3 mt-0.5 leading-relaxed">
                After exchange rates or expense accounts are updated, new invoice and bill entries
                use the updated settings automatically.
              </p>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
