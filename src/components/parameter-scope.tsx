import { useState } from "react";
import { useCompanies } from "./company-context";
import type { ParameterScope } from "@/lib/accounting-engine";

export function useParameterScope() {
  const { activeCompany } = useCompanies();
  const defaults = (): ParameterScope => ({
    scope: "companies",
    companyIds: activeCompany ? [activeCompany.id] : [],
  });
  const [value, setValue] = useState<ParameterScope>(defaults);
  return {
    value,
    setValue,
    reset: (row?: ParameterScope) =>
      setValue(row?.scope ? { scope: row.scope, companyIds: row.companyIds ?? [] } : defaults()),
  };
}
export function ParameterScopeField({
  control,
}: {
  control: ReturnType<typeof useParameterScope>;
}) {
  const { companies } = useCompanies();
  return (
    <fieldset className="rounded-lg border border-line p-3 space-y-2">
      <legend className="text-xs font-semibold">Escopo do parâmetro</legend>
      <select
        aria-label="Escopo do parâmetro"
        className="w-full rounded border border-line p-2 text-sm"
        value={control.value.scope}
        onChange={(e) =>
          control.setValue({ ...control.value, scope: e.target.value as "global" | "companies" })
        }
      >
        <option value="global">Global — todas as empresas</option>
        <option value="companies">Empresas específicas</option>
      </select>
      {control.value.scope === "global" ? (
        <p className="text-xs text-ink3">
          Compartilhado com todas as empresas. Alterações afetam todas elas.
        </p>
      ) : (
        <div className="max-h-36 overflow-y-auto space-y-2">
          {companies
            .filter((c) => c.active)
            .map((c) => (
              <label key={c.id} className="flex gap-2 text-xs items-center">
                <input
                  type="checkbox"
                  checked={control.value.companyIds?.includes(c.id) ?? false}
                  onChange={(e) =>
                    control.setValue({
                      ...control.value,
                      companyIds: e.target.checked
                        ? [...(control.value.companyIds ?? []), c.id]
                        : (control.value.companyIds ?? []).filter((id) => id !== c.id),
                    })
                  }
                />
                {c.name}
              </label>
            ))}
          <p className="text-xs text-ink3">Selecione uma ou mais empresas.</p>
        </div>
      )}
    </fieldset>
  );
}
export function ParameterScopeLabel({ value }: { value: ParameterScope }) {
  const { companies, activeCompany } = useCompanies();
  return (
    <span className="text-xs">
      {value.scope === "global"
        ? "Global · Todas as empresas"
        : (value.companyIds ?? [activeCompany?.id])
            .map((id) => companies.find((c) => c.id === id)?.name ?? "Empresa sem acesso")
            .join(", ")}
    </span>
  );
}
