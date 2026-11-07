import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { SearchableSelect } from "@/components/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { saveCashForecast } from "@/lib/cash-flow";
import {
  cashFlowLines,
  forecastSchema,
  type CashData,
  type CashFlowLine,
  type CashTransaction,
} from "@/lib/cash-flow-model";

const control = "w-full rounded-md border border-line bg-white px-3 py-2 text-sm";
const button = "rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const statusLabels = { planned: "Planned", realized: "Realized", cancelled: "Cancelled" } as const;

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1 text-xs text-ink2 ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Line the counterpart suggests: transfer for cash accounts, else its mapping or default. */
function suggestedLine(
  data: Pick<CashData, "glAccounts" | "mappings">,
  counterpart: string,
  direction: "in" | "out",
): CashFlowLine | "" {
  const gl = data.glAccounts.find((a) => a.code === counterpart);
  if (!gl) return "";
  if (gl.cash) return "internal_transfer";
  const mapping = data.mappings.find((m) => m.account_code === counterpart);
  const line = mapping
    ? direction === "in"
      ? mapping.inflow_line
      : mapping.outflow_line
    : gl.defaultLines[direction];
  const expected = cashFlowLines[line].direction;
  return expected && expected !== direction ? "" : line;
}

/**
 * Adds or edits a forecast. Actual cash is never entered here: it comes from posted journals.
 * A forecast against another bank or cash account is an internal transfer with two legs.
 */
