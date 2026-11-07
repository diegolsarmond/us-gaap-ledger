import { useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import { Button } from "@/components/ui/button";
import { useAccounting } from "@/lib/accounting-store";
import type { BankBatchAction } from "@/lib/bank-feed-model";
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
  close,
  saved,
}: {
  operation: BankBatchAction["operation"];
  rows: BankRow[];
  run: (input: BankBatchAction) => ReturnType<typeof runBankBatch>;
  close: () => void;
  saved: (message: string) => void;
}) {
  const { accounts, costCenters, fiscalPeriods } = useAccounting();
  const [account, setAccount] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [rate, setRate] = useState("");
  const [rateSource, setRateSource] = useState("");
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [reason, setReason] = useState("");
  const reversalDates = rows
    .filter((row) => row.attemptKind !== "match")
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
  const first = rows[0]!;
  const foreign = first.currency !== "USD";
  const duplicate = rows.some((row) => row.duplicate);
  const incompatible = rows.some(
    (row) => row.currency !== first.currency || Number(row.amount) < 0 !== Number(first.amount) < 0,
  );
  const multipleDates = foreign && rows.some((row) => row.date !== first.date);
  const labels = {
    categorize: "Categorize and post",
    exclude: "Exclude transactions",
    restore: "Restore to Pending",
    undo: "Undo posted transactions",
  };
  const explanations = {
    categorize:
      "Apply the same counterpart account. Each transaction keeps its own bank date and amount. Company approval rules still apply.",
    exclude: "Move the selected transactions to Excluded.",
    restore: "Return the selected transactions to Pending for review.",
    undo: minDate
      ? "Remove matches, reverse entries created by the feed and return the selected transactions to Pending."
      : "Remove the matches and return the selected transactions to Pending.",
  };
  const submit = async () => {
    const scope = { bankAccount: first.account, rowIds: rows.map((row) => row.id) };
    const input: BankBatchAction =
      operation === "categorize"
        ? {
            ...scope,
            operation,
            account,
            costCenterId: costCenter || undefined,
            rate: rate || undefined,
            rateSource: rateSource || undefined,
            confirmDuplicate,
          }
        : operation === "undo"
          ? { ...scope, operation, date: date || undefined, reason: reason || undefined }
          : operation === "exclude"
            ? { ...scope, operation, reason }
            : { ...scope, operation };
    const result = await run(input);
    const summary =
      operation === "categorize"
        ? `${result.posted} posted · ${result.inApproval} in approval.`
        : operation === "exclude"
          ? `${result.count} moved to Excluded.`
          : `${result.count} returned to Pending.`;
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
        void submit().catch(setError).finally(() => setBusy(false));
        }}
      >
        {operation === "categorize" && (
          <>
            {incompatible || multipleDates ? (
              <ErrorMessage
                error={
                  incompatible
                    ? "Select transactions of the same direction and currency."
                    : "Select transactions from one bank date when applying a shared exchange rate."
                }
              />
            ) : (
              <>
                <fieldset disabled={busy} className="min-w-0 space-y-1">
                  <legend className="text-xs font-medium text-ink2">Counterpart account</legend>
                  <SearchableSelect
                    label="Counterpart account"
                    value={account}
                    onChange={setAccount}
                    options={accounts
                      .filter(
                        (item) =>
                          item.code !== first.account &&
                          !accounts.some((child) => child.parentCode === item.code),
                      )
                      .map((item) => ({ value: item.code, label: `${item.code} · ${item.name}` }))}
                    fitViewport
                    required
                  />
                </fieldset>
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
                    <Field name={`Exchange rate · USD per ${first.currency}`}>
                      <input
                        className={fieldStyle}
                        inputMode="decimal"
                        required
                        value={rate}
                        onChange={(event) => setRate(event.target.value)}
                      />
                    </Field>
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
        <ErrorMessage error={error} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <BankSubmit
            busy={busy}
            disabled={
              operation === "categorize" &&
              (incompatible || multipleDates || !account || (duplicate && !confirmDuplicate))
            }
          >
            {labels[operation]}
          </BankSubmit>
        </div>
      </form>
    </BankDialog>
  );
}
