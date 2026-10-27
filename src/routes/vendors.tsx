import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccounting } from "@/lib/accounting-store";
import {
  vendorSchema,
  MAX_VENDOR_ATTACHMENT_BYTES,
  type VendorInput,
  type Vendor,
} from "@/lib/vendor-model";
import {
  listVendorAttachments,
  uploadVendorAttachment,
  downloadVendorAttachment,
  removeVendorAttachment,
} from "@/lib/vendor-attachments";

export const Route = createFileRoute("/vendors")({ component: VendorsPage });
const groups: { title: string; fields: [keyof VendorInput, string][] }[] = [
  {
    title: "1. Basic information and contact",
    fields: [
      ["displayName", "Vendor display name *"],
      ["title", "Title"],
      ["firstName", "First name"],
      ["middleName", "Middle name"],
      ["lastName", "Last name"],
      ["suffix", "Suffix"],
      ["companyName", "Company name"],
      ["printOnCheckAs", "Print on check as"],
      ["email", "Email"],
      ["phone", "Primary phone"],
      ["mobile", "Mobile"],
      ["fax", "Fax"],
      ["website", "Website (https://)"],
    ],
  },
  {
    title: "2. Address",
    fields: [
      ["streetAddress", "Street address"],
      ["city", "City"],
      ["stateProvince", "State / Province"],
      ["zipCode", "ZIP / Postal code"],
      ["country", "Country"],
    ],
  },
  {
    title: "3. Payment terms and accounting",
    fields: [["accountNumber", "Vendor account number"]],
  },
  {
    title: "4. Tax information",
    fields: [["taxId", "Tax ID / SSN / EIN / CNPJ / RFC"]],
  },
  {
    title: "5. Banking details / Payments",
    fields: [
      ["bankName", "Bank name"],
      ["routingNumber", "Routing number / ABA"],
      ["bankAccountNumber", "Bank account number"],
    ],
  },
];
const inputClass = "w-full rounded-md border border-line bg-white p-2 text-sm";
function VendorsPage() {
  const {
    activeCompany,
    vendors,
    addVendor,
    updateVendor,
    accounts,
    currencies,
    paymentTerms,
    userPersona,
  } = useAccounting();
  const [draft, setDraft] = useState<VendorInput | null>(null);
  const [editingId, setEditingId] = useState<string>();
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const writable = userPersona.canCreateJournals;
  function open(vendor?: Vendor) {
    setDraft(
      vendor
        ? vendorSchema.parse(vendor)
        : { ...vendorSchema.parse({ displayName: "New" }), displayName: "" },
    );
    setEditingId(vendor?.id);
    setError("");
    setSaved("");
  }
  function change(key: keyof VendorInput, value: string | boolean) {
    setDraft((prev) => prev && { ...prev, [key]: value });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const parsed = vendorSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    try {
      if (editingId) await updateVendor(editingId, parsed.data);
      else setEditingId(await addVendor(parsed.data));
      setSaved("Vendor saved. You can manage attachments below.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    }
  }
  function select(
    key: "paymentTermId" | "currency" | "defaultExpenseAccountCode" | "bankAccountType",
    label: string,
    options: { value: string; label: string }[],
  ) {
    const value = String(draft?.[key] ?? "");
    return (
      <label className="space-y-1 text-sm">
        {label}
        <select className={inputClass} value={value} onChange={(e) => change(key, e.target.value)}>
          <option value="">Not specified</option>
          {value && !options.some((o) => o.value === value) && (
            <option value={value}>{value} (current)</option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Vendors</h1>
          <p className="text-sm text-ink3">
            {activeCompany.name} · Only the display name is required.
          </p>
        </div>
        {writable && (
          <button
            className="rounded bg-brand px-4 py-2 text-white"
            onClick={() => {
              setDraft({ ...vendorSchema.parse({ displayName: "New" }), displayName: "" });
              setEditingId(undefined);
              setError("");
              setSaved("");
            }}
          >
            New vendor
          </button>
        )}
      </div>
      {draft ? (
        <>
          <button className="text-brand underline" onClick={() => setDraft(null)}>
            Back to list
          </button>
          <form onSubmit={save} className="space-y-4">
            <fieldset disabled={!writable} className="space-y-4">
              {groups.map((group, index) => (
                <section key={group.title} className="rounded-lg border border-line bg-white p-4">
                  <h2 className="mb-4 font-semibold">{group.title}</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {group.fields.map(([key, label]) => (
                      <label key={key} className="space-y-1 text-sm" htmlFor={key}>
                        {label}
                        <input
                          id={key}
                          className={inputClass}
                          required={key === "displayName"}
                          maxLength={
                            key === "displayName"
                              ? 120
                              : key === "website"
                                ? 500
                                : key === "email"
                                  ? 254
                                  : 300
                          }
                          type={
                            key === "email"
                              ? "email"
                              : key === "website"
                                ? "url"
                                : key === "phone" || key === "mobile" || key === "fax"
                                  ? "tel"
                                  : "text"
                          }
                          value={String(draft[key])}
                          onChange={(e) => change(key, e.target.value)}
                          autoComplete="off"
                        />
                      </label>
                    ))}
                    {index === 2 && (
                      <>
                        {select(
                          "paymentTermId",
                          "Payment terms",
                          paymentTerms
                            .filter((t) => t.status === "Active")
                            .map((t) => ({
                              value: t.id,
                              label: t.name + " (" + t.days + " days)",
                            })),
                        )}
                        {select(
                          "currency",
                          "Currency",
                          currencies
                            .filter((c) => c.status === "Active")
                            .map((c) => ({ value: c.code, label: c.code + " · " + c.name })),
                        )}
                        {select(
                          "defaultExpenseAccountCode",
                          "Default expense account",
                          accounts
                            .filter((a) =>
                              ["COGS", "Operating Expense", "Other Expense"].includes(a.type),
                            )
                            .map((a) => ({ value: a.code, label: a.code + " · " + a.name })),
                        )}
                      </>
                    )}
                    {index === 3 && (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.track1099}
                          onChange={(e) => change("track1099", e.target.checked)}
                        />
                        Track 1099 / Independent contractor (US)
                      </label>
                    )}
                    {index === 4 && (
                      <>
                        {select("bankAccountType", "Account type", [
                          { value: "Checking", label: "Checking" },
                          { value: "Savings", label: "Savings" },
                        ])}
                        <p className="text-xs text-ink3">
                          For team reference. Automatic payments require integration with a payment
                          provider.
                        </p>
                      </>
                    )}
                  </div>
                </section>
              ))}
              <section className="rounded-lg border border-line bg-white p-4">
                <h2 className="mb-3 font-semibold">6. Notes and attachments</h2>
                <label className="text-sm" htmlFor="notes">
                  Internal notes
                </label>
                <textarea
                  id="notes"
                  className={inputClass}
                  rows={4}
                  maxLength={10000}
                  value={draft.notes}
                  onChange={(e) => change("notes", e.target.value)}
                />
              </section>
              {writable && (
                <button className="rounded bg-brand px-4 py-2 text-white" type="submit">
                  Save vendor
                </button>
              )}
            </fieldset>
            {error && (
              <p role="alert" className="text-down">
                {error}
              </p>
            )}
            {saved && <p role="status">{saved}</p>}
          </form>
          {editingId ? (
            <Attachments companyId={activeCompany.id} vendorId={editingId} writable={writable} />
          ) : (
            <p className="text-sm text-ink3">
              Save the vendor to add attachments up to 20 MB each.
            </p>
          )}
        </>
      ) : (
        <>
          <label className="block text-sm">
            Search vendors
            <input
              className={inputClass}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, company, email or tax ID"
            />
          </label>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {["Display name", "Company", "Contact", "Currency", "Action"].map((h) => (
                    <th className="p-3" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vendors
                  .filter((v) =>
                    [v.displayName, v.companyName, v.email, v.taxId]
                      .join(" ")
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((v) => (
                    <tr key={v.id} className="border-t border-line">
                      <td className="p-3">{v.displayName}</td>
                      <td className="p-3">{v.companyName || "—"}</td>
                      <td className="p-3">{v.email || v.phone || "—"}</td>
                      <td className="p-3">{v.currency || "—"}</td>
                      <td className="p-3">
                        <button className="text-brand underline" onClick={() => open(v)}>
                          {writable ? "Edit" : "View details"}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!vendors.length && (
              <p className="p-4 text-sm text-ink3">No vendors registered for this company.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
function Attachments({
  companyId,
  vendorId,
  writable,
}: {
  companyId: string;
  vendorId: string;
  writable: boolean;
}) {
  const client = useQueryClient();
  const key = ["vendor-attachments", companyId, vendorId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => listVendorAttachments({ data: { companyId, vendorId } }),
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await client.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to process attachment.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-lg border border-line bg-white p-4">
      <h2 className="font-semibold">Attachments</h2>
      <p className="text-sm text-ink3">
        W-9, W-8BEN, contracts and price lists. Up to 20 MB per file.
      </p>
      {writable && (
        <label className="block text-sm">
          Add file
          <input
            className="block"
            type="file"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void action(async () => {
                if (!file.size || file.size > MAX_VENDOR_ATTACHMENT_BYTES)
                  throw new Error("Select a non-empty file up to 20 MB.");
                const content = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result).split(",")[1]!);
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                });
                await uploadVendorAttachment({
                  data: { companyId, vendorId, name: file.name, content },
                });
              });
            }}
          />
        </label>
      )}
      {query.isPending && <p role="status">Loading attachments…</p>}
      {query.isError && (
        <p role="alert">
          Unable to load attachments.{" "}
          <button onClick={() => void query.refetch()}>Try again</button>
        </p>
      )}
      {query.data?.map((file) => (
        <div key={file.id} className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
          </span>
          <button
            disabled={busy}
            className="text-brand underline"
            onClick={() =>
              void action(async () => {
                const result = await downloadVendorAttachment({
                  data: { companyId, vendorId, id: file.id },
                });
                const bytes = Uint8Array.from(atob(result.content), (c) => c.charCodeAt(0));
                const url = URL.createObjectURL(
                  new Blob([bytes], { type: "application/octet-stream" }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = result.name;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              })
            }
          >
            Download
          </button>
          {writable && (
            <button
              disabled={busy}
              className="text-down underline"
              onClick={() => {
                if (window.confirm("Delete this attachment?"))
                  void action(() =>
                    removeVendorAttachment({ data: { companyId, vendorId, id: file.id } }),
                  );
              }}
            >
              Delete
            </button>
          )}
        </div>
      ))}
      {busy && <p role="status">Processing attachment…</p>}
      {error && (
        <p role="alert" className="text-down">
          {error}
        </p>
      )}
    </section>
  );
}
