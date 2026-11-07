import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileUp, Paperclip, Plus, Trash2, X } from "lucide-react";
import { useAccounting } from "@/lib/accounting-store";
import { loadBankAttachment, loadBankRow } from "@/lib/bank-feed";
import {
  formatCurrency as bankMoney,
  editableCurrencyAmount as editableAmount,
  downloadBlob as downloadBankBlob,
} from "@/lib/format";
import { bankAmount, itemAmount, type BankCategory } from "@/lib/bank-feed-model";
import { convertedUnits, unitsAmount } from "@/lib/journal-model";
import { externalAccount, sourceCategoryAccount } from "@/lib/statement-csv";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/searchable-select";
import { Badge, Table, Td, Th } from "@/components/ui-kit";
import {
  BankDialog,
  BankSubmit,
  DuplicateConfirmation,
  ErrorMessage,
  Field,
  SelectField,
  fieldStyle,
  type BankDetail,
  type BankList,
  type BankRow,
  type BankRun,
} from "@/components/bank-feed-ui";
import { BankMatch } from "@/components/bank-feed-match";

export type BankReviewView = "details" | "match" | "undo" | "exclude";

export function BankReview({
  row,
  data,
  run,
  close,
  saved,
  initialView,
}: {
  row: BankRow;
  data: BankList;
  run: BankRun;
  close: () => void;
  saved: (message: string) => void;
  initialView: BankReviewView;
}) {
  const { activeCompany, fiscalPeriods } = useAccounting();
  const companyId = activeCompany.id;
  const detail = useQuery({
    queryKey: ["bank-feed", companyId, row.id],
    queryFn: () => loadBankRow({ data: { companyId, rowId: row.id } }),
  });
  const [view, setView] = useState(initialView);
  const [tab, setTab] = useState<"details" | "policies">("details");
  const [reason, setReason] = useState("");
  const originalDate = row.accountingDate ?? row.date;
  const [reversalDate, setReversalDate] = useState(
    fiscalPeriods.some(
      (p) => p.startDate <= originalDate && p.endDate >= originalDate && p.status === "Open",
    )
      ? originalDate
      : "",
  );
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const pending = row.status === "Pending" && !row.attemptId;
  const needsReversal = row.attemptKind !== "match";
  const perform = (input: Parameters<BankRun>[0], message?: string) => {
    setBusy(true);
    setError(null);
    void run(input)
      .then(() => {
        if (message) saved(message);
      })
      .catch(setError)
      .finally(() => setBusy(false));
  };
  const back = () => {
    setView("details");
    setError(null);
  };

  const content = (
    <>
      <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
        <p className="text-xs font-semibold uppercase text-ink3">Full bank description</p>
        <p className="break-words">{row.description}</p>
        {row.fromTo && <p className="text-ink2">From/To · {row.fromTo}</p>}
        {row.checkNumber && <p className="text-ink2">Check number · {row.checkNumber}</p>}
        {row.sourceClass && <p className="text-ink2">QuickBooks class · {row.sourceClass}</p>}
        {row.sourceLocation && (
          <p className="text-ink2">QuickBooks location · {row.sourceLocation}</p>
        )}
        {row.sourceCustomer && (
          <p className="text-ink2">QuickBooks customer · {row.sourceCustomer}</p>
        )}
        {row.externalPosting && (
          <p className="text-ink3">QuickBooks history · {row.externalPosting}</p>
        )}
      </div>
      <ErrorMessage error={error || detail.error} />
      {detail.isPending && <p role="status">Loading transaction details…</p>}
      {view === "match" && detail.data && (
        <BankMatch data={detail.data} run={run} back={back} saved={saved} />
      )}
      {view === "exclude" && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            perform(
              { rowId: row.id, operation: "exclude", reason },
              "Transaction moved to Excluded.",
            );
          }}
        >
          <Field name="Reason for exclusion">
            <input
              className={fieldStyle}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={back}>
              Back
            </Button>
            <BankSubmit busy={busy}>Exclude</BankSubmit>
          </div>
        </form>
      )}
      {view === "undo" && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            perform(
              needsReversal
                ? { rowId: row.id, operation: "undo", reason, date: reversalDate }
                : { rowId: row.id, operation: "undo" },
              "Transaction returned to Pending.",
            );
          }}
        >
          {needsReversal ? (
            <>
              <Field name="Reversal date">
                <input
                  className={fieldStyle}
                  type="date"
                  required
                  min={originalDate}
                  value={reversalDate}
                  onChange={(e) => setReversalDate(e.target.value)}
                />
              </Field>
              <Field name="Reason for reversal">
                <input
                  className={fieldStyle}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            </>
          ) : (
            <p className="text-sm">Remove the match and return this transaction to Pending.</p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={back}>
              Back
            </Button>
            <BankSubmit busy={busy}>
              {needsReversal ? "Reverse and return to Pending" : "Remove match"}
            </BankSubmit>
          </div>
        </form>
      )}
      {view === "details" && detail.data && (
        <>
          {pending && data.canWrite && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" aria-pressed>
                Categorize
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setError(null);
                  setView("match");
                }}
              >
                Match
              </Button>
            </div>
          )}
          <div className="flex gap-2 border-b" aria-label="Transaction details sections">
            <Button
              size="sm"
              variant={tab === "details" ? "secondary" : "ghost"}
              aria-pressed={tab === "details"}
              onClick={() => setTab("details")}
            >
              Details
            </Button>
            <Button
              size="sm"
              variant={tab === "policies" ? "secondary" : "ghost"}
              aria-pressed={tab === "policies"}
              onClick={() => setTab("policies")}
            >
              Policy Reviews
            </Button>
          </div>
          {pending && data.canWrite ? (
            <CategoryForm detail={detail.data} list={data} run={run} saved={saved} tab={tab} />
          ) : tab === "policies" ? (
            <PolicyReview detail={detail.data} date={originalDate} accounts={[]} />
          ) : (
            <PostedDetails detail={detail.data} />
          )}
          {pending && data.canWrite && tab === "details" && detail.data.history.length > 0 && (
            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer font-medium">Previous posting history</summary>
              <div className="mt-3">
                <PostedDetails detail={detail.data} />
              </div>
            </details>
          )}
          {tab === "details" && (
            <Attachments
              companyId={companyId}
              detail={detail.data}
              canWrite={data.canWrite}
              run={run}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {pending && data.canWrite && (
              <Button
                variant="outline"
                onClick={() => {
                  setReason("");
                  setView("exclude");
                }}
              >
                Exclude
              </Button>
            )}
            {row.status === "Excluded" && data.canWrite && (
              <Button
                disabled={busy}
                onClick={() =>
                  perform(
                    { rowId: row.id, operation: "restore" },
                    "Transaction restored to Pending.",
                  )
                }
              >
                Restore to Pending
              </Button>
            )}
            {row.status === "Classified" && data.canWrite && row.attemptKind === "match" && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  perform(
                    { rowId: row.id, operation: "undo" },
                    "Match removed. Transaction returned to Pending.",
                  )
                }
              >
                Undo match
              </Button>
            )}
            {row.status === "Classified" &&
              row.attemptId &&
              row.attemptKind !== "match" &&
              data.canReverse && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setReason("");
                    setView("undo");
                  }}
                >
                  Undo posting
                </Button>
              )}
          </div>
        </>
      )}
    </>
  );
  if (view === "details") {
    return (
      <section className="space-y-3 px-4 py-3" aria-label="Review bank transaction">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Transaction details</h3>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={close}
            aria-label="Close transaction details"
          >
            <X />
          </Button>
        </div>
        {content}
      </section>
    );
  }
  return (
    <BankDialog
      title={
        view === "match"
          ? "Find a match"
          : view === "undo"
            ? "Undo posted transaction"
            : "Exclude transaction"
      }
      description={`${row.account} · ${row.date} · ${bankMoney(row.amount, row.currency)} ${row.currency}`}
      close={close}
      wide={view === "match"}
    >
      {content}
    </BankDialog>
  );
}

