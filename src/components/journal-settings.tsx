import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { loadJournalConfiguration, saveJournalConfiguration } from "@/lib/journals";
import { Panel } from "@/components/ui-kit";
export function JournalSettings({ companyId }: { companyId: string }) {
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["journal-config", companyId],
    queryFn: () => loadJournalConfiguration({ data: { companyId } }),
    enabled: open,
  });
  const [draft, setDraft] = useState<Awaited<ReturnType<typeof loadJournalConfiguration>> | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const data = draft ?? query.data;
  const checkbox = (label: string, checked: boolean, change: (v: boolean) => void) => (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => change(e.target.checked)} />
      {label}
    </label>
  );
  return (
    <Panel
      title="Accounting policies & access"
      aside={
        <button className="text-sm underline" onClick={() => setOpen(!open)}>
          {open ? "Hide settings" : "Configure"}
        </button>
      }
    >
      {open && (
        <div className="space-y-4 p-4">
          {query.error && <p role="alert">{query.error.message}</p>}
          {error && <p role="status">{error}</p>}
          {data && (
            <>
              <label className="block text-sm">
                Authorized opening date
                <input
                  type="date"
                  className="ml-3 border rounded p-2"
                  value={data.openingDate ?? ""}
                  onChange={(e) => setDraft({ ...data, openingDate: e.target.value || null })}
                />
              </label>
              <div className="flex flex-wrap gap-4">
                {checkbox("Require approval before posting", data.approvalRequired, (v) =>
                  setDraft({ ...data, approvalRequired: v }),
                )}
                {checkbox("Prevent creator self-approval", data.segregateApproval, (v) =>
                  setDraft({ ...data, segregateApproval: v }),
                )}
              </div>
              <p className="text-sm">
                Profile grants apply across authorized companies. Company access and accounting
                write permission are also required.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {["Access profile", "Approve", "Post", "Reverse", "Soft-close override"].map(
                        (h) => (
                          <th className="p-2 text-left" key={h}>
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.profiles.map((p, i) => (
                      <tr key={p.id}>
                        <td className="p-2">{p.name}</td>
                        {(["approve", "post", "reverse", "soft"] as const).map((k) => (
                          <td className="p-2" key={k}>
                            {checkbox(`${k} · ${p.name}`, p[k], (v) =>
                              setDraft({
                                ...data,
                                profiles: data.profiles.map((x, idx) =>
                                  idx === i ? { ...x, [k]: v } : x,
                                ),
                              }),
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm">
                Account posting rules supplement the existing Chart of Accounts. Group accounts
                cannot receive postings.
              </p>
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {[
                        "Account",
                        "Active",
                        "Posting allowed",
                        "Cost center required",
                        "Valid from",
                        "Valid to",
                      ].map((h) => (
                        <th key={h} className="p-2 text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.accounts.map((a, i) => (
                      <tr key={a.code}>
                        <td className="p-2">
                          {a.code} · {a.name}
                        </td>
                        {(["active", "postingAllowed", "costCenterRequired"] as const).map((k) => (
                          <td className="p-2" key={k}>
                            {checkbox(`${k} · ${a.code}`, a[k], (v) =>
                              setDraft({
                                ...data,
                                accounts: data.accounts.map((x, idx) =>
                                  i === idx ? { ...x, [k]: v } : x,
                                ),
                              }),
                            )}
                          </td>
                        ))}
                        {(["validFrom", "validTo"] as const).map((k) => (
                          <td className="p-2" key={k}>
                            <input
                              aria-label={`${k} ${a.code}`}
                              type="date"
                              value={a[k] ?? ""}
                              onChange={(e) =>
                                setDraft({
                                  ...data,
                                  accounts: data.accounts.map((x, idx) =>
                                    i === idx ? { ...x, [k]: e.target.value || null } : x,
                                  ),
                                })
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                disabled={busy}
                className="rounded-md border px-3 py-2 text-sm disabled:opacity-40"
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await saveJournalConfiguration({ data });
                    setDraft(null);
                    await cache.invalidateQueries({ queryKey: ["journal-config", companyId] });
                    await cache.invalidateQueries({ queryKey: ["journal-list", companyId] });
                    setError("Configuration saved.");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Unable to save configuration");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save configuration
              </button>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
