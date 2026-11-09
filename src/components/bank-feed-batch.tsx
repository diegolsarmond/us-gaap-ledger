import { useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import { Button } from "@/components/ui/button";
import { useAccounting } from "@/lib/accounting-store";
import { bankBatchLimit, type BankBatchAction } from "@/lib/bank-feed-model";
import type { runBankBatch } from "@/lib/bank-feed";
import {
  BankDialog,
  BankSubmit,
  ErrorMessage,
  Field,
  SelectField,
  fieldStyle,
  type BankRow,
} from "./bank-feed-ui";

export function BankBatchDialog({
  operation,
  rows,
  run,
  refresh,
  close,
  saved,
}: {
  operation: BankBatchAction["operation"];
  rows: BankRow[];
  run: (input: BankBatchAction) => ReturnType<typeof runBankBatch>;
  refresh: () => Promise<unknown>;
  close: () => void;
  saved: (message: string) => void;
}) {
  const { accounts, costCenters, fiscalPeriods } = useAccounting();
  const [inflowAccount, setInflowAccount] = useState("");
  const [outflowAccount, setOutflowAccount] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [rates, setRates] = useState<Record<string, string>>({});
  const [rateSource, setRateSource] = useState("");
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [reason, setReason] = useState("");
  const reversalDates = rows
    .filter((row) => !row.isSourcePosted && row.attemptKind !== "match")
    .map((row) => row.accountingDate ?? row.date);
  const minDate = reversalDates.sort().at(-1) ?? "";
  const [date, setDate] = useState(
    fiscalPeriods.some(
      (period) =>
        period.status === "Open" && period.startDate <= minDate && minDate <= period.endDate,
    )
      ? minDate
      : "",
  );
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [processed, setProcessed] = useState(0);
  const first = rows[0]!;
  const foreign = first.currency !== "USD";
  const duplicate = rows.some((row) => row.duplicate);
  const incompatible = rows.some((row) => row.currency !== first.currency);
  const hasInflow = rows.some((row) => Number(row.amount) > 0);
  const hasOutflow = rows.some((row) => Number(row.amount) < 0);
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const key = operation === "categorize" && foreign ? row.date : "";
    const ids = groups.get(key) ?? [];
    ids.push(row.id);
    groups.set(key, ids);
  }
  const accountsByDirection = [
    ...(hasInflow
      ? [
          {
            label: hasOutflow ? "Money in counterpart" : "Counterpart account",
            value: inflowAccount,
            change: setInflowAccount,
          },
        ]
      : []),
    ...(hasOutflow
      ? [
          {
            label: hasInflow ? "Money out counterpart" : "Counterpart account",
            value: outflowAccount,
            change: setOutflowAccount,
          },
        ]
      : []),
  ];
  const accountOptions = accounts
    .filter(
      (item) =>
        item.code !== first.account && !accounts.some((child) => child.parentCode === item.code),
    )
    .map((item) => ({ value: item.code, label: `${item.code} · ${item.name}` }));
  const labels = {
    categorize: "Categorize and post",
    exclude: "Exclude transactions",
    restore: "Restore to Pending",
    undo: "Undo posted transactions",
  };
  const explanations = {
    categorize: rows.some((row) => row.isSourcePosted)
      ? "Post these transactions in World Business using the selected counterpart accounts. If a transaction is already in the World Business register, use Match on that row instead."
      : "Apply a counterpart account per direction. Each transaction keeps its bank date and amount. Company approval rules still apply.",
    exclude: "Move the selected transactions to Excluded.",
    restore: "Return the selected transactions to Pending for review.",
    undo: minDate
      ? "Remove matches, reverse entries created by the feed and return the selected transactions to Pending."
      : "Return the selected transactions to Pending in World Business and remove any World Business matches.",
  };
  const submit = async () => {
    const totals = { count: 0, posted: 0, inApproval: 0 };
    try {
      for (const [bankDate, ids] of groups) {
        for (let offset = 0; offset < ids.length; offset += bankBatchLimit) {
          const scope = {
            bankAccount: first.account,
            rowIds: ids.slice(offset, offset + bankBatchLimit),
          };
          const input: BankBatchAction =
            operation === "categorize"
              ? {
                  ...scope,
                  operation,
                  inflowAccount: inflowAccount || undefined,
                  outflowAccount: outflowAccount || undefined,
                  costCenterId: costCenter || undefined,
                  rate: rates[bankDate] || undefined,
                  rateSource: rateSource || undefined,
                  confirmDuplicate,
                }
              : operation === "undo"
                ? { ...scope, operation, date: date || undefined, reason: reason || undefined }
                : operation === "exclude"
                  ? { ...scope, operation, reason }
                  : { ...scope, operation };
          const result = await run(input);
          totals.count += result.count;
          totals.posted += result.posted;
          totals.inApproval += result.inApproval;
          setProcessed(totals.count);
        }
      }
    } finally {
      await refresh();
    }
    const summary =
      operation === "categorize"
        ? `${totals.posted} posted · ${totals.inApproval} in approval.`
        : operation === "exclude"
          ? `${totals.count} moved to Excluded.`
          : `${totals.count} returned to Pending.`;
    saved(summary);
  };

  return (
    <BankDialog
      title={labels[operation]}
      description={`${rows.length} selected · ${explanations[operation]}`}
      close={() => {
        if (!busy) close();
      }}
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setBusy(true);
          void submit()
            .catch(setError)
            .finally(() => setBusy(false));
        }}
      >
        {operation === "categorize" && (
          <>
            {incompatible ? (
              <ErrorMessage error="Select transactions in the same currency." />
            ) : (
              <>
                {accountsByDirection.map(({ label, value, change }) => (
                  <fieldset key={label} disabled={busy} className="min-w-0 space-y-1">
                    <legend className="text-xs font-medium text-ink2">{label}</legend>
                    <SearchableSelect
                      label={label}
                      value={value}
                      onChange={change}
                      options={accountOptions}
                      fitViewport
                      required
                    />
                  </fieldset>
                ))}
                <SelectField
                  name="Cost center"
                  value={costCenter}
                  change={setCostCenter}
                  options={costCenters
                    .filter((item) => item.status === "Active")
                    .map((item) => ({ id: item.id, name: item.name }))}
                />
                {foreign && (
                  <>
                    {[...groups.keys()].sort().map((bankDate) => (
                      <Field
                        key={bankDate}
                        name={`Exchange rate for ${bankDate} · USD per ${first.currency}`}
                      >
                        <input
                          className={fieldStyle}
                          inputMode="decimal"
                          required
                          value={rates[bankDate] ?? ""}
                          onChange={(event) =>
                            setRates({ ...rates, [bankDate]: event.target.value })
                          }
                        />
                      </Field>
                    ))}
                    <Field name="Rate source">
                      <input
                        className={fieldStyle}
                        required
                        value={rateSource}
                        onChange={(event) => setRateSource(event.target.value)}
                      />
                    </Field>
                  </>
                )}
                {duplicate && (
                  <label className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={confirmDuplicate}
                      onChange={(event) => setConfirmDuplicate(event.target.checked)}
                    />
                    I reviewed the possible duplicates and confirmed they are separate movements.
                  </label>
                )}
              </>
            )}
          </>
        )}
        {operation === "undo" && minDate && (
          <Field name="Reversal date">
            <input
              className={fieldStyle}
              type="date"
              min={minDate}
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
        )}
        {(operation === "exclude" || (operation === "undo" && minDate)) && (
          <Field name={operation === "exclude" ? "Reason for exclusion" : "Reason for reversal"}>
            <input
              className={fieldStyle}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        )}
        {rows.length > bankBatchLimit && (
          <p className="text-xs text-ink3">
            Transactions are processed in groups of up to {bankBatchLimit}.
          </p>
        )}
        {(busy || processed > 0) && (
          <p role="status" className="text-sm font-medium">
            {processed} of {rows.length} confirmed.
          </p>
        )}
        {!!error && processed > 0 && (
          <p className="text-sm">
            Close this window and select the remaining transactions to try again.
          </p>
        )}
        <ErrorMessage error={error} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <BankSubmit
            busy={busy}
            disabled={
              processed > 0 ||
              (operation === "categorize" &&
                (incompatible ||
                  accountsByDirection.some((item) => !item.value) ||
                  (duplicate && !confirmDuplicate)))
            }
          >
            {labels[operation]}
          </BankSubmit>
        </div>
      </form>
    </BankDialog>
  );
}