function PolicyReview({
  detail,
  date,
  accounts,
}: {
  detail: BankDetail;
  date: string;
  accounts: { code: string; costCenter?: string }[];
}) {
  const { fiscalPeriods } = useAccounting();
  const period = fiscalPeriods.find((p) => p.startDate <= date && p.endDate >= date);
  const checks = accounts.flatMap(({ code, costCenter }) => {
    const rule = detail.rules.find((r) => r.account === code);
    if (!rule) return [];
    const errors: string[] = [];
    if (
      !rule.active ||
      !rule.allowed ||
      (rule.from && date < rule.from) ||
      (rule.to && date > rule.to)
    )
      errors.push(`Account ${code} is restricted on this date.`);
    if (rule.costCenter && !costCenter) errors.push(`Account ${code} requires a cost center.`);
    return errors;
  });
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <p>
        <strong>Accounting date</strong> · {date || "Select a date"} ·{" "}
        {detail.periodClosed ? "Company period closed" : (period?.status ?? "No fiscal period")}
      </p>
      {period?.status === "Soft-Close" && !detail.softClose && (
        <p className="text-down">Posting in soft close requires an additional grant.</p>
      )}
      <p>
        <strong>Journal approval</strong> ·{" "}
        {detail.approvalRequired ? "Required before posting" : "Direct posting allowed"}
      </p>
      {checks.map((check) => (
        <p key={check} className="text-down">
          {check}
        </p>
      ))}
      <Link to="/access" className="text-brand underline">
        Accounting policies & access
      </Link>
    </div>
  );
}

