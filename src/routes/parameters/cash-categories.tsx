import { useModal } from "@/components/modal-provider";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanies } from "@/components/company-context";
import { loadCashData, saveCashCategory, deleteCashCategory } from "@/lib/cash-flow";
import type { CashCategory } from "@/lib/cash-flow-model";
import { PageTitle, Panel, Table, Th, Td } from "@/components/ui-kit";
export const Route = createFileRoute("/parameters/cash-categories")({
  head: () => ({ meta: [{ title: "Cash Flow Categories · World Business" }] }),
  component: CategoriesPage,
});
const control = "rounded-md border border-line bg-white px-3 py-2 text-sm";
function CategoriesPage() {
  const { activeCompany, companies, permissions } = useCompanies();
  const companyId = activeCompany!.id;
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["cash-flow", companyId],
    queryFn: () => loadCashData({ data: { companyId } }),
  });
  const [editing, setEditing] = useState<CashCategory | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const modal = useModal();
  async function mutate(action: () => Promise<unknown>) {
    setPending(true);
    setError("");
    try {
      await action();
      await cache.invalidateQueries({ queryKey: ["cash-flow"] });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setPending(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void mutate(() =>
      saveCashCategory({
        data: {
          companyId,
          ...(editing ? { id: editing.id } : {}),
          name: String(f.get("name")),
          company_id: String(f.get("scope")) || null,
        },
      }),
    );
  }
  return (
    <div className="space-y-5">
      <PageTitle
        title="Cash flow categories"
        description="Global categories appear in all companies. Company-specific categories appear only in the selected company."
        actions={
          <button
            disabled={pending || !permissions.write_cash}
            className={control}
            onClick={() => {
              setEditing(null);
              setOpen(true);
              setError("");
            }}
          >
            New category
          </button>
        }
      />
      <Link to="/cash-flow" className="text-brand underline">
        Back to cash flow
      </Link>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {query.isPending && <p role="status">Loading categories…</p>}
      {query.isError && (
        <p role="alert">
          Unable to load categories. Check the 007_cash_categories.sql migration.{" "}
          <button onClick={() => void query.refetch()}>Try again</button>
        </p>
      )}
      {open && (
        <Panel title={editing ? "Edit category" : "New category"}>
          <form key={editing?.id ?? "new"} onSubmit={submit} className="space-y-4 p-4">
            <fieldset disabled={pending} className="space-y-4">
              <label className="block">
                Name{" "}
                <input
                  autoFocus
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={editing?.name}
                  className={control + " block w-full"}
                />
              </label>
              <label className="block">
                Scope{" "}
                <select
                  name="scope"
                  defaultValue={editing ? (editing.company_id ?? "") : companyId}
                  className={control + " block w-full"}
                >
                  <option value="">Global — all companies</option>
                  {companies
                    .filter((c) => c.active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <p className="text-xs text-ink3">
                Global changes require write permission in all companies. Categories used in
                transactions are protected from changes and deletion.
              </p>
              <div className="flex gap-3">
                <button className={control}>{pending ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
        </Panel>
      )}
      <input
        aria-label="Search categories"
        placeholder="Search categories…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={control}
      />
      <Panel title={`Categories available for ${activeCompany!.name}`}>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Scope</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {(query.data?.categories ?? [])
              .filter((c) => c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
              .map((c) => (
                <tr key={c.id}>
                  <Td>{c.name}</Td>
                  <Td>
                    {c.company_id ? companies.find((x) => x.id === c.company_id)?.name : "Global"}
                  </Td>
                  <Td>
                    <div className="flex gap-3">
                      <button
                        disabled={pending || !permissions.write_cash}
                        onClick={() => {
                          setEditing(c);
                          setOpen(true);
                          setError("");
                        }}
                      >
                        Edit
                      </button>
                      <button
                        disabled={pending || !permissions.write_cash}
                        onClick={async () => {
                          const confirmed = await modal.showConfirm({
                            title: "Delete category?",
                            message: `Delete the category “${c.name}”? This action cannot be undone.`,
                            tone: "error",
                            confirmText: "Delete",
                            cancelText: "Cancel",
                          });
                          if (confirmed) {
                            void mutate(() =>
                              deleteCashCategory({ data: { id: c.id, companyId } }),
                            );
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            {query.isSuccess && !query.data.categories.length && (
              <tr>
                <Td colSpan={3}>No categories added yet.</Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
