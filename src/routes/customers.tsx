import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AccountingProvider, useAccounting } from "@/lib/accounting-store";
import {
  customerSchema,
  MAX_ATTACHMENT_BYTES,
  type Customer,
  type CustomerInput,
} from "@/lib/customer-model";
import { PageTitle, Panel, Table, Th, Td } from "@/components/ui-kit";
export const Route = createFileRoute("/customers")({
  component: () => (
    <AccountingProvider>
      <CustomersPage />
    </AccountingProvider>
  ),
});
const control = "w-full rounded-md border border-line bg-white px-3 py-2 text-sm";
const button = "rounded-md bg-brand px-4 py-2 text-sm text-white disabled:opacity-50";
const blankAddress = { street: "", city: "", state: "", zip: "", country: "" };
function initial(): CustomerInput {
  return {
    ...customerSchema.parse({
      displayName: "New",
      billingAddress: blankAddress,
      shippingAddress: blankAddress,
    }),
    displayName: "",
  };
}
function CustomersPage() {
  const {
    customers,
    addCustomer,
    updateCustomer,
    currencies,
    paymentTerms,
    taxJurisdictions,
    userPersona,
  } = useAccounting();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerInput>(initial);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sub, setSub] = useState(false);
  const allowed = userPersona.canCreateJournals;
  function change<K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  function open(row?: Customer) {
    setEditing(row?.id ?? "new");
    setForm(row ? structuredClone(row) : initial());
    setSub(!!row?.parentCustomerId);
    setError("");
    setNotice("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending || uploading) return;
    setPending(true);
    setError("");
    try {
      const data = customerSchema.parse({
        ...form,
        shippingAddress: form.shippingSameAsBilling ? form.billingAddress : form.shippingAddress,
        parentCustomerId: sub ? form.parentCustomerId : "",
        billWithParent: sub && !!form.parentCustomerId && form.billWithParent,
      });
      if (editing === "new") await addCustomer(data);
      else await updateCustomer(editing!, data);
      setEditing(null);
      setNotice("Customer saved successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setPending(false);
    }
  }
  async function attach(files: FileList | null) {
    if (!files) return;
    setError("");
    setUploading(true);
    try {
      if (files.length + form.attachments.length > 20)
        throw new Error("Maximum 20 attachments per customer.");
      if (Array.from(files).some((f) => f.size > MAX_ATTACHMENT_BYTES))
        throw new Error("Each attachment must be 20 MB or smaller.");
      const attachments = await Promise.all(
        Array.from(files).map(async (file) => ({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          content: await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
            reader.onerror = () => reject(new Error("Unable to read attachment."));
            reader.readAsDataURL(file);
          }),
        })),
      );
      setForm((prev) => ({ ...prev, attachments: [...prev.attachments, ...attachments] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }
  function download(file: CustomerInput["attachments"][number]) {
    const bytes = Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function input(key: keyof CustomerInput, label: string, type = "text") {
    return (
      <label className="space-y-1 text-sm" key={key}>
        {label}
        <input
          className={control}
          type={type}
          required={key === "displayName"}
          maxLength={key === "displayName" ? 120 : key === "email" ? 254 : 2000}
          value={String(form[key] ?? "")}
          onChange={(e) => change(key, e.target.value as never)}
        />
      </label>
    );
  }
  function select(
    key:
      | "currency"
      | "paymentTermId"
      | "paymentMethod"
      | "deliveryMethod"
      | "defaultTaxCode"
      | "parentCustomerId",
    label: string,
    options: { value: string; label: string }[],
  ) {
    return (
      <label className="space-y-1 text-sm">
        {label}
        <select
          className={control}
          value={form[key]}
          onChange={(e) => change(key, e.target.value as never)}
        >
          <option value="">Not specified</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  function address(key: "billingAddress" | "shippingAddress", label: string) {
    return (
      <fieldset className="space-y-3 rounded-lg border border-line p-4">
        <legend className="px-2 font-medium">{label}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["street", "Street address"],
              ["city", "City"],
              ["state", "State / Province"],
              ["zip", "ZIP / Postal code"],
              ["country", "Country"],
            ] as const
          ).map(([field, name]) => (
            <label className="text-sm" key={field}>
              {name}
              <input
                className={control}
                maxLength={2000}
                value={form[key][field]}
                onChange={(e) => change(key, { ...form[key], [field]: e.target.value })}
              />
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  const rows = customers.filter((c) =>
    [c.displayName, c.companyName, c.email, c.taxId]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-5">
      <PageTitle
        title="Customers"
        description="Manage customers by company. Only the display name is required."
        actions={
          allowed && !editing ? (
            <button className={button} onClick={() => open()}>
              New customer
            </button>
          ) : undefined
        }
      />
      {error && (
        <p role="alert" className="text-down">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-up">
          {notice}
        </p>
      )}
      {editing ? (
        <form onSubmit={save}>
          <fieldset disabled={pending || uploading} className="space-y-5 min-w-0">
            <Panel title="Basic information and contact">
              <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {input("displayName", "Customer display name *")}
                {input("title", "Title")}
                {input("firstName", "Name")}
                {input("middleName", "Middle name")}
                {input("lastName", "Last name")}
                {input("suffix", "Suffix")}
                {input("companyName", "Company")}
                {input("customerType", "Customer type")}
                {input("printOnChecksAs", "Print on checks as")}
                {input("email", "Email", "email")}
                {input("phone", "Primary phone", "tel")}
                {input("mobile", "Mobile", "tel")}
                {input("fax", "Fax")}
                {input("website", "Website")}
              </div>
            </Panel>
            <Panel title="Addresses">
              <div className="space-y-4 p-4">
                {address("billingAddress", "Billing address")}
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.shippingSameAsBilling}
                    onChange={(e) => change("shippingSameAsBilling", e.target.checked)}
                  />
                  Same as billing address
                </label>
                {!form.shippingSameAsBilling && address("shippingAddress", "Shipping address")}
              </div>
            </Panel>
            <Panel title="Payment and billing">
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                {select(
                  "currency",
                  "Preferred currency",
                  currencies
                    .filter((c) => c.status === "Active" || c.code === form.currency)
                    .map((c) => ({ value: c.code, label: c.code + " · " + c.name })),
                )}
                {select(
                  "paymentTermId",
                  "Payment terms",
                  paymentTerms
                    .filter((t) => t.status === "Active" || t.id === form.paymentTermId)
                    .map((t) => ({ value: t.id, label: t.name })),
                )}
                {select("paymentMethod", "Preferred payment method", [
                  { value: "Credit card", label: "Credit card" },
                  { value: "Check", label: "Check" },
                  { value: "ACH", label: "Bank transfer / ACH" },
                  { value: "Cash", label: "Cash" },
                ])}
                {select("deliveryMethod", "Invoice delivery", [
                  { value: "Send later", label: "Email later" },
                  { value: "Print later", label: "Print later" },
                ])}
              </div>
            </Panel>
            <Panel title="Taxes and tax identification">
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                {input("taxId", "Tax ID · SSN / EIN / CNPJ / RFC")}
                {select(
                  "defaultTaxCode",
                  "Default tax code",
                  taxJurisdictions
                    .filter((t) => t.status === "Active" || t.code === form.defaultTaxCode)
                    .map((t) => ({ value: t.code, label: t.code + " · " + t.name })),
                )}
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.taxExempt}
                    onChange={(e) => change("taxExempt", e.target.checked)}
                  />
                  Exempt from sales tax
                </label>
                {form.taxExempt && input("exemptionReason", "Exemption reason")}
              </div>
            </Panel>
            <Panel title="Notes, attachments and sub-customer">
              <div className="space-y-4 p-4">
                <label className="block text-sm">
                  Internal notes (not shown on invoices)
                  <textarea
                    className={control}
                    rows={4}
                    maxLength={20000}
                    value={form.notes}
                    onChange={(e) => change("notes", e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Attachments · up to 20 MB per file (maximum 20)
                  <input
                    className={control}
                    type="file"
                    multiple
                    onChange={(e) => {
                      void attach(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                <ul className="space-y-2">
                  {form.attachments.map((file) => (
                    <li key={file.id} className="flex items-center gap-3 text-sm">
                      <button
                        type="button"
                        className="text-brand underline"
                        onClick={() => download(file)}
                      >
                        {file.name}
                      </button>
                      <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                      <button
                        type="button"
                        onClick={() =>
                          change(
                            "attachments",
                            form.attachments.filter((a) => a.id !== file.id),
                          )
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sub}
                    onChange={(e) => {
                      setSub(e.target.checked);
                      if (!e.target.checked) {
                        change("parentCustomerId", "");
                        change("billWithParent", false);
                      }
                    }}
                  />
                  Is a sub-customer
                </label>
                {sub && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {select(
                      "parentCustomerId",
                      "Parent customer",
                      customers
                        .filter((c) => c.id !== editing)
                        .map((c) => ({ value: c.id, label: c.displayName })),
                    )}
                    <label className="text-sm">
                      Billing
                      <select
                        className={control}
                        value={form.billWithParent ? "parent" : "individual"}
                        onChange={(e) => change("billWithParent", e.target.value === "parent")}
                      >
                        <option value="individual">Bill this customer individually</option>
                        <option value="parent">Bill with parent customer</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>
            </Panel>
            <div className="flex gap-4">
              <button className={button}>{pending ? "Saving…" : "Save customer"}</button>
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </fieldset>
          {uploading && <p role="status">Loading attachments…</p>}
        </form>
      ) : (
        <>
          <input
            className={control}
            aria-label="Search customers"
            placeholder="Search by name, company, email or tax ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Panel title={"Customers (" + rows.length + ")"}>
            <Table>
              <thead>
                <tr>
                  <Th>Customer</Th>
                  <Th>Company</Th>
                  <Th>Email / Phone</Th>
                  <Th>Parent customer</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <Td>{c.displayName}</Td>
                    <Td>{c.companyName || "—"}</Td>
                    <Td>{c.email || c.phone || "—"}</Td>
                    <Td>
                      {customers.find((p) => p.id === c.parentCustomerId)?.displayName || "—"}
                    </Td>
                    <Td>
                      {allowed ? (
                        <button className="text-brand underline" onClick={() => open(c)}>
                          Edit
                        </button>
                      ) : (
                        "Read-only"
                      )}
                    </Td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <Td colSpan={5}>No customers found.</Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Panel>
        </>
      )}
    </div>
  );
}