type DraftLine = {
  key: number;
  account: string;
  description: string;
  amount: string;
  customerId: string;
  projectId: string;
  costCenterId: string;
  classId: string;
  sku: string;
  quantity: string;
  unitRate: string;
  billable: boolean;
};
const blankLine = (key: number, amount = ""): DraftLine => ({
  key,
  account: "",
  description: "",
  amount,
  customerId: "",
  projectId: "",
  costCenterId: "",
  classId: "",
  sku: "",
  quantity: "",
  unitRate: "",
  billable: false,
});

function CategoryForm({
  detail,
  list,
  run,
  saved,
  tab,
}: {
  detail: BankDetail;
  list: BankList;
  run: BankRun;
  saved: (message: string) => void;
  tab: "details" | "policies";
}) {
  const { accounts, vendors, customers, inventory, projects, costCenters, dimensions } =
    useAccounting();
  const { row } = detail;
  const out = Number(row.amount) < 0;
  const party = out ? vendors : customers;
  const original = row.amount.replace(/^-/, "");
  const [type, setType] = useState<BankCategory["transactionType"]>(out ? "Expense" : "Deposit");
  const [date, setDate] = useState(row.date);
  const [memo, setMemo] = useState(row.description);
  const [payee, setPayee] = useState(
    (row.partyEdited
      ? row.partyName && row.partyId
      : party.find((p) => row.fromTo && p.displayName.toLowerCase() === row.fromTo.toLowerCase())
          ?.id) ?? "",
  );
  const [location, setLocation] = useState("");
  const [rate, setRate] = useState("");
  const [rateSource, setRateSource] = useState("");
  const [split, setSplit] = useState(false);
  const [lines, setLines] = useState([blankLine(0, original)]);
  const [nextKey, setNextKey] = useState(1);
  const [duplicate, setDuplicate] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [rememberMapping, setRememberMapping] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const postingAccounts = accounts.filter(
    (a) => a.code !== row.account && !accounts.some((child) => child.parentCode === a.code),
  );
  const names = postingAccounts.map((a) => ({ id: a.code, name: a.code + " · " + a.name }));
  const options = (code: string) =>
    dimensions
      .find((d) => d.code.toUpperCase() === code && d.status === "Active")
      ?.options.filter((o) => o.status === "Active") ?? [];
  const mapCode = externalAccount(row.externalPosting, row.sourceFormat);
  const sourceAccount = sourceCategoryAccount(row.externalPosting, row.sourceFormat, accounts);
  const suggested = [
    ...list.rules.flatMap((rule) => {
      const applies =
        rule.kind === "mapping"
          ? rule.pattern === mapCode
          : row.description.toLowerCase().includes(rule.pattern);
      return applies
        ? [
            {
              account: rule.account,
              reason:
                rule.kind === "mapping"
                  ? `Confirmed QuickBooks mapping ${mapCode}`
                  : `Rule matches “${rule.pattern}”`,
            },
          ]
        : [];
    }),
    ...(sourceAccount ? [{ account: sourceAccount, reason: "QuickBooks Match/Categorize" }] : []),
    ...detail.recent.map((rule) => ({
      account: rule.account,
      reason: `${rule.count} previous allocations for ${row.fromTo}`,
    })),
    ...(row.classifiedAccount
      ? [{ account: row.classifiedAccount, reason: "Prior classification" }]
      : []),
  ].filter((s) => postingAccounts.some((a) => a.code === s.account));
  const patch = (key: number, change: Partial<DraftLine>) =>
    setLines((old) =>
      old.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...change };
        if (
          next.sku &&
          next.quantity &&
          next.unitRate &&
          /^\d+(\.\d{1,4})?$/.test(next.quantity) &&
          /^\d+(\.\d{1,4})?$/.test(next.unitRate)
        )
          next.amount = editableAmount(
            itemAmount(next.quantity, next.unitRate, row.currency),
            row.currency,
          );
        return next;
      }),
    );
  let total = 0n;
  let amountInvalid = false;
  let functional: string | undefined;
  try {
    total = lines.reduce((sum, line) => sum + bankAmount(line.amount || "0", row.currency), 0n);
    if (row.currency !== "USD" && rate && Number(rate) > 0)
      functional = unitsAmount(convertedUnits(original, rate));
  } catch {
    amountInvalid = true;
  }
  const difference = bankAmount(original, row.currency) - total;
  const submit = async () => {
    const input: BankCategory = {
      operation: "categorize",
      rowId: row.id,
      transactionType: type,
      date,
      memo,
      payeeId: payee || undefined,
      locationId: location || undefined,
      confirmDuplicate: duplicate,
      rememberMapping,
      rate: rate || undefined,
      rateSource: rateSource || undefined,
      lines: lines.map((l) => ({
        account: l.account,
        description: l.description,
        amount: l.amount,
        customerId: l.customerId || undefined,
        projectId: l.projectId || undefined,
        costCenterId: l.costCenterId || undefined,
        classId: l.classId || undefined,
        sku: l.sku || undefined,
        quantity: l.sku ? l.quantity || undefined : undefined,
        unitRate: l.sku ? l.unitRate || undefined : undefined,
        billable: l.billable,
      })),
    };
    const result = await run(input);
    saved(result.posted ? "Transaction posted." : "Transaction submitted for journal approval.");
  };
  if (tab === "policies")
    return (
      <PolicyReview
        detail={detail}
        date={date}
        accounts={[
          { code: row.account, costCenter: lines[0]?.costCenterId ?? "" },
          ...lines.map((l) => ({ code: l.account, costCenter: l.costCenterId })),
        ]}
      />
    );
  return (
    <form
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.34fr)]"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        void submit()
          .catch(setError)
          .finally(() => setBusy(false));
      }}
    >
      <div className="min-w-0 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field name="Accounting date">
            <input
              required
              className={fieldStyle}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <SelectField
            name="Transaction type"
            value={type}
            change={(value) => {
              if (value) setType(value as BankCategory["transactionType"]);
            }}
            options={[out ? "Expense" : "Deposit", "Transfer", "Card payment"].map((id) => ({
              id,
              name: id,
            }))}
          />
          <fieldset className="min-w-0 space-y-1">
            <legend className="text-xs font-medium text-ink2">
              {out ? "Paid to" : "Received from"}
            </legend>
            <SearchableSelect
              label={out ? "Paid to" : "Received from"}
              value={payee}
              onChange={setPayee}
              options={[
                { value: "", label: "No party selected" },
                ...party.map((p) => ({ value: p.id, label: p.displayName })),
              ]}
              fitViewport
            />
          </fieldset>
          <SelectField
            name="Location"
            value={location}
            change={setLocation}
            options={options("LOCATION")}
            placeholder={options("LOCATION").length ? "Select…" : "No location configured"}
          />
        </div>
        <Field name="Memo">
          <textarea
            className={fieldStyle + " h-auto py-2"}
            rows={2}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </Field>
        {row.currency !== "USD" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field name={`Exchange rate · USD per ${row.currency}`}>
              <input
                required
                className={fieldStyle}
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </Field>
            <Field name="Rate source">
              <input
                required
                className={fieldStyle}
                value={rateSource}
                onChange={(e) => setRateSource(e.target.value)}
              />
            </Field>
            {functional && (
              <p className="text-sm">Functional amount · {bankMoney(functional)} USD</p>
            )}
          </div>
        )}
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{split ? "Split allocations" : "Category"}</h3>
            {!split && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSplit(true);
                  setLines([...lines, blankLine(nextKey)]);
                  setNextKey(nextKey + 1);
                }}
              >
                Split
              </Button>
            )}
          </div>
          {lines.map((line, index) => (
            <fieldset
              key={line.key}
              className="grid gap-2 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <legend className="px-1 text-xs text-ink3">Allocation {index + 1}</legend>
              <SelectField
                name="Account"
                value={line.account}
                change={(account) => patch(line.key, { account })}
                options={names}
              />
              <Field name="Description">
                <input
                  className={fieldStyle}
                  value={line.description}
                  onChange={(e) => patch(line.key, { description: e.target.value })}
                />
              </Field>
              <Field name={`Amount (${row.currency})`}>
                <input
                  required
                  className={fieldStyle}
                  inputMode="decimal"
                  readOnly={!!line.sku}
                  value={line.amount}
                  onChange={(e) => patch(line.key, { amount: e.target.value })}
                />
              </Field>
              <SelectField
                name="Customer"
                value={line.customerId}
                change={(customerId) => patch(line.key, { customerId })}
                options={customers.map((c) => ({ id: c.id, name: c.displayName }))}
              />
              <SelectField
                name="Project"
                value={line.projectId}
                change={(projectId) => patch(line.key, { projectId })}
                options={projects
                  .filter((p) => p.status !== "Completed")
                  .map((p) => ({ id: p.id, name: p.name }))}
              />
              <SelectField
                name="Cost center"
                value={line.costCenterId}
                change={(costCenterId) => patch(line.key, { costCenterId })}
                options={costCenters
                  .filter((c) => c.status === "Active")
                  .map((c) => ({ id: c.id, name: c.name }))}
              />
              <SelectField
                name="Class"
                value={line.classId}
                change={(classId) => patch(line.key, { classId })}
                options={options("CLASS")}
                placeholder={options("CLASS").length ? "Select…" : "No class configured"}
              />
              <SelectField
                name="Product or service"
                value={line.sku}
                change={(sku) =>
                  patch(line.key, {
                    sku,
                    quantity: sku ? line.quantity || "1" : "",
                    unitRate: sku ? line.unitRate : "",
                    amount: "",
                  })
                }
                options={inventory.map((item) => ({
                  id: item.sku,
                  name: item.sku + " · " + item.name,
                }))}
              />
              {line.sku && (
                <>
                  <Field name="Quantity">
                    <input
                      required
                      className={fieldStyle}
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(e) => patch(line.key, { quantity: e.target.value, amount: "" })}
                    />
                  </Field>
                  <Field name="Unit rate">
                    <input
                      required
                      className={fieldStyle}
                      inputMode="decimal"
                      value={line.unitRate}
                      onChange={(e) => patch(line.key, { unitRate: e.target.value, amount: "" })}
                    />
                  </Field>
                </>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={line.billable}
                  onChange={(e) => patch(line.key, { billable: e.target.checked })}
                />
                Billable
              </label>
              {split && lines.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLines(lines.filter((l) => l.key !== line.key))}
                >
                  <Trash2 /> Remove line
                </Button>
              )}
            </fieldset>
          ))}
          {split && (
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={lines.length >= 100}
                onClick={() => {
                  setLines([...lines, blankLine(nextKey)]);
                  setNextKey(nextKey + 1);
                }}
              >
                <Plus /> Add line
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setLines([blankLine(nextKey, original)]);
                  setNextKey(nextKey + 1);
                  setSplit(false);
                }}
              >
                Reset
              </Button>
            </div>
          )}
          <p className="text-right text-sm">
            Allocated {bankMoney(unitsAmount(total), row.currency)} · Original{" "}
            {bankMoney(original, row.currency)} ·{" "}
            <strong className={difference ? "text-down" : ""}>
              Difference {bankMoney(unitsAmount(difference), row.currency)}
            </strong>
          </p>
        </div>
        <DuplicateConfirmation row={row} checked={duplicate} change={setDuplicate} />
        <ErrorMessage error={error} />
        <BankSubmit
          busy={busy}
          disabled={
            !!difference ||
            amountInvalid ||
            lines.some((l) => !l.account || !l.amount) ||
            (row.duplicate && !duplicate)
          }
        >
          {split ? "Split and post" : "Post"}
        </BankSubmit>
      </div>
      <aside className="self-start space-y-2 rounded-md border bg-background p-3 text-sm">
        <h3 className="font-semibold">Suggestions</h3>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={showSuggestions}
            onChange={(e) => setShowSuggestions(e.target.checked)}
          />
          Show suggestions
        </label>
        {showSuggestions &&
          (suggested.length ? (
            <ul className="space-y-1">
              {suggested.map((s, i) => (
                <li key={s.account + i} className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => patch(lines[0]!.key, { account: s.account })}
                  >
                    Use {s.account}
                  </Button>
                  <span>{s.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink3">
              No confirmed mapping, rule, or prior classification applies.
            </p>
          ))}
        {mapCode && lines.length === 1 && (
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={rememberMapping}
              onChange={(e) => setRememberMapping(e.target.checked)}
            />
            Remember QuickBooks account {mapCode} for this company
          </label>
        )}
      </aside>
    </form>
  );
}

function PostedDetails({ detail }: { detail: BankDetail }) {
  const { row, history, allocations, matched } = detail;
  const { accounts, customers, inventory, dimensions } = useAccounting();
  return (
    <div className="space-y-3">
      {row.attemptState === "pending" && <Badge tone="brand">In approval</Badge>}
      {row.status === "Excluded" && <p className="text-sm">Excluded · {row.exclusion}</p>}
      {row.status === "Classified" && !row.attemptId && (
        <p className="text-sm text-down">
          Legacy posting requires a verified journal link for Undo. {row.classifiedAccount}
        </p>
      )}
      {row.legacyJournalId && <p className="text-sm">Legacy journal · {row.legacyJournalId}</p>}
      {history.map((item) => (
        <details
          key={item.id}
          open={item.id === row.attemptId}
          className="rounded-md border p-3 text-sm"
        >
          <summary className="cursor-pointer font-medium capitalize">
            {item.kind} · {item.state} {item.journalNumber ? `· ${item.journalNumber}` : ""}
          </summary>
          {item.date && <p>Accounting date · {item.date}</p>}
          {item.memo && <p className="break-words">Memo · {item.memo}</p>}
          {item.rate && row.currency !== "USD" && (
            <p>
              Rate · {Number(item.rate)} · {item.rateSource}
            </p>
          )}
          {item.locationId && (
            <p>
              Location ·{" "}
              {dimensions.flatMap((d) => d.options).find((o) => o.id === item.locationId)?.name ??
                item.locationId}
            </p>
          )}
          {matched
            .filter((m) => m.attemptId === item.id)
            .map((m) => (
              <p key={m.key}>Matched · {m.reference ?? m.key}</p>
            ))}
          {item.reversalId && <p>Reversal · {item.reversalId}</p>}
          {allocations.some((a) => a.attemptId === item.id) && (
            <Table className="mt-2">
              <thead>
                <tr>
                  <Th>Allocation</Th>
                  <Th>Details</Th>
                  <Th align="right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {allocations
                  .filter((a) => a.attemptId === item.id)
                  .map((a, index) => (
                    <tr key={index}>
                      <Td>
                        {a.documentId ||
                          (a.account && accounts.find((c) => c.code === a.account)?.name) ||
                          a.account}
                      </Td>
                      <Td>
                        {[
                          a.description,
                          inventory.find((i) => i.sku === a.sku)?.name,
                          a.quantity && a.unitRate
                            ? `${Number(a.quantity)} × ${Number(a.unitRate)}`
                            : "",
                          customers.find((c) => c.id === a.customerId)?.displayName,
                          dimensions.flatMap((d) => d.options).find((o) => o.id === a.classId)
                            ?.name,
                          a.billable && "Billable",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Td>
                      <Td align="right">{bankMoney(a.amount, row.currency)}</Td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          )}
        </details>
      ))}
    </div>
  );
}

function Attachments({
  companyId,
  detail,
  canWrite,
  run,
}: {
  companyId: string;
  detail: BankDetail;
  canWrite: boolean;
  run: BankRun;
}) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const rowId = detail.row.id;
  const attachmentInput = useRef<HTMLInputElement>(null);
  const handle = (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    void work()
      .catch(setError)
      .finally(() => setBusy(false));
  };
  return (
    <section
      aria-label="Files"
      className="space-y-2 rounded-md border border-brand/25 bg-brand/5 p-3 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <Paperclip aria-hidden="true" className="size-4 text-brand" />
          Files
        </h3>
        {canWrite && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-brand/35 text-brand hover:bg-brand/10 hover:text-brand"
            disabled={busy}
            onClick={() => attachmentInput.current?.click()}
          >
            <FileUp aria-hidden="true" />
            Upload attachment
          </Button>
        )}
      </div>
      {detail.attachments.map((file) => (
        <div key={file.id} className="flex flex-wrap items-center gap-2">
          <Button
            variant="link"
            size="sm"
            disabled={busy}
            onClick={() =>
              handle(async () => {
                const saved = await loadBankAttachment({ data: { companyId, rowId, id: file.id } });
                const bytes = Uint8Array.from(atob(saved.content), (char) => char.charCodeAt(0));
                downloadBankBlob(saved.name, bytes, "application/octet-stream");
              })
            }
          >
            {file.name}
          </Button>
          <span className="text-xs text-ink3">{Math.ceil(file.size / 1024)} KB</span>
          {canWrite && detail.row.status === "Pending" && !detail.row.attemptId && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                handle(() => run({ operation: "removeAttachment", rowId, id: file.id }))
              }
            >
              Remove
            </Button>
          )}
        </div>
      ))}
      {canWrite && (
        <input
          ref={attachmentInput}
          disabled={busy}
          hidden
          type="file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (!file.size || file.size > 10_000_000) {
              setError("Select a file of up to 10 MB.");
              return;
            }
            handle(async () => {
              const content = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });
              await run({ operation: "attach", rowId, name: file.name, content });
            });
          }}
        />
      )}
      <ErrorMessage error={error} />
    </section>
  );
}
