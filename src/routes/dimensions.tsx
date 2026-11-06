import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AccountingProvider, useAccounting } from "@/lib/accounting-store";
import { dimensionSchema, recommendedDimensions, type Dimension } from "@/lib/dimensions";
import { PageTitle, Panel } from "@/components/ui-kit";

export const Route = createFileRoute("/dimensions")({
  component: () => (
    <AccountingProvider>
      <DimensionsPage />
    </AccountingProvider>
  ),
});
const control = "mt-1 w-full rounded-md border border-line bg-white p-2 text-sm";
const button =
  "rounded-md border border-line px-3 py-2 text-xs hover:bg-brand/5 disabled:opacity-50";
const emptyDimension = (): Dimension => ({
  id: crypto.randomUUID(),
  code: "",
  name: "",
  status: "Active",
  required: false,
  applyInvoices: true,
  applyBills: true,
  options: [{ id: crypto.randomUUID(), code: "", name: "", status: "Active" }],
});
function DimensionsPage() {
  const { dimensions, saveDimension, userPersona, activeCompany } = useAccounting();
  const [draft, setDraft] = useState<Dimension | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingTemplates, setPendingTemplates] = useState<Dimension[] | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await saveDimension(dimensionSchema.parse(draft));
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save dimension.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <Link to="/parameters" className="text-xs text-brand underline">
        Back to Parameters
      </Link>
      <PageTitle
        title="Management dimensions & tags"
        description={`Create fields and reusable options for ${activeCompany.name}. Classify revenue and expenses without adding GL accounts.`}
        actions={
          userPersona.canCreateJournals && (
            <button
              className={button}
              onClick={() => {
                setDraft(emptyDimension());
                setError("");
              }}
            >
              New dimension
            </button>
          )
        }
      />
      {error && (
        <p role="alert" className="text-sm text-down">
          {error}
        </p>
      )}
      {!dimensions.length && (
        <Panel title="Start with your three dimensions">
          <div className="p-4 space-y-3 text-sm">
            <p>
              Product category · Transport mode · Operation type. Review and save each dimension
              before use.
            </p>
            {userPersona.canCreateJournals && (
              <button
                className={button}
                onClick={() => {
                  const templates = recommendedDimensions();
                  setPendingTemplates(templates.slice(1));
                  setDraft(templates[0]!);
                }}
              >
                Review recommended dimensions
              </button>
            )}
          </div>
        </Panel>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {dimensions.map((d) => (
          <Panel
            key={d.id}
            title={d.name}
            subtitle={`${d.code} · ${d.status}${d.required ? " · Required on P&L lines" : " · Optional"}`}
          >
            <div className="p-4 space-y-3 text-sm">
              <p>
                {[d.applyInvoices && "Invoices", d.applyBills && "Vendor bills"]
                  .filter(Boolean)
                  .join(" · ") || "No documents enabled"}
              </p>
              <div className="flex flex-wrap gap-2">
                {d.options.map((o) => (
                  <span className="rounded bg-brand/5 px-2 py-1 text-xs" key={o.id}>
                    {o.name}
                    {o.status === "Inactive" ? " (archived)" : ""}
                  </span>
                ))}
              </div>
              {userPersona.canCreateJournals && (
                <button
                  className={button}
                  onClick={() => {
                    setDraft(structuredClone(d));
                    setError("");
                  }}
                >
                  Edit dimension & options
                </button>
              )}
            </div>
          </Panel>
        ))}
      </div>
      {pendingTemplates?.length && !draft ? (
        <button
          className={button}
          onClick={() => {
            setDraft(pendingTemplates[0]!);
            setPendingTemplates(pendingTemplates.slice(1));
          }}
        >
          Review next recommended dimension
        </button>
      ) : null}
      {draft && (
        <Panel
          title="Dimension settings"
          subtitle="Archive used fields and options to preserve historical classifications."
        >
          <form onSubmit={save} className="p-4 space-y-4">
            <fieldset disabled={busy} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs">
                  Code
                  <input
                    required
                    maxLength={120}
                    className={control}
                    value={draft.code}
                    onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  />
                </label>
                <label className="text-xs">
                  Field name
                  <input
                    required
                    maxLength={200}
                    className={control}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-5 text-sm">
                {(
                  [
                    ["applyInvoices", "Show on invoices"],
                    ["applyBills", "Show on vendor bills"],
                    ["required", "Required on new revenue / expense lines"],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={draft[field]}
                      onChange={(e) => setDraft({ ...draft, [field]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <label className="text-xs">
                Status
                <select
                  className={control}
                  value={draft.status}
                  onChange={(e) =>
                    setDraft({ ...draft, status: e.target.value as Dimension["status"] })
                  }
                >
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </label>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Selectable options</h3>
                {draft.options.map((o, i) => (
                  <div
                    key={o.id}
                    className="grid gap-2 sm:grid-cols-[1fr_2fr_1fr] rounded border border-line p-2"
                  >
                    <input
                      aria-label={`Option ${i + 1} code`}
                      required
                      maxLength={120}
                      placeholder="Code"
                      className={control}
                      value={o.code}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          options: draft.options.map((v) =>
                            v.id === o.id ? { ...v, code: e.target.value } : v,
                          ),
                        })
                      }
                    />
                    <input
                      aria-label={`Option ${i + 1} name`}
                      required
                      maxLength={200}
                      placeholder="Option name"
                      className={control}
                      value={o.name}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          options: draft.options.map((v) =>
                            v.id === o.id ? { ...v, name: e.target.value } : v,
                          ),
                        })
                      }
                    />
                    <select
                      aria-label={`Option ${i + 1} status`}
                      className={control}
                      value={o.status}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          options: draft.options.map((v) =>
                            v.id === o.id
                              ? { ...v, status: e.target.value as "Active" | "Inactive" }
                              : v,
                          ),
                        })
                      }
                    >
                      <option>Active</option>
                      <option>Inactive</option>
                    </select>
                  </div>
                ))}
                <button
                  type="button"
                  className={button}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      options: [
                        ...draft.options,
                        { id: crypto.randomUUID(), code: "", name: "", status: "Active" },
                      ],
                    })
                  }
                >
                  Add option
                </button>
              </div>
              <div className="flex gap-2">
                <button type="submit" className={button}>
                  Save dimension
                </button>
                <button type="button" className={button} onClick={() => setDraft(null)}>
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
