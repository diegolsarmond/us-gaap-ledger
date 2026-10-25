import { useCompanies } from "@/components/company-context";
import React, { createContext, useContext, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { loadParameters, mutateParameter } from "./parameters";
import type { ParameterDomain } from "./parameters-model";
import type * as Models from "./accounting-store";
export type {
  CurrencyParam,
  TaxJurisdictionParam,
  PaymentTermParam,
  CostCenterParam,
  ExpenseCategoryParam,
  FiscalPeriodParam,
} from "./accounting-store";
type Rows = {
  currencies: Models.CurrencyParam[];
  taxJurisdictions: Models.TaxJurisdictionParam[];
  paymentTerms: Models.PaymentTermParam[];
  costCenters: Models.CostCenterParam[];
  expenseCategories: Models.ExpenseCategoryParam[];
  fiscalPeriods: Models.FiscalPeriodParam[];
};
type Methods = {
  [
    K in keyof Rows as `add${K extends "currencies" ? "Currency" : K extends "taxJurisdictions" ? "TaxJurisdiction" : K extends "paymentTerms" ? "PaymentTerm" : K extends "costCenters" ? "CostCenter" : K extends "expenseCategories" ? "ExpenseCategory" : "FiscalPeriod"}`
  ]: (value: Omit<Rows[K][number], "id">) => Promise<void>;
} & { [key: string]: any };
const Context = createContext<
  | (Rows &
      Methods & {
        activeCompany: Models.ClientCompany;
        accounts: Models.Account[];
        userPersona: { name: string; canClosePeriod: boolean; canManageUsers: boolean };
      })
  | null
>(null);
export function useAccounting() {
  const value = useContext(Context);
  if (!value) throw new Error("ParametersProvider ausente");
  return value;
}
export function ParametersProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { activeCompany } = useCompanies();
  const query = useQuery({
    queryKey: ["parameters", activeCompany?.id],
    queryFn: () => loadParameters({ data: { companyId: activeCompany!.id } }),
    enabled: !!activeCompany,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (query.error)
    return (
      <div role="alert">
        {query.error?.message}
        <button
          onClick={() => {
            void query.refetch();
            void query.refetch();
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  if (!activeCompany)
    return (
      <p>
        Nenhuma empresa disponível. Cadastre uma empresa no cadastro de empresas ou solicite acesso
        ao administrador.
      </p>
    );
  if (!query.data) return <p role="status">Carregando parâmetros…</p>;
  const data = query.data;
  const methods: Record<string, unknown> = {};
  const names: Record<ParameterDomain, string> = {
    currencies: "Currency",
    taxJurisdictions: "TaxJurisdiction",
    paymentTerms: "PaymentTerm",
    costCenters: "CostCenter",
    expenseCategories: "ExpenseCategory",
    fiscalPeriods: "FiscalPeriod",
  };
  for (const [domain, name] of Object.entries(names))
    for (const operation of ["add", "update", "delete"])
      methods[operation + name] = async (idOrValue: any, patch?: any) => {
        setError("");
        setBusy(true);
        try {
          const rows = (data as any)[domain] as any[];
          const id =
            operation === "add"
              ? domain === "currencies"
                ? idOrValue.code
                : crypto.randomUUID()
              : idOrValue;
          const value =
            operation === "add"
              ? { ...idOrValue, ...(domain === "currencies" ? {} : { id }) }
              : operation === "update"
                ? {
                    ...rows.find((r) => (domain === "currencies" ? r.code : r.id) === id),
                    ...patch,
                  }
                : undefined;
          await mutateParameter({
            data: {
              companyId: activeCompany.id,
              domain: domain as ParameterDomain,
              id,
              revision: data.revision,
              operation:
                operation === "add" ? "create" : operation === "update" ? "update" : "delete",
              value,
            },
          });
          await queryClient.invalidateQueries({ queryKey: ["parameters"] });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Falha ao salvar.");
          throw e;
        } finally {
          setBusy(false);
        }
      };
  return (
    <Context.Provider value={{ ...data, ...methods, activeCompany } as any}>
      <p className="mb-3 text-sm text-ink3">
        Parâmetros globais são compartilhados com todas as empresas. Parâmetros específicos podem
        ser vinculados a uma ou mais empresas. Os parâmetros exibidos se aplicam à empresa ativa.
      </p>
      {error && (
        <p role="alert" className="mb-4 text-down">
          {error}
        </p>
      )}
      <fieldset disabled={busy || query.isFetching} className="min-w-0">
        {children}
      </fieldset>
    </Context.Provider>
  );
}
