import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting } from "@/lib/accounting-store";
import { Badge, Kpi, Note, PageTitle, Panel } from "@/components/ui-kit";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import {
  Coins,
  Scale,
  CalendarDays,
  Building2,
  Tag,
  Clock,
  SlidersHorizontal,
  RotateCcw,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/parameters/")({
  head: () =>
    pageHead(
      "Parâmetros & Configurações de Módulos · LedgerX",
      "Central de parametrização e governança operacional para regras contábeis, moedas, tributos e prazos.",
    ),
  component: ParametersIndexPage,
});

function ParametersIndexPage() {
  const modal = useModal();
  const {
    activeCompany,
    currencies,
    taxJurisdictions,
    paymentTerms,
    costCenters,
    expenseCategories,
    fiscalPeriods,
    resetParametersToDefault,
    userPersona,
  } = useAccounting();

  const [resetting, setResetting] = useState(false);

  const activeCurrenciesCount = currencies.filter((c) => c.status === "Active").length;
  const activeTaxesCount = taxJurisdictions.filter((t) => t.status === "Active").length;
  const activeTermsCount = paymentTerms.filter((p) => p.status === "Active").length;
  const activeCostCentersCount = costCenters.filter((c) => c.status === "Active").length;
  const activeCategoriesCount = expenseCategories.filter((e) => e.status === "Active").length;
  const openPeriodsCount = fiscalPeriods.filter((f) => f.status === "Open").length;

  const handleResetDefaults = async () => {
    if (!userPersona.canClosePeriod && !userPersona.canManageUsers) {
      await modal.showAlert({
        title: "Acesso Negado",
        message: "Apenas administradores ou contadores responsáveis podem restaurar configurações padrão.",
        tone: "error",
      });
      return;
    }

    const confirmed = await modal.showConfirm({
      title: "Restaurar Parâmetros Padrão",
      message: `Deseja restaurar todos os parâmetros da empresa "${activeCompany.name}" para os padrões recomendados de mercado?\n\nConfigurações customizadas adicionadas serão substituídas pela matriz de referência US GAAP.`,
      tone: "warning",
      confirmText: "Sim, Restaurar Padrões",
      cancelText: "Cancelar",
    });

    if (confirmed) {
      setResetting(true);
      resetParametersToDefault();
      setResetting(false);
      await modal.showAlert({
        title: "Parâmetros Restaurados",
        message: "Os parâmetros e tabelas de referência foram restabelecidos com êxito.",
        tone: "success",
      });
    }
  };

  const modules = [
    {
      id: "currencies",
      title: "Currencies & FX Rates",
      subtitle: "US GAAP ASC 830 · Multi-Currency & FX Rates",
      description:
        "Cadastro de moedas estrangeiras suportadas (EUR, GBP, CAD, MXN, BRL), taxas de paridade diária frente ao USD (moeda funcional) e tipo de cotação.",
      to: "/parameters/currencies",
      icon: Coins,
      countLabel: `${activeCurrenciesCount} moedas ativas`,
      badgeTone: "brand" as const,
      tag: "FX & Treasury",
    },
    {
      id: "taxes",
      title: "Tax Jurisdictions & Sales Tax",
      subtitle: "State Department of Revenue · Nexus & Rates",
      description:
        "Alíquotas de imposto sobre vendas por estado americano (FL, TX, CA, NY, WA), frequência de recolhimento oficial e vínculo com a conta de passivo 2200.",
      to: "/parameters/tax-jurisdictions",
      icon: Scale,
      countLabel: `${activeTaxesCount} jurisdições ativas`,
      badgeTone: "brand" as const,
      tag: "Tax & Compliance",
    },
    {
      id: "terms",
      title: "Payment & Credit Terms",
      subtitle: "Credit Terms · Net 15, Net 30, Net 60, Early Discounts",
      description:
        "Definição de regras de vencimento para faturamento de clientes (AR) e faturas de compras a pagar (AP), com cálculo automático de descontos pontualidade.",
      to: "/parameters/payment-terms",
      icon: Clock,
      countLabel: `${activeTermsCount} prazos comerciais`,
      badgeTone: "neutral" as const,
      tag: "AR / AP Terms",
    },
    {
      id: "cost-centers",
      title: "Cost Centers & Units",
      subtitle: "Departmental Accounting & Budget Control",
      description:
        "Segmentação analítica de custos e receitas por departamento (Operações, Vendas, P&D, TI), gestor responsável e limites orçamentários anuais.",
      to: "/parameters/cost-centers",
      icon: Building2,
      countLabel: `${activeCostCentersCount} centros cadastrados`,
      badgeTone: "brand" as const,
      tag: "Cost Accounting",
    },
    {
      id: "expense-cats",
      title: "Expense Categories & Mapping",
      subtitle: "Operational Taxonomy & GL Account Mapping",
      description:
        "Mapeamento de despesas operacionais amigáveis (SaaS, Legal, Viagens, Marketing) diretamente para as contas US GAAP com dedutibilidade fiscal.",
      to: "/parameters/expense-categories",
      icon: Tag,
      countLabel: `${activeCategoriesCount} categorias mapeadas`,
      badgeTone: "neutral" as const,
      tag: "Plano de Contas",
    },
    {
      id: "periods",
      title: "Fiscal Periods & Accounting Calendar",
      subtitle: "Hard & Soft Period Close Governance",
      description:
        "Controle mensal de exercícios fiscais, calendário contábil de competência, datas de corte e travas de fechamento contra adulterações retroativas.",
      to: "/parameters/fiscal-periods",
      icon: CalendarDays,
      countLabel: `${openPeriodsCount} período em aberto`,
      badgeTone: "brand" as const,
      tag: "SOX & Governance",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PageTitle
          title="Parâmetros & Configurações de Módulos"
          description={`Governança de parâmetros contábeis e operacionais para ${activeCompany.name} (${activeCompany.entity} - ${activeCompany.state})`}
        />
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={resetting}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-white/80 px-3 py-2 text-[12px] font-semibold text-ink2 transition-colors hover:bg-white hover:text-ink shadow-2xs cursor-pointer"
          >
            <RotateCcw className="size-3.5 text-ink3" />
            <span>Restaurar Padrões Recomendados</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          label="Moedas Ativas"
          value={activeCurrenciesCount.toString()}
          hint={`Base: ${activeCompany.baseCurrency}`}
        />
        <Kpi
          label="Jurisdições Fiscais"
          value={activeTaxesCount.toString()}
          hint="Sales Tax Nexus"
        />
        <Kpi
          label="Prazos Comerciais"
          value={activeTermsCount.toString()}
          hint="Padrão: Net 30"
        />
        <Kpi
          label="Centros de Custo"
          value={activeCostCentersCount.toString()}
          hint="Alocação Analítica"
        />
        <Kpi
          label="Categorias De-Para"
          value={activeCategoriesCount.toString()}
          hint="Mapeadas no Razão"
        />
        <Kpi
          label="Períodos Fiscais"
          value={fiscalPeriods.length.toString()}
          hint={`Ativo: ${activeCompany.activePeriod}`}
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
                  <p className="mt-2 text-[12px] leading-relaxed text-ink3">
                    {m.description}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-line/60 pt-3">
                <span className="text-[11.5px] font-semibold text-ink2">
                  {m.countLabel}
                </span>
                <span className="flex items-center gap-1 text-[12px] font-semibold text-brand transition-transform group-hover:translate-x-1">
                  Acessar CRUD <ArrowRight className="size-3.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Compliance & US GAAP Notice */}
      <Panel
        title="Governança de Parâmetros e Conformidade US GAAP"
        aside={<Badge tone="brand">Regras de Auditoria</Badge>}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 pt-2">
          <div className="flex items-start gap-3 rounded-lg bg-canvas p-3 ring-1 ring-line/60">
            <ShieldCheck className="size-5 text-brand shrink-0 mt-0.5" />
            <div className="text-[12px]">
              <p className="font-semibold text-ink">Segregação por Empresa (*Multi-Tenant*)</p>
              <p className="text-ink3 mt-0.5 leading-relaxed">
                Todas as alterações em moedas, alíquotas fiscais, centros de custo e categorias ficam estritamente isoladas na empresa cliente ativa.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-canvas p-3 ring-1 ring-line/60">
            <CheckCircle2 className="size-5 text-up shrink-0 mt-0.5" />
            <div className="text-[12px]">
              <p className="font-semibold text-ink">Trilha de Auditoria Automática</p>
              <p className="text-ink3 mt-0.5 leading-relaxed">
                Qualquer criação, atualização de taxa ou exclusão de parâmetro registra instantaneamente um evento no log de conformidade SOC 1 / SOX.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-canvas p-3 ring-1 ring-line/60">
            <SlidersHorizontal className="size-5 text-ink2 shrink-0 mt-0.5" />
            <div className="text-[12px]">
              <p className="font-semibold text-ink">Integração Imediata no Razão</p>
              <p className="text-ink3 mt-0.5 leading-relaxed">
                Ao atualizar as taxas de câmbio ou contas de despesa, novos lançamentos nas faturas e contas a pagar utilizarão os novos parâmetros sem interrupção.
              </p>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
