import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCompanies } from "@/components/company-context";
import { saveCompany } from "@/lib/companies";
import { companySchema, US_STATES, formatEin, type Company } from "@/lib/company-model";
import { PageTitle, Panel } from "@/components/ui-kit";
export const Route = createFileRoute("/companies")({ component: CompaniesPage });
const control = "w-full rounded border border-line p-2 text-sm bg-white";
function CompaniesPage() {
  const { companies, permissions, refresh, selectCompany } = useCompanies();
  const client = useQueryClient();
  const [editing, setEditing] = useState<Company | "new" | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [search, setSearch] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const raw = Object.fromEntries(f);
      const data = companySchema.parse({
        ...raw,
        ...(editing && editing !== "new" ? { id: editing.id } : {}),
        active: f.get("active") === "on",
        fiscalYearEndMonth: Number(f.get("fiscalYearEndMonth")),
      });
      const result = await saveCompany({ data });
      await refresh();
      await client.invalidateQueries({ queryKey: ["accounting"] });
      if (editing === "new" && data.active) selectCompany(result.id);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setPending(false);
    }
  }
  const value = (key: keyof Company) =>
    editing && editing !== "new" ? String(editing[key] ?? "") : "";
  return (
    <div className="space-y-4">
      <PageTitle
        title="Companies"
        description="United States companies · base currency USD"
        actions={
          permissions.manage_companies ? (
            <button
              className="bg-brand text-white rounded px-3 py-2"
              onClick={() => {
                setEditing("new");
                setError("");
              }}
            >
              New company
            </button>
          ) : undefined
        }
      />
      {error && (
        <p role="alert" className="text-down">
          {error}
        </p>
      )}
      <input
        aria-label="Search companies"
        className={control}
        placeholder="Search by name or EIN"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Panel title="Registered companies">
        <div className="divide-y divide-line">
          {companies
            .filter((c) => `${c.name} ${c.ein}`.toLowerCase().includes(search.toLowerCase()))
            .map((c) => (
              <div key={c.id} className="p-4 flex justify-between gap-3">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-ink3">
                    {c.entity} · {c.state} · {formatEin(c.ein)} · {c.active ? "Active" : "Inactive"}
                  </p>
                </div>
                {permissions.manage_companies && (
                  <button
                    className="text-brand"
                    onClick={() => {
                      setEditing(c);
                      setError("");
                    }}
                  >
                    Edit
                  </button>
                )}
              </div>
            ))}
          {!companies.length && <p className="p-4">No companies registered or authorized.</p>}
        </div>
      </Panel>
      {editing && permissions.manage_companies && (
        <Panel title={editing === "new" ? "New company" : "Edit company"}>
          <form
            key={editing === "new" ? "new" : editing.id}
            onSubmit={submit}
            className="p-4 grid sm:grid-cols-2 gap-4"
          >
            <fieldset disabled={pending} className="contents">
              {[
                ["name", "Legal name", true],
                ["tradeName", "Trade name / DBA", false],
                ["ein", "EIN (optional)", false],
                ["address", "Address", false],
                ["city", "City", false],
                ["zip", "ZIP Code", false],
                ["phone", "Phone", false],
                ["email", "Email", false],
              ].map(([name, label, required]) => (
                <label key={String(name)} className="text-sm">
                  {label}
                  <input
                    name={String(name)}
                    required={Boolean(required)}
                    maxLength={
                      name === "name" || name === "tradeName" ? 200 : name === "address" ? 300 : 120
                    }
                    type={name === "email" ? "email" : "text"}
                    defaultValue={value(name as keyof Company)}
                    className={control}
                  />
                </label>
              ))}
              <label className="text-sm">
                Legal entity type
                <select name="entity" className={control} defaultValue={value("entity") || "LLC"}>
                  {companySchema.shape.entity.options.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Federal tax classification
                <select
                  name="federalTaxClassification"
                  className={control}
                  defaultValue={value("federalTaxClassification") || "Unspecified"}
                >
                  {companySchema.shape.federalTaxClassification._def.innerType.options.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              {[
                ["state", "State of formation", true],
                ["addressState", "Address state", false],
              ].map(([name, label, required]) => (
                <label key={String(name)} className="text-sm">
                  {label}
                  <select
                    name={String(name)}
                    required={Boolean(required)}
                    defaultValue={value(name as keyof Company)}
                    className={control}
                  >
                    <option value="">Select</option>
                    {US_STATES.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="text-sm">
                Accounting basis
                <select name="basis" className={control} defaultValue={value("basis") || "Accrual"}>
                  <option value="Accrual">Accrual</option>
                  <option value="Cash">Cash</option>
                </select>
              </label>
              <label className="text-sm">
                Fiscal year-end month
                <select
                  name="fiscalYearEndMonth"
                  className={control}
                  defaultValue={value("fiscalYearEndMonth") || "12"}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={editing === "new" || editing.active}
                />{" "}
                Active company
              </label>
              <p className="text-xs text-ink3">
                EIN is validated for format only. A new company starts without accounts, parameters,
                balances or transactions.
              </p>
              <div className="flex gap-4">
                <button disabled={pending} className="bg-brand text-white rounded px-3 py-2">
                  {pending ? "Saving…" : "Save"}
                </button>
                <button type="button" disabled={pending} onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
        </Panel>
      )}
    </div>
  );
}
