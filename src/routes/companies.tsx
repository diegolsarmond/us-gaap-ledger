import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCompanies } from "@/components/company-context";
import { saveCompany } from "@/lib/companies";
import { companySchema, formatEin, type Company } from "@/lib/company-model";
import { PageTitle, Panel, Table, Th, Td, Badge, Kpi } from "@/components/ui-kit";
import { Plus } from "lucide-react";
import {
  DetailDialog,
  EmptyRow,
  IdentityCell,
  ListToolbar,
  PaginationBar,
  RowActions,
  fieldControl,
  primaryButton,
  secondaryButton,
  usePagination,
} from "@/components/data-list";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/companies")({ component: CompaniesPage });
const control = fieldControl;

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
  const value = (key: keyof Company) => (editing !== "new" ? String(editing[key] ?? "") : "");

  const [phone, setPhone] = useState(() => (editing !== "new" ? editing.phone || "" : ""));
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
    const valid = digits.length >= 10 && digits.length <= 15;
    if (!valid) {
      setPhoneError("Phone requires 10 to 15 digits");
      return false;
    }
    setPhoneError("");
    return true;
  }

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = e.target.value;
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
              ? "Register a company. Accounting and reporting currency: USD."
              : `Edit company profile and settings for ${editing.name}.`}
          </DialogDescription>
        </DialogHeader>

        {serverError && (
          <p
            role="alert"
            className="text-down text-sm bg-down/10 border border-down/20 rounded p-3"
          >
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
              <span>Country (US / MX)</span>
              <input name="country" defaultValue={value("country") || "US"} className={control} />
            </label>
            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>Primary currency (USD / MXN)</span>
              <input
                name="primaryCurrency"
                defaultValue={value("primaryCurrency") || "USD"}
                className={control}
              />
            </label>
            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>RFC / local tax ID</span>
              <input name="taxId" defaultValue={value("taxId")} className={control} />
            </label>
            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>Municipality</span>
              <input name="municipality" defaultValue={value("municipality")} className={control} />
            </label>
            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>Accountant</span>
              <input
                name="accountantName"
                defaultValue={value("accountantName")}
                className={control}
              />
            </label>
            <label className="text-sm flex flex-col gap-1 text-ink">
              <span>Accountant email</span>
              <input
                name="accountantEmail"
                defaultValue={value("accountantEmail")}
                className={control}
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
              <input
                name="addressState"
                maxLength={120}
                defaultValue={value("addressState")}
                className={control}
              />
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
              <span>Phone</span>
              <input
                name="phone"
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
                onBlur={() => validatePhone(phone)}
                maxLength={40}
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
              <input
                name="state"
                required
                maxLength={120}
                defaultValue={value("state")}
                className={control}
              />
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
                className={secondaryButton}
              >
                Cancel
              </button>
              <button type="submit" disabled={pending} className={primaryButton}>
                {pending ? "Saving…" : "Save company"}
              </button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const COMPANY_DELETE_BLOCK =
  "Companies keep their ledger history and audit trail, so they cannot be deleted. Mark the company as inactive instead.";
const monthName = (month: number) =>
  new Date(2000, (month || 12) - 1, 1).toLocaleString("en-US", { month: "long" });

function CompaniesPage() {
  const { companies, permissions, refresh, selectCompany, activeCompany } = useCompanies();
  const client = useQueryClient();
  const [editing, setEditing] = useState<Company | "new" | null>(null),
    [viewing, setViewing] = useState<Company | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [country, setCountry] = useState(""),
    [entity, setEntity] = useState("");

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
      if (
        e &&
        typeof e === "object" &&
        "issues" in e &&
        Array.isArray((e as { issues: { message: string }[] }).issues)
      ) {
        setError((e as { issues: { message: string }[] }).issues.map((i) => i.message).join(" · "));
      } else {
        setError(e instanceof Error ? e.message : "Unable to save.");
      }
    } finally {
      setPending(false);
    }
  }

  function openEditor(target: Company | "new") {
    setViewing(null);
    setEditing(target);
    setError("");
  }

  const term = search.trim().toLowerCase();
  const rows = companies.filter(
    (c) =>
      [c.name, c.tradeName, c.ein, formatEin(c.ein), c.taxId, c.city, c.state, c.email]
        .join(" ")
        .toLowerCase()
        .includes(term) &&
      (!status || (status === "active") === c.active) &&
      (!country || c.country === country) &&
      (!entity || c.entity === entity),
  );
  const paging = usePagination(rows, `${term}|${status}|${country}|${entity}`);
  const distinct = (values: string[]) =>
    [...new Set(values.filter(Boolean))].sort().map((v) => ({ value: v, label: v }));

  return (
    <div className="space-y-4">
      <PageTitle
        title="Companies"
        description="Company registration · accounting and reporting currency USD"
        actions={
          permissions.manage_companies ? (
            <button className={primaryButton} onClick={() => openEditor("new")}>
              <Plus className="size-4" /> New company
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Companies" value={String(companies.length)} />
        <Kpi label="Active" value={String(companies.filter((c) => c.active).length)} />
        <Kpi label="Inactive" value={String(companies.filter((c) => !c.active).length)} />
        <Kpi label="Countries" value={String(new Set(companies.map((c) => c.country)).size)} />
      </div>

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search by name, trade name, EIN, tax ID or city…"
        filters={[
          {
            key: "status",
            label: "Status",
            value: status,
            onChange: setStatus,
            options: [
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
          },
          {
            key: "country",
            label: "Country",
            value: country,
            onChange: setCountry,
            options: distinct(companies.map((c) => c.country)),
          },
          {
            key: "entity",
            label: "Entity type",
            value: entity,
            onChange: setEntity,
            options: distinct(companies.map((c) => c.entity)),
          },
        ]}
      />

      <Panel
        title="Registered companies"
        subtitle={`${rows.length} of ${companies.length} records`}
      >
        <Table>
          <thead className="bg-canvas/50">
            <tr>
              <Th>Company</Th>
              <Th>Entity</Th>
              <Th>Tax ID</Th>
              <Th>Location</Th>
              <Th>Currency</Th>
              <Th>Status</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {paging.pageRows.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-brand/[0.03]">
                <Td>
                  <IdentityCell
                    title={c.name}
                    subtitle={[c.tradeName, c.email].filter(Boolean).join(" · ") || undefined}
                  />
                </Td>
                <Td>
                  <p>{c.entity}</p>
                  <p className="text-[11px] text-ink3">Formed in {c.state || "—"}</p>
                </Td>
                <Td className="font-mono text-[12px]">{c.taxId || formatEin(c.ein) || "—"}</Td>
                <Td>{[c.city, c.addressState, c.country].filter(Boolean).join(", ") || "—"}</Td>
                <Td>{c.primaryCurrency}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={c.active ? "up" : "neutral"}>
                      {c.active ? "Active" : "Inactive"}
                    </Badge>
                    {activeCompany?.id === c.id && <Badge tone="brand">Current</Badge>}
                  </div>
                </Td>
                <Td align="right">
                  <RowActions
                    onView={() => setViewing(c)}
                    onEdit={() => openEditor(c)}
                    edit={{ hidden: !permissions.manage_companies }}
                    onDelete={() => undefined}
                    remove={{
                      hidden: !permissions.manage_companies,
                      blocked: COMPANY_DELETE_BLOCK,
                    }}
                  />
                </Td>
              </tr>
            ))}
            {!rows.length && (
              <EmptyRow colSpan={7}>
                {companies.length ? (
                  "No companies match the current filters."
                ) : (
                  <>
                    <p>No companies registered or authorized.</p>
                    {permissions.manage_companies && (
                      <button
                        type="button"
                        className={`${primaryButton} mt-3`}
                        onClick={() => openEditor("new")}
                      >
                        Create your first company
                      </button>
                    )}
                  </>
                )}
              </EmptyRow>
            )}
          </tbody>
        </Table>
        <PaginationBar {...paging} />
      </Panel>

      <DetailDialog
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? ""}
        subtitle={viewing ? `${viewing.entity} · ${viewing.active ? "Active" : "Inactive"}` : ""}
        sections={
          viewing
            ? [
                {
                  title: "Identification",
                  fields: [
                    { label: "Legal name", value: viewing.name },
                    { label: "Trade name / DBA", value: viewing.tradeName },
                    { label: "Legal entity type", value: viewing.entity },
                    {
                      label: "Federal tax classification",
                      value: viewing.federalTaxClassification,
                    },
                    { label: "State of formation", value: viewing.state },
                    { label: "EIN", value: formatEin(viewing.ein) },
                    { label: "RFC / local tax ID", value: viewing.taxId },
                    { label: "Country", value: viewing.country },
                  ],
                },
                {
                  title: "Address and contact",
                  fields: [
                    { label: "Address", value: viewing.address, wide: true },
                    { label: "City", value: viewing.city },
                    { label: "Municipality", value: viewing.municipality },
                    { label: "State", value: viewing.addressState },
                    { label: "ZIP code", value: viewing.zip },
                    { label: "Phone", value: viewing.phone },
                    { label: "Email", value: viewing.email },
                    { label: "Accountant", value: viewing.accountantName },
                    { label: "Accountant email", value: viewing.accountantEmail },
                  ],
                },
                {
                  title: "Accounting",
                  fields: [
                    { label: "Primary currency", value: viewing.primaryCurrency },
                    { label: "Reporting currency", value: "USD" },
                    { label: "Accounting basis", value: viewing.basis },
                    { label: "Fiscal year end", value: monthName(viewing.fiscalYearEndMonth) },
                    { label: "Inventory cost method", value: viewing.costMethod },
                    {
                      label: "Active period",
                      value: viewing.activePeriod
                        ? `${viewing.activePeriod}${viewing.isPeriodClosed ? " (locked)" : ""}`
                        : "",
                    },
                  ],
                },
              ]
            : []
        }
        footer={
          viewing &&
          permissions.manage_companies && (
            <button type="button" className={primaryButton} onClick={() => openEditor(viewing)}>
              Edit
            </button>
          )
        }
      >
        <p className="text-[11px] text-ink3">{COMPANY_DELETE_BLOCK}</p>
      </DetailDialog>

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
