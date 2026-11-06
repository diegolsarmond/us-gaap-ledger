import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountingProvider, useAccounting } from "@/lib/accounting-store";
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

export const Route = createFileRoute("/vendors")({
  component: () => (
    <AccountingProvider>
      <VendorsPage />
    </AccountingProvider>
  ),
});
const inputClass = "w-full rounded-md border border-line bg-white p-2 text-sm";
const countryCodes =
  "AF AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW".split(
    " ",
  );
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const countryOptions = countryCodes
  .map((code) => ({ value: code, label: regionNames.of(code) || code }))
  .sort((a, b) => a.label.localeCompare(b.label));
function blankVendor(): VendorInput {
  return {
    ...vendorSchema.parse({ displayName: "New", companyName: "New" }),
    displayName: "",
    companyName: "",
  };
}
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
  const [customColumn, setCustomColumn] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [pending, setPending] = useState(false);
  const writable = userPersona.canCreateJournals;
  const customNames = [
    ...new Set(vendors.flatMap((v) => (v.customFields || []).map((f) => f.name))),
  ].sort();
  function open(vendor?: Vendor) {
    setDraft(
      vendor
        ? {
            ...blankVendor(),
            ...vendor,
            addressLines: vendor.addressLines || [],
            customFields: vendor.customFields || [],
          }
        : blankVendor(),
    );
    setEditingId(vendor?.id);
    setError("");
    setSaved("");
  }
  function change<K extends keyof VendorInput>(key: K, value: VendorInput[K]) {
    setDraft((previous) => previous && { ...previous, [key]: value });
    setSaved("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError("");
    setSaved("");
    const parsed = vendorSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" "));
      return;
    }
    setPending(true);
    try {
      if (editingId) await updateVendor(editingId, parsed.data);
      else setEditingId(await addVendor(parsed.data));
      setDraft(parsed.data);
      setSaved("Vendor saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setPending(false);
    }
  }
  function field(key: keyof VendorInput, label: string, type = "text") {
    const required = key === "displayName" || key === "companyName";
    const numeric = ["costRate", "billingRate", "sourceOpenBalance"].includes(key);
    return (
      <label key={key} className="space-y-1 text-sm" htmlFor={key}>
        {label}
        {required ? " *" : ""}
        <input
          id={key}
          className={inputClass}
          required={required}
          type={type}
          step={numeric ? "0.01" : undefined}
          min={key === "costRate" || key === "billingRate" ? 0 : undefined}
          inputMode={key === "routingNumber" || key === "bankAccountNumber" ? "numeric" : undefined}
          pattern={
            key === "routingNumber"
              ? "[0-9]{9}"
              : key === "bankAccountNumber"
                ? "[0-9]{5,17}"
                : undefined
          }
          maxLength={
            key === "displayName"
              ? 120
              : key === "email"
                ? 254
                : key === "cc" || key === "bcc"
                  ? 2000
                  : key === "website"
                    ? 500
                    : key === "routingNumber"
                      ? 9
                      : key === "bankAccountNumber"
                        ? 17
                        : 300
          }
          value={String(draft?.[key] ?? "")}
          autoComplete="off"
          onChange={(e) =>
            change(
              key,
              numeric
                ? e.target.value === ""
                  ? null
                  : Number(e.target.value)
                : e.target.value || (key === "sourceBalanceDate" ? null : ""),
            )
          }
        />
      </label>
    );
  }
  function select(
    key: "country" | "paymentTermId" | "defaultExpenseAccountCode" | "bankAccountType",
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
  const customValue = (vendor: Vendor) => vendor.customFields?.find((f) => f.name === customColumn);
  const visible = vendors
    .filter((v) =>
      [
        v.displayName,
        v.companyName,
        v.email,
        v.taxId,
        ...(v.customFields || []).flatMap((f) => [f.name, f.value]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      if (sortBy === "custom" && customColumn) {
        const av = customValue(a),
          bv = customValue(b);
        if (av?.type === "Number" && bv?.type === "Number" && av.value && bv.value)
          return Number(av.value) - Number(bv.value);
        return (av?.value || "").localeCompare(bv?.value || "", undefined, { numeric: true });
      }
      return a.displayName.localeCompare(b.displayName);
    });
  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Vendors</h1>
          <p className="text-sm text-ink3">
            {activeCompany.name} · Company name and vendor display name are required.
          </p>
        </div>
        {writable && (
          <button className="rounded bg-brand px-4 py-2 text-white" onClick={() => open()}>
            New vendor
          </button>
        )}
      </div>
      {draft ? (
        <>
          <button
            type="button"
            className="text-brand underline"
            disabled={pending}
            onClick={() => setDraft(null)}
          >
            Back to list
          </button>
          <form onSubmit={save} className="space-y-4">
            <fieldset disabled={!writable || pending} className="space-y-4">
              <section className="space-y-4 rounded-lg border border-line bg-white p-4">
                <h2 className="font-semibold">1. Identification, Name and Contact</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {field("companyName", "Company name")}
                  {field("displayName", "Vendor display name")}
                  {field("title", "Title")}
                  {field("firstName", "First name")}
                  {field("middleName", "Middle name")}
                  {field("lastName", "Last name")}
                  {field("suffix", "Suffix")}
                  {field("email", "Email", "email")}
                  {field("cc", "Cc")}
                  {field("bcc", "Bcc")}
                  {field("phone", "Phone number", "tel")}
                  {field("mobile", "Mobile number", "tel")}
                  {field("fax", "Fax", "tel")}
                  {field("otherContact", "Other")}
                  {field("printOnCheckAs", "Name to print on checks")}
                  {field("website", "Website", "url")}
                  {field("streetAddress", "Street address 1")}
                  {field("streetAddress2", "Street address 2")}
                  <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                    {draft.addressLines.map((line, index) => (
                      <div key={index} className="flex items-end gap-2">
                        <label className="flex-1 text-sm">
                          Address line {index + 3}
                          <input
                            className={inputClass}
                            value={line.line}
                            maxLength={300}
                            required
                            onChange={(e) =>
                              change(
                                "addressLines",
                                draft.addressLines.map((r, i) =>
                                  i === index ? { line: e.target.value } : r,
                                ),
                              )
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="text-down underline"
                          onClick={() =>
                            change(
                              "addressLines",
                              draft.addressLines.filter((_, i) => i !== index),
                            )
                          }
                        >
                          Remove line {index + 3}
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-brand underline"
                      disabled={draft.addressLines.length >= 10}
                      onClick={() => change("addressLines", [...draft.addressLines, { line: "" }])}
                    >
                      Add lines
                    </button>
                  </div>
                  {field("city", "City")}
                  {field("stateProvince", "State / Province")}
                  {field("zipCode", "ZIP code")}
                  <div className="text-sm">
                    <span>Preview address</span>
                    <address className="mt-1 whitespace-pre-line rounded bg-canvas p-3 not-italic">
                      {[
                        draft.streetAddress,
                        draft.streetAddress2,
                        ...draft.addressLines.map((r) => r.line),
                        [draft.city, draft.stateProvince, draft.zipCode].filter(Boolean).join(", "),
                        countryOptions.find((c) => c.value === draft.country)?.label ||
                          draft.country,
                      ]
                        .filter(Boolean)
                        .join("\n") || "Enter an address to preview."}
                    </address>
                  </div>
                  {select("country", "Country", countryOptions)}
                </div>
              </section>
              <section className="space-y-4 rounded-lg border border-line bg-white p-4">
                <h2 className="font-semibold">2. Notes, Attachments and Bill Pay ACH info</h2>
                <label className="block space-y-1 text-sm">
                  Notes
                  <textarea
                    className={inputClass}
                    rows={4}
                    maxLength={10000}
                    value={draft.notes}
                    onChange={(e) => change("notes", e.target.value)}
                  />
                </label>
                {editingId ? (
                  <Attachments
                    companyId={activeCompany.id}
                    vendorId={editingId}
                    writable={writable && !pending}
                  />
                ) : (
                  <p className="text-sm text-ink3">
                    Attachments: save the vendor to add documents up to 20 MB each.
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  {field("bankAccountNumber", "Bank account number")}
                  {field("routingNumber", "Routing number")}
                </div>
                {draft.email ? (
                  <a
                    className="inline-block text-brand underline"
                    href={`mailto:${encodeURIComponent(draft.email)}?subject=${encodeURIComponent("Payment information request — " + activeCompany.name)}&body=${encodeURIComponent("Hello,\n\nPlease contact our accounting team to arrange a secure way to provide your payment information. Please do not send banking details by email.\n\nThank you,\n" + activeCompany.name)}`}
                  >
                    Ask vendor for payment info
                  </a>
                ) : (
                  <p className="text-sm text-ink3">
                    Add a vendor email to prepare a payment information request.
                  </p>
                )}
                <p className="text-xs text-ink3">
                  Opens a draft in your email application. Requests are not sent automatically; a
                  secure collection link is not configured.
                </p>
                <details>
                  <summary className="cursor-pointer text-sm">Additional bank details</summary>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {field("bankName", "Bank name")}
                    {select("bankAccountType", "Bank account type", [
                      { value: "Checking", label: "Checking" },
                      { value: "Savings", label: "Savings" },
                    ])}
                  </div>
                </details>
              </section>
              <section className="space-y-4 rounded-lg border border-line bg-white p-4">
                <h2 className="font-semibold">
                  3. Additional Info, Payments, Accounting &amp; Custom Fields
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {field("taxId", "Business ID No. / Social Security No.")}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.track1099}
                      onChange={(e) => change("track1099", e.target.checked)}
                    />
                    Track payments for 1099
                  </label>
                  {field("costRate", "Cost rate (/hr)", "number")}
                  {field("billingRate", "Billing rate (/hr)", "number")}
                  {select(
                    "paymentTermId",
                    "Terms",
                    paymentTerms
                      .filter((t) => t.status === "Active")
                      .map((t) => ({ value: t.id, label: t.name + " (" + t.days + " days)" })),
                  )}
                  {field("accountNumber", "Account no.")}
                  {select(
                    "defaultExpenseAccountCode",
                    "Default expense category",
                    accounts
                      .filter((a) =>
                        ["COGS", "Operating Expense", "Other Expense"].includes(a.type),
                      )
                      .map((a) => ({ value: a.code, label: a.code + " · " + a.name })),
                  )}
                  {field("sourceOpenBalance", "Opening balance", "number")}
                  {field("sourceBalanceDate", "As of (Opening balance date)", "date")}
                </div>
                <p className="text-xs text-ink3">
                  Opening balance is a historical source value. Saving it does not create a bill or
                  journal entry. An unknown source date may remain blank.
                </p>
                <div className="space-y-3">
                  <h3 className="font-medium">Custom fields</h3>
                  <datalist id="vendor-custom-field-names">
                    {customNames.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  {draft.customFields.map((custom, index) => (
                    <div
                      key={index}
                      className="grid items-end gap-3 rounded border border-line p-3 sm:grid-cols-4"
                    >
                      <label className="text-sm">
                        Field name
                        <input
                          className={inputClass}
                          list="vendor-custom-field-names"
                          required
                          maxLength={120}
                          value={custom.name}
                          onChange={(e) =>
                            change(
                              "customFields",
                              draft.customFields.map((f, i) =>
                                i === index ? { ...f, name: e.target.value } : f,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="text-sm">
                        Type
                        <select
                          className={inputClass}
                          value={custom.type}
                          onChange={(e) =>
                            change(
                              "customFields",
                              draft.customFields.map((f, i) =>
                                i === index
                                  ? { ...f, type: e.target.value as typeof f.type, value: "" }
                                  : f,
                              ),
                            )
                          }
                        >
                          {["Text", "Number", "Date", "Checkbox"].map((type) => (
                            <option key={type}>{type}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm">
                        Value
                        {custom.type === "Checkbox" ? (
                          <select
                            className={inputClass}
                            value={custom.value}
                            onChange={(e) =>
                              change(
                                "customFields",
                                draft.customFields.map((f, i) =>
                                  i === index ? { ...f, value: e.target.value } : f,
                                ),
                              )
                            }
                          >
                            <option value="">Not specified</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        ) : (
                          <input
                            className={inputClass}
                            type={
                              custom.type === "Number"
                                ? "number"
                                : custom.type === "Date"
                                  ? "date"
                                  : "text"
                            }
                            step="any"
                            maxLength={2000}
                            value={custom.value}
                            onChange={(e) =>
                              change(
                                "customFields",
                                draft.customFields.map((f, i) =>
                                  i === index ? { ...f, value: e.target.value } : f,
                                ),
                              )
                            }
                          />
                        )}
                      </label>
                      <button
                        type="button"
                        className="text-down underline"
                        onClick={() =>
                          change(
                            "customFields",
                            draft.customFields.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove field
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-brand underline"
                    disabled={draft.customFields.length >= 50}
                    onClick={() =>
                      change("customFields", [
                        ...draft.customFields,
                        { name: "", type: "Text", value: "" },
                      ])
                    }
                  >
                    Add custom field
                  </button>
                </div>

              </section>
              {writable && (
                <button
                  className="rounded bg-brand px-4 py-2 text-white disabled:opacity-50"
                  type="submit"
                >
                  {pending ? "Saving…" : "Save vendor"}
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
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm">
              Search vendors
              <input
                className={inputClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, company, email, tax ID or custom fields"
              />
            </label>
            <label className="text-sm">
              Custom field column
              <select
                className={inputClass}
                value={customColumn}
                onChange={(e) => setCustomColumn(e.target.value)}
              >
                <option value="">None</option>
                {customNames.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Sort by
              <select
                className={inputClass}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="name">Display name</option>
                <option value="custom" disabled={!customColumn}>
                  Selected custom field
                </option>
              </select>
            </label>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Display name",
                    "Company",
                    "Contact",
                    "Currency",
                    ...(customColumn ? [customColumn] : []),
                    "Action",
                  ].map((h) => (
                    <th className="p-3" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((v) => (
                  <tr key={v.id} className="border-t border-line">
                    <td className="p-3">{v.displayName}</td>
                    <td className="p-3">{v.companyName || "—"}</td>
                    <td className="p-3">{v.email || v.phone || "—"}</td>
                    <td className="p-3">{(v.bankAccounts || []).map((b) => b.currency).filter((c,i,a) => a.indexOf(c) === i).join(", ") || "—"}</td>
                    {customColumn && <td className="p-3">{customValue(v)?.value || "—"}</td>}
                    <td className="p-3">
                      <button className="text-brand underline" onClick={() => open(v)}>
                        {writable ? "Edit" : "View details"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <p className="p-4 text-sm text-ink3">
                {vendors.length
                  ? "No matching vendors."
                  : "No vendors registered for this company."}
              </p>
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
          <button type="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </p>
      )}
      {query.data?.map((file) => (
        <div key={file.id} className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
          </span>
          <button
            type="button"
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
              type="button"
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
