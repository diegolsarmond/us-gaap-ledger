import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCompanies } from "@/components/company-context";
import { saveCompany } from "@/lib/companies";
import { companySchema, US_STATES, formatEin, formatUsPhone, type Company } from "@/lib/company-model";
import { PageTitle, Panel } from "@/components/ui-kit";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/companies")({ component: CompaniesPage });
const control = "w-full rounded border border-line p-2 text-sm bg-white";

function CompanyFormModal({
  editing,
  onClose,
  onSave,
  pending,
  serverError,
}: {
  editing: Company | "new";
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  pending: boolean;
  serverError: string;
}) {
  const value = (key: keyof Company) =>
    editing !== "new" ? String(editing[key] ?? "") : "";

  const [phone, setPhone] = useState(() => (editing !== "new" ? formatUsPhone(editing.phone || "") : ""));
  const [email, setEmail] = useState(() => (editing !== "new" ? editing.email || "" : ""));
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");

  function validateEmail(val: string): boolean {
    const trimmed = val.trim();
    if (!trimmed) {
      setEmailError("");
      return true;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(trimmed)) {
      setEmailError("Invalid email format (e.g. contact@example.com)");
      return false;
    }
    setEmailError("");
    return true;
  }

  function validatePhone(val: string): boolean {
    const digits = val.replace(/\D/g, "");
    if (!digits) {
      setPhoneError("");
      return true;
    }
    const valid = digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
    if (!valid) {
      setPhoneError("US phone requires 10 digits: (XXX) XXX-XXXX");
      return false;
    }
    setPhoneError("");
    return true;
  }

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatUsPhone(e.target.value);
    setPhone(formatted);
    if (phoneError) validatePhone(formatted);
  }

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setEmail(val);
    if (emailError) validateEmail(val);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const isEmailValid = validateEmail(email);
    const isPhoneValid = validatePhone(phone);
    if (!isEmailValid || !isPhoneValid) return;

    const f = new FormData(e.currentTarget);
    const raw = Object.fromEntries(f);
    raw["phone"] = phone.trim();
    raw["email"] = email.trim();
    await onSave(raw);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing === "new" ? "New company" : "Edit company"}</DialogTitle>
          <DialogDescription>
            {editing === "new"
              ? "Register a new United States company. Base currency USD."
              : `Edit company profile and settings for ${editing.name}.`}
          </DialogDescription>
        </DialogHeader>

        {serverError && (
          <p role="alert" className="text-down text-sm bg-down/10 border border-down/20 rounded p-3">
            {serverError}
          </p>
        )}

        <form onSubmit={handleSubmit} className="grid sm:grid-cols-2 gap-4 pt-1">
          <fieldset disabled={pending} className="contents">
            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>
                Legal name <span className="text-down">*</span>
              </span>
              <input
                name="name"
                required
                maxLength={200}
                defaultValue={value("name")}
                className={control}
                placeholder="e.g. Acme Holdings LLC"
              />
            </label>

            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>Trade name / DBA</span>
              <input
                name="tradeName"
                maxLength={200}
                defaultValue={value("tradeName")}
                className={control}
                placeholder="e.g. Acme Corp"
              />
            </label>

            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>EIN (optional)</span>
              <input
                name="ein"
                maxLength={10}
                defaultValue={value("ein")}
                className={control}
                placeholder="XX-XXXXXXX"
              />
            </label>

            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>Address</span>
              <input
                name="address"
                maxLength={300}
                defaultValue={value("address")}
                className={control}
                placeholder="Street address"
              />
            </label>

            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>City</span>
              <input
                name="city"
                maxLength={120}
                defaultValue={value("city")}
                className={control}
                placeholder="City"
              />
            </label>

            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>Address state</span>
              <select
                name="addressState"
                defaultValue={value("addressState")}
                className={control}
              >
                <option value="">Select state</option>
                {US_STATES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>ZIP Code</span>
              <input
                name="zip"
                maxLength={10}
                defaultValue={value("zip")}
                className={control}
                placeholder="12345 or 12345-6789"
              />
            </label>

            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>Phone (US format)</span>
              <input
                name="phone"
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
                onBlur={() => validatePhone(phone)}
                maxLength={18}
                className={`${control} ${phoneError ? "border-down ring-1 ring-down" : ""}`}
                placeholder="(555) 000-0000"
              />
              {phoneError && <span className="text-xs text-down">{phoneError}</span>}
            </label>

            <label className="text-sm flex flex-col gap-1 text-ink sm:col-span-2">
              <span>Email</span>
              <input
                name="email"
                type="email"
                value={email}
                onChange={handleEmailChange}
                onBlur={() => validateEmail(email)}
                maxLength={254}
                className={`${control} ${emailError ? "border-down ring-1 ring-down" : ""}`}
                placeholder="contact@company.com"
              />
              {emailError && <span className="text-xs text-down">{emailError}</span>}
            </label>

            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>
                Legal entity type <span className="text-down">*</span>
              </span>
              <select name="entity" className={control} defaultValue={value("entity") || "LLC"}>
                {companySchema.shape.entity.options.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>Federal tax classification</span>
              <select
                name="federalTaxClassification"
                className={control}
                defaultValue={value("federalTaxClassification") || "Unspecified"}
              >
                {companySchema.shape.federalTaxClassification._def.innerType.options.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>
                State of formation <span className="text-down">*</span>
              </span>
              <select
                name="state"
                required
                defaultValue={value("state")}
                className={control}
              >
                <option value="">Select state</option>
                {US_STATES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>Accounting basis</span>
              <select name="basis" className={control} defaultValue={value("basis") || "Accrual"}>
                <option value="Accrual">Accrual</option>
                <option value="Cash">Cash</option>
              </select>
            </label>

            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>Fiscal year-end month</span>
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

            <div className="sm:col-span-2 pt-1">
              <label className="inline-flex items-center gap-2 text-sm text-ink cursor-pointer">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={editing === "new" || editing.active}
                  className="rounded border-line"
                />{" "}
                Active company
              </label>
            </div>

            <p className="text-xs text-ink3 sm:col-span-2">
              EIN is validated for format only. A new company starts without accounts, parameters,
              balances or transactions.
            </p>

            <div className="sm:col-span-2 flex justify-end gap-3 pt-3 border-t border-line">
              <button
                type="button"
                disabled={pending}
                onClick={onClose}
                className="rounded border border-line px-4 py-2 text-sm text-ink2 hover:bg-canvas transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="bg-brand text-white rounded px-4 py-2 text-sm font-medium hover:bg-brand/90 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {pending ? "Saving…" : "Save company"}
              </button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CompaniesPage() {
  const { companies, permissions, refresh, selectCompany } = useCompanies();
  const client = useQueryClient();
  const [editing, setEditing] = useState<Company | "new" | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [search, setSearch] = useState("");

  async function handleSave(raw: Record<string, unknown>) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const data = companySchema.parse({
        ...raw,
        ...(editing && editing !== "new" ? { id: editing.id } : {}),
        active: raw["active"] === "on" || raw["active"] === true,
        fiscalYearEndMonth: Number(raw["fiscalYearEndMonth"]),
      });
      const result = await saveCompany({ data });
      await refresh();
      await client.invalidateQueries({ queryKey: ["accounting"] });
      if (editing === "new" && data.active) selectCompany(result.id);
      setEditing(null);
    } catch (e) {
      if (e && typeof e === "object" && "issues" in e && Array.isArray((e as { issues: { message: string }[] }).issues)) {
        setError((e as { issues: { message: string }[] }).issues.map((i) => i.message).join(" · "));
      } else {
        setError(e instanceof Error ? e.message : "Unable to save.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Companies"
        description="United States companies · base currency USD"
        actions={
          permissions.manage_companies ? (
            <button
              className="bg-brand text-white rounded px-3 py-2 text-sm font-medium hover:bg-brand/90 transition-colors cursor-pointer"
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
              <div key={c.id} className="p-4 flex justify-between gap-3 items-center">
                <div>
                  <p className="font-medium text-ink">{c.name}</p>
                  <p className="text-xs text-ink3">
                    {c.entity} · {c.state} · {formatEin(c.ein)} · {c.phone ? formatUsPhone(c.phone) + " · " : ""}{c.active ? "Active" : "Inactive"}
                  </p>
                </div>
                {permissions.manage_companies && (
                  <button
                    className="text-brand text-sm font-medium hover:underline cursor-pointer"
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
          {!companies.length && (
            <div className="p-6 text-center text-sm text-ink3">
              <p>No companies registered or authorized.</p>
              {permissions.manage_companies && (
                <button
                  type="button"
                  className="mt-3 bg-brand text-white rounded px-3 py-1.5 text-xs font-medium hover:bg-brand/90 cursor-pointer"
                  onClick={() => {
                    setEditing("new");
                    setError("");
                  }}
                >
                  Create your first company
                </button>
              )}
            </div>
          )}
        </div>
      </Panel>

      {editing && permissions.manage_companies && (
        <CompanyFormModal
          key={editing === "new" ? "new" : editing.id}
          editing={editing}
          onClose={() => {
            setEditing(null);
            setError("");
          }}
          onSave={handleSave}
          pending={pending}
          serverError={error}
        />
      )}
    </div>
  );
}