export function CashForecastForm({
  companyId,
  companyName,
  data,
  editing,
  defaultAccount,
  today,
  onClose,
  onSaved,
}: {
  companyId: string;
  companyName: string;
  data: CashData;
  editing: CashTransaction | null;
  defaultAccount: string;
  today: string;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [account, setAccount] = useState(editing?.account_id ?? defaultAccount);
  const [direction, setDirection] = useState<"in" | "out">(editing?.direction ?? "out");
  const [counterpart, setCounterpart] = useState(editing?.counterpart_code ?? "");
  const [line, setLine] = useState<CashFlowLine | "">(editing?.cash_flow_line ?? "");
  const [lineChosen, setLineChosen] = useState(!!editing);
  const [amountCents, setAmountCents] = useState(
    editing ? String(Math.round(editing.amount * 100)) : "",
  );
  const [status, setStatus] = useState<keyof typeof statusLabels>(
    editing && editing.status !== "paid" ? editing.status : "planned",
  );
  const [keepOpen, setKeepOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const currency = data.accounts.find((a) => a.id === account)?.currency ?? "USD";
  const money = (cents: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(cents) / 100);
  const transfer = line === "internal_transfer";

  function choose(nextCounterpart: string, nextDirection: "in" | "out") {
    setCounterpart(nextCounterpart);
    setDirection(nextDirection);
    const suggestion = suggestedLine(data, nextCounterpart, nextDirection);
    const cashCounterpart = suggestion === "internal_transfer";
    // Keep a line the user chose while it still fits; transfers always follow the counterpart.
    if (
      !lineChosen ||
      cashCounterpart ||
      line === "internal_transfer" ||
      (line && cashFlowLines[line].direction && cashFlowLines[line].direction !== nextDirection)
    ) {
      setLine(suggestion);
      setLineChosen(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!line) {
      setError("Select a cash flow classification that matches the direction.");
      return;
    }
    const parsed = forecastSchema.safeParse({
      ...(editing ? { id: editing.id } : {}),
      account_code: account,
      counterpart_code: counterpart,
      description: String(form.get("description") ?? ""),
      direction,
      amount: Number(amountCents) / 100,
      expected_date: String(form.get("expected_date") ?? ""),
      status,
      cash_flow_line: line,
      variance_note: String(form.get("variance_note") ?? ""),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setPending(true);
    setError("");
    setNotice("");
    try {
      await saveCashForecast({ data: { companyId, ...parsed.data } });
      if (keepOpen && !editing) {
        await onSaved("");
        setNotice("Forecast saved. Add the next one.");
        setAmountCents("");
        setFormKey((k) => k + 1);
      } else await onSaved(editing ? "Forecast updated." : "Forecast saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const counterpartOptions = data.glAccounts
    .filter((a) => a.code !== account)
    .map((a) => ({
      value: a.code,
      label: `${a.code} · ${a.name}`,
      detail: a.cash ? "Bank / cash · transfer" : a.type,
    }));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto overscroll-contain"
        style={{ width: "96vw", maxWidth: "1200px" }}
      >
        <DialogHeader>
          <DialogTitle>{editing ? "Edit forecast" : "New forecast"}</DialogTitle>
          <DialogDescription className="rounded-md border border-brand/20 bg-brand/5 px-3 py-2">
            <span className="block text-xs font-medium text-ink2">Company</span>
            <span className="block text-lg font-bold text-brand">{companyName}</span>
          </DialogDescription>
        </DialogHeader>
        <form key={formKey} onSubmit={submit} className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-red-800">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-green-800">
              {notice}
            </p>
          )}
          <p className="text-xs text-ink3">
            Forecasts are plans and never post journal entries. Actual cash comes from the General
            Ledger: post the bank movement (Bank Feed, payments or journals), then mark the forecast
            realized.
          </p>
          <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Bank / cash account">
              {editing ? (
                <span className={control + " block"}>
                  {data.accounts.find((a) => a.id === account)?.name ?? account}
                </span>
              ) : (
                <SearchableSelect
                  label="Bank / cash account"
                  value={account}
                  onChange={setAccount}
                  required
                  autoFocus
                  placeholder="Select a bank or cash account"
                  options={data.accounts.map((a) => ({
                    value: a.id,
                    label: `${a.id} · ${a.name}`,
                    detail: a.currency,
                  }))}
                />
              )}
            </Field>
            <Field label="Type">
              <select
                value={direction}
                onChange={(e) => choose(counterpart, e.target.value as "in" | "out")}
                className={control}
              >
                <option value="in">Inflow</option>
                <option value="out">Outflow</option>
              </select>
            </Field>
            <Field label={direction === "in" ? "Expected receipt date" : "Expected payment date"}>
              <input
                name="expected_date"
                type="date"
                defaultValue={editing?.due_date ?? today}
                required
                className={control}
              />
            </Field>
            <Field label="Description" className="sm:col-span-2 lg:col-span-3">
              <textarea
                rows={2}
                name="description"
                defaultValue={editing?.description}
                required
                maxLength={240}
                className={control}
              />
            </Field>
            <Field label="Category · counterpart account">
              {editing?.transfer_account_id ? (
                <span className={control + " block"}>
                  {data.accounts.find((a) => a.id === counterpart)?.name ?? counterpart}
                </span>
              ) : (
                <SearchableSelect
                  label="Counterpart account"
                  value={counterpart}
                  onChange={(value) => choose(value, direction)}
                  required
                  placeholder="Select the account this cash pays or comes from"
                  options={counterpartOptions}
                />
              )}
              <span>
                The Chart of Accounts is the category list. Choosing another bank or cash account
                records a transfer with both legs.
              </span>
            </Field>
            <Field label={`Amount (${currency})`}>
              <input
                type="text"
                inputMode="numeric"
                placeholder={money("0")}
                value={amountCents ? money(amountCents) : ""}
                onChange={(e) =>
                  setAmountCents(e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 14))
                }
                required
                className={control}
              />
            </Field>
            <Field label="US GAAP cash flow classification">
              {transfer ? (
                <span className={control + " block"}>{cashFlowLines.internal_transfer.label}</span>
              ) : (
                <SearchableSelect
                  label="Cash flow classification"
                  value={line}
                  onChange={(value) => {
                    setLine(value as CashFlowLine);
                    setLineChosen(true);
                  }}
                  required
                  placeholder="Select a cash flow line"
                  options={Object.entries(cashFlowLines)
                    .filter(
                      ([key, l]) =>
                        key !== "internal_transfer" &&
                        (l.direction === null || l.direction === direction),
                    )
                    .map(([key, l]) => ({ value: key, label: `${l.activity} · ${l.label}` }))}
                />
              )}
              {!lineChosen && line && !transfer && (
                <span>Suggested from the counterpart account&apos;s cash flow mapping.</span>
              )}
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className={control}
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <span>
                Realized and cancelled forecasts leave the projection but keep their original plan
                for forecast vs. actual.
              </span>
            </Field>
            <Field label="Variance explanation" className="sm:col-span-2 lg:col-span-3">
              <textarea
                name="variance_note"
                rows={2}
                maxLength={1000}
                defaultValue={editing?.variance_note ?? ""}
                className={control}
                placeholder="Explain amount changes, receipt/payment delays, cancelled sales or unexpected costs."
              />
              {editing?.forecast_amount != null && (
                <span className="block">
                  Original plan: {editing.forecast_direction === "out" ? "−" : "+"}
                  {money(String(Math.round(editing.forecast_amount * 100)))} on{" "}
                  {editing.forecast_date}.
                </span>
              )}
            </Field>
            {!editing && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
                <input
                  type="checkbox"
                  checked={keepOpen}
                  onChange={(e) => setKeepOpen(e.target.checked)}
                  className="h-4 w-4 accent-brand"
                />
                Continue adding forecasts (keep this window open after saving)
              </label>
            )}
            <div className="flex items-end gap-3">
              <button className={button}>{pending ? "Saving…" : "Save"}</button>
              <button type="button" className="text-sm underline" onClick={onClose}>
                Cancel
              </button>
            </div>
          </fieldset>
          {!data.glAccounts.length && (
            <Link to="/accounts" className="block text-brand underline">
              Create your Chart of Accounts first
            </Link>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
