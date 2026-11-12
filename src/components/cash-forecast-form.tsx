import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { SearchableSelect } from "@/components/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { saveCashForecasts } from "@/lib/cash-flow";
import {
  cashFlowLines,
  forecastSchema,
  type CashData,
  type CashForecast,
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
  const [rows, setRows] = useState([0]);
  const nextRow = useRef(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function addRow() {
    const row = nextRow.current++;
    setRows((current) => [...current, row]);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const forecasts: CashForecast[] = [];
    for (const [index, row] of rows.entries()) {
      const get = (field: string) => String(form.get(field + "-" + row) ?? "");
      const partyId = get("party_id");
      if (get("line") !== "internal_transfer" && !partyId) {
        setError(
          "Forecast " +
            (index + 1) +
            ": select a " +
            (direction === "in" ? "customer." : "vendor."),
        );
        return;
      }
      const parsed = forecastSchema.safeParse({
        id: editing?.id,
        account_code: account,
        direction,
        counterpart_code: get("counterpart"),
        description: get("description"),
        amount: Number(get("amount")) / 100,
        expected_date: get("expected_date"),
        document_date: get("document_date") || null,
        party_id: partyId || null,
        status: get("status"),
        cash_flow_line: get("line"),
        variance_note: editing?.variance_note,
      });
      if (!parsed.success) {
        setError(
          "Forecast " +
            (index + 1) +
            ": " +
            parsed.error.issues.map((issue) => issue.message).join(" "),
        );
        return;
      }
      forecasts.push(parsed.data);
    }
    setPending(true);
    setError("");
    try {
      await saveCashForecasts({ data: { companyId, forecasts } });
      await onSaved(
        editing
          ? "Forecast updated."
          : forecasts.length === 1
            ? "Forecast saved."
            : "Forecasts saved.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="flex max-h-[96dvh] w-[98vw] max-w-[1600px] flex-col overflow-visible">
        <DialogHeader className="shrink-0">
          <DialogTitle>{editing ? "Edit forecast" : "New forecast"}</DialogTitle>
          <DialogDescription className="rounded-md border border-brand/20 bg-brand/5 px-3 py-2">
            <span className="block text-xs font-medium text-ink2">Company</span>
            <span className="block text-lg font-bold text-brand">{companyName}</span>
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={submit}
          className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-1 pb-1"
        >
          {error && (
            <p role="alert" className="text-sm text-red-800">
              {error}
            </p>
          )}
          <fieldset disabled={pending} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bank / cash account">
                {editing ? (
                  <span className={control + " block"}>
                    {data.accounts.find((a) => a.id === account)?.name ?? account}
                  </span>
                ) : (
                  <SearchableSelect
                    fitViewport
                    popupClassName="z-[70] min-w-64 max-w-[var(--radix-popover-content-available-width)] shadow-lg"
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
                  onChange={(e) => setDirection(e.target.value as "in" | "out")}
                  className={control}
                >
                  <option value="in">Inflow</option>
                  <option value="out">Outflow</option>
                </select>
              </Field>
            </div>
            {rows.map((row, index) => (
              <ForecastRow
                key={row}
                row={row}
                index={index}
                account={account}
                direction={direction}
                data={data}
                editing={editing}
                today={today}
                onAdd={!editing && index === rows.length - 1 ? addRow : undefined}
                onRemove={
                  rows.length > 1
                    ? () => setRows((current) => current.filter((id) => id !== row))
                    : undefined
                }
              />
            ))}
            <div className="flex items-center gap-3">
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

function ForecastRow({
  row,
  index,
  account,
  direction,
  data,
  editing,
  today,
  onRemove,
  onAdd,
}: {
  row: number;
  index: number;
  account: string;
  direction: "in" | "out";
  data: CashData;
  editing: CashTransaction | null;
  today: string;
  onRemove: (() => void) | undefined;
  onAdd: (() => void) | undefined;
}) {
  const [counterpart, setCounterpart] = useState(editing?.counterpart_code ?? "");
  const [chosenLine, setChosenLine] = useState<CashFlowLine | "">(editing?.cash_flow_line ?? "");
  const [amountCents, setAmountCents] = useState(
    editing ? String(Math.round(editing.amount * 100)) : "",
  );
  const [status, setStatus] = useState<keyof typeof statusLabels>(
    editing && editing.status !== "paid" ? editing.status : "planned",
  );

  const [parties, setParties] = useState({
    in: editing?.direction === "in" ? (editing.party_id ?? "") : "",
    out: editing?.direction === "out" ? (editing.party_id ?? "") : "",
  });
  const suggestion = suggestedLine(data, counterpart, direction);
  const lineChosen =
    !!chosenLine &&
    chosenLine !== "internal_transfer" &&
    (!cashFlowLines[chosenLine].direction || cashFlowLines[chosenLine].direction === direction);
  const line = suggestion === "internal_transfer" || !lineChosen ? suggestion : chosenLine;
  const partyLabel = direction === "in" ? "Customer" : "Vendor";
  const partyId = parties[direction];
  const partyOptions =
    (direction === "in" ? data.customers : data.vendors)?.map((party) => ({
      value: party.id,
      label: party.name,
    })) ?? [];
  if (partyId && !partyOptions.some((party) => party.value === partyId))
    partyOptions.push({ value: partyId, label: partyId });
  const name = (field: string) => field + "-" + row;
  const currency = data.accounts.find((a) => a.id === account)?.currency ?? "USD";
  const money = (cents: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(cents) / 100);
  const transfer = line === "internal_transfer";

  const counterpartOptions = data.glAccounts
    .filter((a) => a.code !== account)
    .map((a) => ({
      value: a.code,
      label: `${a.code} · ${a.name}`,
      detail: a.cash ? "Bank / cash · transfer" : a.type,
    }));

  return (
    <section
      aria-label={"Forecast " + (index + 1)}
      className="space-y-3 rounded-md border border-line p-3"
    >
      {onRemove && (
        <button type="button" className="block ml-auto text-sm underline" onClick={onRemove}>
          Remove line {index + 1}
        </button>
      )}
      <input type="hidden" name={name("counterpart")} value={counterpart} />
      <input type="hidden" name={name("line")} value={line} />
      <input type="hidden" name={name("amount")} value={amountCents} />
      <input type="hidden" name={name("party_id")} value={transfer ? "" : partyId} />
      <div className={transfer ? "" : "grid gap-3 sm:grid-cols-2"}>
        <Field label="Description">
          <textarea
            rows={1}
            name={name("description")}
            defaultValue={editing?.description}
            required
            maxLength={240}
            className={control}
          />
        </Field>

        {!transfer && (
          <Field label={partyLabel}>
            <SearchableSelect
              fitViewport
              popupClassName="z-[70] min-w-64 max-w-[var(--radix-popover-content-available-width)] shadow-lg"
              label={partyLabel}
              value={partyId}
              required
              options={partyOptions}
              placeholder={direction === "in" ? "Select a customer" : "Select a vendor"}
              onChange={(value) => setParties((current) => ({ ...current, [direction]: value }))}
            />
          </Field>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.8fr_1.5fr_0.8fr_1fr_1.3fr]">
        <Field label="Category · counterpart account">
          {editing?.transfer_account_id ? (
            <span className={control + " block"}>
              {data.accounts.find((a) => a.id === counterpart)?.name ?? counterpart}
            </span>
          ) : (
            <SearchableSelect
              fitViewport
              popupClassName="z-[70] min-w-64 max-w-[var(--radix-popover-content-available-width)] shadow-lg"
              label="Counterpart account"
              value={counterpart}
              onChange={(value) => {
                setCounterpart(value);
                if (suggestedLine(data, value, direction) === "internal_transfer")
                  setChosenLine("");
              }}
              required
              placeholder="Select an account"
              options={counterpartOptions}
            />
          )}
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
              fitViewport
              popupClassName="z-[70] min-w-64 max-w-[var(--radix-popover-content-available-width)] shadow-lg"
              label="Cash flow classification"
              value={line}
              onChange={(value) => setChosenLine(value as CashFlowLine)}
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
        </Field>
        <Field label="Status">
          <select
            name={name("status")}
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
        </Field>

        <Field label="Document date">
          <input
            type="date"
            name={name("document_date")}
            defaultValue={editing?.document_date ?? ""}
            className={control}
          />
        </Field>
        <div className="flex items-end gap-2">
          <Field
            className="min-w-0 flex-1"
            label={direction === "in" ? "Expected receipt date" : "Expected payment date"}
          >
            <input
              type="date"
              name={name("expected_date")}
              defaultValue={editing?.due_date ?? today}
              required
              className={control}
            />
          </Field>
          {onAdd && (
            <button
              type="button"
              aria-label="Add forecast line"
              title="Add forecast line"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand text-white"
              onClick={onAdd}
            >
              <Plus className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
