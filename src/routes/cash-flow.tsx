import { loadParameters } from "@/lib/parameters";
import { useModal } from "@/components/modal-provider";
import { useCompanies } from "@/components/company-context";
import { CashManagementReport } from "@/components/cash-management-report";
import { SearchableSelect } from "@/components/searchable-select";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  loadCashData,
  saveCashAccount,
  saveCashTransaction,
  deleteCashTransaction,
} from "@/lib/cash-flow";
import {
  summarize,
  overduePlanned,
  cashFlowLines,
  transactionSchema,
  type CashFlowLine,
  type CashAccount,
  type CashData,
  type CashTransaction,
  type Interval,
} from "@/lib/cash-flow-model";
import { PageTitle, Panel, Kpi, Table, Th, Td } from "@/components/ui-kit";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { exportToCsv } from "@/lib/format";
export const Route = createFileRoute("/cash-flow")({
  head: () => ({ meta: [{ title: "Cash flow · World Business" }] }),
  component: CashFlowPage,
});
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const relativeDate = (days: number) => {
  const date = new Date(today() + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const control = "w-full rounded-md border border-line bg-white px-3 py-2 text-sm";
const button = "rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const statusLabels = { planned: "Planned", paid: "Actual", cancelled: "Cancelled" };
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
function EntryFormAccountiner({
  modal,
  title,
  companyName,
  onClose,
  children,
}: {
  modal: boolean;
  title: string;
  companyName: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!modal) return <Panel title={title}>{children}</Panel>;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto overscroll-contain"
        style={{ width: "96vw", maxWidth: "1600px" }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="rounded-md border border-brand/20 bg-brand/5 px-3 py-2">
            <span className="block text-xs font-medium text-ink2">Company</span>
            <span className="block text-lg font-bold text-brand">{companyName}</span>
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
function CashFlowPage() {
  const { activeCompany } = useCompanies();
  return activeCompany ? (
    <CompanyCashFlowPage key={activeCompany.id} />
  ) : (
    <p>Select a company to view cash flow.</p>
  );
}
function CompanyCashFlowPage() {
  const { activeCompany } = useCompanies();
  const companyId = activeCompany!.id;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["cash-flow", companyId],
    queryFn: () => loadCashData({ data: { companyId } }),
  });
  const parameters = useQuery({
    queryKey: ["parameters", companyId],
    queryFn: () => loadParameters({ data: { companyId } }),
  });
  const activeCurrencies =
    parameters.data?.currencies.filter((c) => c.status === "Active").map((c) => c.code) ?? [];
  const currencyOptions = useMemo(
    () => [
      ...new Set([
        ...(parameters.data?.currencies.filter((c) => c.status === "Active").map((c) => c.code) ??
          []),
        ...(query.data?.accounts.map((a) => a.currency) ?? []),
      ]),
    ],
    [parameters.data?.currencies, query.data?.accounts],
  );
  const [start, setStart] = useState(() => relativeDate(-28));
  const [end, setEnd] = useState(() => relativeDate(90));
  const [interval, setInterval] = useState<Interval>("weekly");
  const [projected, setProjected] = useState(true);
  const [currency, setCurrency] = useState("USD");
  const [accountId, setAccountId] = useState("");
  useEffect(() => {
    if (currencyOptions.length && !currencyOptions.includes(currency)) {
      setCurrency(currencyOptions[0]!);
      setAccountId("");
    }
  }, [currencyOptions, currency]);
  const [activeTab, setActiveTab] = useState("over-time");
  const [form, setForm] = useState<"account" | "transaction" | null>(null);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [cashFlowLine, setCashFlowLine] = useState<CashFlowLine | "">("");
  const [entryAccount, setEntryAccount] = useState("");
  const [transferAccount, setTransferAccount] = useState("");
  const [amountCents, setAmountCents] = useState("");
  const [openingBalanceCents, setOpeningBalanceCents] = useState("0");
  const [accountCurrency, setAccountCurrency] = useState("USD");
  const [accountName, setAccountName] = useState("");
  const [accountGl, setAccountGl] = useState("");
  const [openingDate, setOpeningDate] = useState(today);
  /** Where the prefilled opening balance came from; cleared once the user edits it. */
  const [openingSource, setOpeningSource] = useState<NonNullable<
    CashData["glAccounts"][number]["knownBalance"]
  > | null>(null);
  const [keepOpen, setKeepOpen] = useState(false);
  const entryFormRef = useRef<HTMLFormElement>(null);
  const continueEntryRef = useRef(false);
  const focusEntryRef = useRef(false);
  const [editing, setEditing] = useState<CashTransaction | null>(null);
  const [editingAccount, setEditingAccount] = useState<CashAccount | null>(null);
  const [status, setStatus] = useState<CashTransaction["status"]>("planned");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const modal = useModal();
  const accounts = query.data?.accounts ?? [];
  const forecastAccounts = accounts.filter((a) => !a.ledger_only);
  const categories = query.data?.categories ?? [];
  const glAccounts = query.data?.glAccounts ?? [];
  const statementPending = query.data?.statementPending ?? [];
  const pendingFor = (code: string | null) =>
    code ? statementPending.find((p) => p.account === code) : undefined;
  /** Ledger history for a GL account: the auto-discovered or configured account that holds it. */
  const ledgerHistory = (code: string) =>
    accounts.find((a) => a.gl_account_code === code && a.ledger_opening_date);
  const configuredOn = (code: string) =>
    accounts.filter((a) => !a.ledger_only && a.gl_account_code === code);
  const cashGlOptions = glAccounts
    .filter((a) => a.type === "Asset")
    .sort((a, b) => Number(b.cash) - Number(a.cash) || a.code.localeCompare(b.code))
    .map((a) => {
      const setUp = configuredOn(a.code).filter((c) => c.id !== editingAccount?.id);
      return {
        value: a.code,
        label: `${a.code} · ${a.name}`,
        detail: setUp.length
          ? `Already set up: ${setUp.map((c) => `${c.name} (${c.currency})`).join(", ")}`
          : a.cash
            ? `Bank / cash${a.currency ? ` · ${a.currency}` : ""}`
            : "Other asset",
      };
    });
  const selectedHistory = accountGl ? ledgerHistory(accountGl) : undefined;
  function openAccountForm(account: CashAccount | null) {
    setEditingAccount(account);
    setOpeningBalanceCents(account ? String(Math.round(account.opening_balance * 100)) : "0");
    setAccountCurrency(account?.currency ?? currency);
    setAccountName(account?.name ?? "");
    setAccountGl(account?.gl_account_code ?? "");
    setOpeningDate(account && !account.ledger_only ? account.opening_date : today());
    setOpeningSource(null);
    setForm("account");
    setError("");
  }
  function chooseAccountGl(code: string) {
    setAccountGl(code);
    if (editingAccount && !editingAccount.ledger_only) return;
    const gl = glAccounts.find((a) => a.code === code);
    const history = ledgerHistory(code);
    const known = history?.currency ?? gl?.currency;
    if (known) setAccountCurrency(known);
    if (gl && !accountName.trim()) setAccountName(gl.name);
    // Without ledger history, open from the balance Bank Feed or QuickBooks already reported.
    const balance = history ? null : (gl?.knownBalance ?? null);
    setOpeningSource(balance);
    if (balance) {
      setOpeningBalanceCents(String(Math.round(balance.amount * 100)));
      if (balance.openingDate) setOpeningDate(balance.openingDate);
    }
  }
  const selectedCurrency =
    accounts.find((a) => a.id === entryAccount)?.currency ?? filteredCurrency();
  function filteredCurrency() {
    return (
      accounts.find((a) => a.id === accountId)?.currency ??
      accounts.find((a) => a.currency === currency)?.currency ??
      accounts[0]?.currency ??
      currency
    );
  }
  const formattedAmount = amountCents
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: selectedCurrency }).format(
        Number(amountCents) / 100,
      )
    : "";
  const transactions = query.data?.transactions ?? [];
  const filteredAccounts = accounts.filter(
    (a) => a.currency === currency && (!accountId || a.id === accountId),
  );
  const defaultEntryAccount =
    forecastAccounts.find((a) => a.id === accountId) ??
    forecastAccounts.find((a) => a.currency === currency) ??
    forecastAccounts[0];
  const ids = new Set(filteredAccounts.map((a) => a.id));
  const filteredTransactions = transactions.filter((t) => ids.has(t.account_id));
  const validRange =
    !!start &&
    !!end &&
    start <= end &&
    new Date(end).getTime() - new Date(start).getTime() <= 366 * 5 * 86400000;
  const report = summarize(
    filteredAccounts,
    filteredTransactions,
    validRange ? start : today(),
    validRange ? end : today(),
    interval,
    projected,
    today(),
  );
  const overdue = overduePlanned(filteredAccounts, filteredTransactions, today());
  const scopeLabel = accountId
    ? (accounts.find((a) => a.id === accountId)?.name ?? "Selected account")
    : `All ${currency} accounts`;
  const money = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  const totalIn = report.periods.reduce((s, p) => s + p.inflows, 0);
  const totalOut = report.periods.reduce((s, p) => s + p.outflows, 0);
  const listed = filteredTransactions.filter((t) => {
    const date = t.paid_date ?? t.due_date;
    return date >= start && date <= end;
  });
  const plannedOutflows =
    listed
      .filter((t) => t.status === "planned" && t.direction === "out")
      .reduce((sum, t) => sum + Math.round(t.amount * 100), 0) / 100;
  async function mutate(action: () => Promise<unknown>, message: string) {
    if (pending) return;
    continueEntryRef.current = form === "transaction" && !editing && keepOpen;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["cash-flow"] });
      await queryClient.invalidateQueries({ queryKey: ["cash-flow-links"] });
      await queryClient.invalidateQueries({ queryKey: ["cash-gl-check"] });
      if (continueEntryRef.current) {
        const entryForm = entryFormRef.current;
        entryForm?.reset();
        setStatus("planned");
        setDirection("in");
        setCashFlowLine("");
        setAmountCents("");
        setEntryAccount("");
        setTransferAccount("");
        focusEntryRef.current = true;
      } else {
        setForm(null);
        setEditing(null);
        setEditingAccount(null);
      }
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save. Please try again.");
    } finally {
      setPending(false);
      if (focusEntryRef.current) {
        focusEntryRef.current = false;
        requestAnimationFrame(() =>
          entryFormRef.current?.querySelector<HTMLTextAreaElement>('[name="description"]')?.focus(),
        );
      }
    }
  }
  function submitAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const configured = editingAccount && !editingAccount.ledger_only ? editingAccount : null;
    // With posted history the General Ledger supplies opening balance and actuals; the stored
    // opening only anchors forecasts, so keep the saved one or start forecasting today.
    const opening = selectedHistory
      ? configured
        ? { opening_date: configured.opening_date, opening_balance: configured.opening_balance }
        : { opening_date: today(), opening_balance: 0 }
      : {
          opening_date: openingDate,
          opening_balance: Number(openingBalanceCents) / 100,
        };
    void mutate(
      () =>
        saveCashAccount({
          data: {
            companyId,
            ...(configured ? { id: configured.id } : {}),
            name: accountName,
            currency: accountCurrency,
            ...opening,
            gl_account_code: accountGl || null,
          },
        }),
      editingAccount && !editingAccount.ledger_only ? "Account updated." : "Account created.",
    );
  }
  function submitTransaction(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!cashFlowLine) {
      setError("Select a cash flow classification for this transaction type.");
      return;
    }
    const parsed = transactionSchema.safeParse({
      ...(editing ? { id: editing.id } : {}),
      account_id: String(f.get("account_id")),
      description: String(f.get("description")),
      category: String(f.get("category")),
      direction,
      amount: Number(amountCents) / 100,
      due_date: String(f.get("due_date")),
      paid_date: status === "paid" ? String(f.get("paid_date")) : null,
      status,
      cash_flow_line: cashFlowLine,
      variance_note: String(f.get("variance_note") ?? ""),
      gl_account_code: String(f.get("gl_account_code") ?? "") || null,
      transfer_account_id: cashFlowLine === "internal_transfer" ? transferAccount || null : null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    void mutate(
      () => saveCashTransaction({ data: { companyId, ...parsed.data } }),
      "Transaction saved.",
    );
  }
  function startEdit(t: CashTransaction) {
    setEditing(t);
    setDirection(t.direction);
    setCashFlowLine(t.cash_flow_line ?? "unclassified");
    setEntryAccount(t.account_id);
    setTransferAccount(t.transfer_account_id ?? "");
    setAmountCents(String(Math.round(t.amount * 100)));
    setStatus(t.status);
    setForm("transaction");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function exportReport() {
    exportToCsv(
      "cash_flow_" + currency + "_" + start + "_" + end,
      [
        "Period",
        "Previous balance",
        "Inflows",
        "Outflows",
        "Recorded opening balances",
        "Net cash flow",
        "Closing balance",
        "Currency",
        "Scope",
        "View",
      ],
      report.periods.map((p) => [
        p.label,
        p.openingBalance,
        p.inflows,
        p.outflows,
        p.adjustments,
        p.net,
        p.balance,
        currency,
        scopeLabel,
        projected ? `Actual + forecast as of ${today()}` : "Actual",
      ]),
    );
  }
  return (
    <div className="space-y-5">
      <PageTitle
        title="Cash flow"
        description="US GAAP cash flow management · operating, investing and financing · weekly forecast vs. actual."
        actions={
          <>
            <Link to="/accounts" className={button}>
              Chart of Accounts
            </Link>
            <Link to="/parameters/cash-categories" className={button}>
              Categories
            </Link>
            <button
              className={button}
              disabled={!query.isSuccess || !activeCurrencies.length || pending}
              onClick={() => {
                openAccountForm(null);
                setActiveTab("accounts");
              }}
            >
              New account
            </button>
            <button
              className={button}
              disabled={!forecastAccounts.length || pending}
              onClick={() => {
                setEditing(null);
                setDirection("in");
                setCashFlowLine("");
                setAmountCents("");
                setEntryAccount("");
                setTransferAccount("");
                setStatus("planned");
                setForm("transaction");
                setError("");
              }}
            >
              New transaction
            </button>
          </>
        }
      />
      {parameters.isError && (
        <p role="alert">
          Unable to load company currencies.{" "}
          <button className="underline" onClick={() => void parameters.refetch()}>
            Try again
          </button>
        </p>
      )}
      {parameters.data && !activeCurrencies.length && (
        <p className="rounded border border-line p-3 text-sm">
          Add an active company currency in{" "}
          <Link className="underline" to="/parameters/currencies">
            Currencies & FX Rates
          </Link>{" "}
          before creating a cash account.
        </p>
      )}
      {query.isPending && <p role="status">Loading data…</p>}
      {query.isError && (
        <div
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          Unable to load cash flow. Check your connection and confirm that
          database/002_cash_flow.sql has been run.
          <button className="ml-3 underline" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded bg-green-50 p-3 text-sm text-green-800">
          {notice}
        </p>
      )}
      {query.isSuccess && (
        <>
          {form && (
            <EntryFormAccountiner
              modal={form === "transaction"}
              companyName={activeCompany!.name}
              onClose={() => {
                if (!pending) {
                  setForm(null);
                  setError("");
                }
              }}
              title={
                form === "account"
                  ? editingAccount
                    ? editingAccount.ledger_only
                      ? "Set up forecasts for this account"
                      : "Edit cash / bank account"
                    : "Add cash / bank account"
                  : editing
                    ? "Edit transaction"
                    : "Add transaction"
              }
            >
              <form
                key={
                  form +
                  (form === "account" ? (editingAccount?.id ?? "new") : (editing?.id ?? "new"))
                }
                ref={entryFormRef}
                onSubmit={form === "account" ? submitAccount : submitTransaction}
                className="p-4"
              >
                {error && (
                  <p role="alert" className="mb-3 text-sm text-red-800">
                    {error}
                  </p>
                )}
                {form === "transaction" && notice && (
                  <p role="status" className="mb-3 text-sm text-green-800">
                    {notice}
                  </p>
                )}
                <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {form === "account" ? (
                    <>
                      <Field label="Bank / cash account from Chart of Accounts">
                        <SearchableSelect
                          label="Cash GL account"
                          name="gl_account_code"
                          value={accountGl}
                          onChange={chooseAccountGl}
                          required
                          autoFocus={!editingAccount}
                          placeholder="Select a bank or cash account"
                          options={cashGlOptions}
                        />
                        <Link to="/accounts" className="text-brand underline">
                          Manage Chart of Accounts
                        </Link>
                      </Field>
                      <Field label="Account name">
                        <input
                          name="name"
                          value={accountName}
                          onChange={(e) => setAccountName(e.target.value)}
                          required
                          maxLength={120}
                          className={control}
                        />
                      </Field>
                      <Field label="Currency">
                        <select
                          name="currency"
                          value={accountCurrency}
                          onChange={(e) => setAccountCurrency(e.target.value)}
                          disabled={!!selectedHistory}
                          className={control}
                        >
                          {[
                            ...new Set([
                              ...activeCurrencies,
                              accountCurrency,
                              ...(editingAccount ? [editingAccount.currency] : []),
                            ]),
                          ].map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </Field>
                      {selectedHistory ? (
                        <div className="rounded-md border border-brand/20 bg-brand/5 p-3 text-sm sm:col-span-2 lg:col-span-3">
                          <p className="font-medium text-ink">
                            Opening balance and actual transactions come from the General Ledger.
                          </p>
                          <p className="mt-1 text-xs text-ink2">
                            First posting on {selectedHistory.ledger_opening_date} in{" "}
                            {selectedHistory.currency}. Posted Bank Feed lines, payments and journal
                            entries for this account appear here automatically; this setup only adds
                            forecasts.
                          </p>
                          {(() => {
                            const waiting = pendingFor(accountGl);
                            return waiting ? (
                              <p className="mt-1 text-xs text-amber-900">
                                {waiting.count} statement line{waiting.count === 1 ? "" : "s"}{" "}
                                (since {waiting.oldest}) still await review in{" "}
                                <Link
                                  to="/statements"
                                  search={{ account: accountGl }}
                                  className="underline"
                                >
                                  Bank Feed
                                </Link>
                                .
                              </p>
                            ) : null;
                          })()}
                        </div>
                      ) : (
                        <>
                          <Field label="Opening balance date">
                            <input
                              name="opening_date"
                              type="date"
                              value={openingDate}
                              onChange={(e) => {
                                setOpeningDate(e.target.value);
                                setOpeningSource(null);
                              }}
                              required
                              className={control}
                            />
                          </Field>
                          <Field label="Opening balance (may be negative)">
                            <input
                              name="opening_balance"
                              type="text"
                              inputMode="text"
                              placeholder={new Intl.NumberFormat("en-US", {
                                style: "currency",
                                currency: accountCurrency,
                              }).format(0)}
                              value={
                                openingBalanceCents === ""
                                  ? ""
                                  : new Intl.NumberFormat("en-US", {
                                      style: "currency",
                                      currency: accountCurrency,
                                    }).format(Number(openingBalanceCents) / 100)
                              }
                              onChange={(e) => {
                                const raw = e.target.value;
                                const digits = raw
                                  .replace(/\D/g, "")
                                  .replace(/^0+/, "")
                                  .slice(0, 14);
                                setOpeningBalanceCents(
                                  raw === ""
                                    ? ""
                                    : `${raw.includes("-") ? "-" : ""}${digits || "0"}`,
                                );
                                setOpeningSource(null);
                              }}
                              required
                              className={control}
                            />
                          </Field>
                          {openingSource ? (
                            <p
                              className={`rounded-md border p-3 text-xs sm:col-span-2 lg:col-span-3 ${openingSource.openingDate ? "border-brand/20 bg-brand/5 text-ink2" : "border-amber-200 bg-amber-50 text-amber-900"}`}
                            >
                              {openingSource.source === "bank-feed"
                                ? `Prefilled from the bank statement balance recorded in Bank Feed as of ${openingSource.asOf}; it opens the next day.`
                                : openingSource.openingDate
                                  ? `Prefilled from the QuickBooks balance imported with the Account List. QuickBooks had posted this account through ${openingSource.asOf}, so it opens the next day.`
                                  : "Prefilled from the QuickBooks balance imported with the Account List. No posted QuickBooks statement shows its date: enter the date that balance was exported."}{" "}
                              Statement lines dated before the opening date do not enter actual
                              cash. Confirm the balance against the bank before saving.
                              {openingSource.unreviewed && (
                                <span className="mt-2 block text-amber-900">
                                  This is the QuickBooks book balance.{" "}
                                  {openingSource.unreviewed.count} bank line
                                  {openingSource.unreviewed.count === 1 ? " was" : "s were"} still
                                  “For review” in QuickBooks
                                  {openingSource.asOf
                                    ? ` through ${openingSource.asOf}`
                                    : ""} (net{" "}
                                  {new Intl.NumberFormat("en-US", {
                                    style: "currency",
                                    currency: accountCurrency,
                                  }).format(openingSource.unreviewed.net)}
                                  ) and are not in it. If they cleared the bank, the bank balance is{" "}
                                  {new Intl.NumberFormat("en-US", {
                                    style: "currency",
                                    currency: accountCurrency,
                                  }).format(
                                    (Math.round(openingSource.amount * 100) +
                                      Math.round(openingSource.unreviewed.net * 100)) /
                                      100,
                                  )}
                                  .{" "}
                                  <button
                                    type="button"
                                    className="underline"
                                    onClick={() => {
                                      const unreviewed = openingSource.unreviewed!;
                                      setOpeningBalanceCents(
                                        String(
                                          Math.round(openingSource.amount * 100) +
                                            Math.round(unreviewed.net * 100),
                                        ),
                                      );
                                      setOpeningSource({ ...openingSource, unreviewed: null });
                                    }}
                                  >
                                    Use bank balance
                                  </button>
                                </span>
                              )}
                            </p>
                          ) : (
                            <p className="text-xs text-ink3">
                              No posted activity or known bank balance for this GL account. The
                              opening balance is the balance at the start of this date, before the
                              transactions for the day.
                            </p>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <Field label="Account">
                        <SearchableSelect
                          label="Account"
                          autoFocus
                          name="account_id"
                          required
                          defaultValue={editing?.account_id ?? defaultEntryAccount?.id ?? ""}
                          onChange={setEntryAccount}
                          options={forecastAccounts.map((a) => ({
                            value: a.id,
                            label: `${a.name} · ${a.currency}`,
                          }))}
                        />
                      </Field>
                      <Field label="Type">
                        <SearchableSelect
                          label="Type"
                          name="direction"
                          value={direction}
                          onChange={(value) => {
                            const nextDirection = value as "in" | "out";
                            setDirection(nextDirection);
                            if (
                              cashFlowLine &&
                              cashFlowLines[cashFlowLine].direction !== null &&
                              cashFlowLines[cashFlowLine].direction !== nextDirection
                            ) {
                              setCashFlowLine("");
                            }
                            setError("");
                          }}
                          options={[
                            { value: "in", label: "Inflow" },
                            { value: "out", label: "Outflow" },
                          ]}
                        />
                      </Field>
                      <Field
                        label={
                          direction === "in" ? "Expected receipt date" : "Expected payment date"
                        }
                      >
                        <input
                          name="due_date"
                          type="date"
                          defaultValue={editing?.due_date ?? today()}
                          required
                          className={control}
                        />
                      </Field>
                      <Field label="Description" className="sm:col-span-2 lg:col-span-3">
                        <textarea
                          rows={3}
                          name="description"
                          defaultValue={editing?.description}
                          required
                          maxLength={240}
                          className={control}
                        />
                      </Field>
                      <Field label="Category">
                        <SearchableSelect
                          label="Category"
                          name="category"
                          defaultValue={editing?.category ?? ""}
                          required
                          placeholder="Select a category"
                          options={Array.from(new Set(categories.map((c) => c.name))).map(
                            (name) => ({ value: name, label: name }),
                          )}
                        />
                        {!categories.length && <span>Add a category in System Parameters.</span>}
                      </Field>
                      {cashFlowLine === "internal_transfer" ? (
                        <Field
                          label={
                            direction === "out" ? "Destination cash account" : "Source cash account"
                          }
                        >
                          {editing ? (
                            <span className={control + " block"}>
                              {accounts.find((a) => a.id === transferAccount)?.name ?? "—"}
                            </span>
                          ) : (
                            <SearchableSelect
                              label="Counterpart cash account"
                              value={transferAccount}
                              onChange={setTransferAccount}
                              required
                              placeholder="Select the other cash account"
                              options={forecastAccounts
                                .filter(
                                  (a) =>
                                    a.currency === selectedCurrency &&
                                    a.id !== (entryAccount || defaultEntryAccount?.id),
                                )
                                .map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))}
                            />
                          )}
                          <span>
                            Both legs are recorded together with the same amount and dates. They are
                            excluded from activities when both accounts are in the selected scope.
                          </span>
                        </Field>
                      ) : (
                        <Field label="GL counterpart account · actual / forecast">
                          <SearchableSelect
                            label="GL counterpart account"
                            name="gl_account_code"
                            defaultValue={editing?.gl_account_code ?? ""}
                            required
                            placeholder="Select an accounting account"
                            options={glAccounts.map((a) => ({
                              value: a.code,
                              label: `${a.code} · ${a.name} · ${a.type}`,
                            }))}
                          />
                          <span>
                            Account associated with this receipt/payment or forecast. Forecasts do
                            not post journal entries.
                          </span>
                          {!glAccounts.length && (
                            <Link to="/accounts" className="block text-brand underline">
                              Create your Chart of Accounts first
                            </Link>
                          )}
                        </Field>
                      )}
                      <Field label="Amount in account currency">
                        <input
                          name="amount"
                          type="text"
                          inputMode="numeric"
                          placeholder={new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: selectedCurrency,
                          }).format(0)}
                          value={formattedAmount}
                          onChange={(e) =>
                            setAmountCents(
                              e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 14),
                            )
                          }
                          required
                          className={control}
                        />
                      </Field>
                      <Field label="US GAAP cash flow classification">
                        <SearchableSelect
                          label="Cash flow classification"
                          name="cash_flow_line"
                          value={cashFlowLine}
                          onChange={(value) => {
                            setCashFlowLine(value as CashFlowLine);
                            setError("");
                          }}
                          required
                          placeholder="Select a cash flow line"
                          options={Object.entries(cashFlowLines)
                            .filter(
                              ([, line]) => line.direction === null || line.direction === direction,
                            )
                            .map(([key, line]) => ({
                              value: key,
                              label: `${line.activity} · ${line.label}`,
                              disabled: line.direction !== null && line.direction !== direction,
                            }))}
                        />
                      </Field>
                      <Field
                        label="Forecast variance explanation"
                        className="sm:col-span-2 lg:col-span-3"
                      >
                        <textarea
                          name="variance_note"
                          rows={2}
                          maxLength={1000}
                          defaultValue={editing?.variance_note ?? ""}
                          className={control}
                          placeholder="Explain amount changes, receipt/payment delays, cancelled sales or unexpected costs."
                        />
                        <span>
                          Planned inflows include future sales; planned outflows include fixed
                          costs, logistics and supplier payments. The first saved plan is preserved
                          when this entry is revised or settled.
                        </span>
                        {editing?.forecast_amount != null && (
                          <span className="block">
                            Original plan: {editing.forecast_direction === "out" ? "−" : "+"}
                            {new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: selectedCurrency,
                            }).format(editing.forecast_amount)}{" "}
                            on {editing.forecast_date}. To preserve history, cancel this entry
                            instead of deleting it.
                          </span>
                        )}
                      </Field>
                      <Field label="Status">
                        <SearchableSelect
                          label="Status"
                          value={status}
                          onChange={(value) => setStatus(value as typeof status)}
                          options={Object.entries(statusLabels).map(([value, label]) => ({
                            value,
                            label,
                          }))}
                        />
                      </Field>
                      {status === "paid" && (
                        <Field label="Receipt / payment date">
                          <input
                            name="paid_date"
                            type="date"
                            defaultValue={editing?.paid_date ?? today()}
                            required
                            className={control}
                          />
                        </Field>
                      )}
                    </>
                  )}
                  {form === "transaction" && !editing && (
                    <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
                      <input
                        type="checkbox"
                        checked={keepOpen}
                        onChange={(e) => setKeepOpen(e.target.checked)}
                        className="h-4 w-4 accent-brand"
                      />
                      Continue adding transactions (keep this window open after saving)
                    </label>
                  )}
                  <div className="flex items-end gap-3">
                    <button className={button}>{pending ? "Saving…" : "Save"}</button>
                    <button
                      type="button"
                      className="text-sm underline"
                      onClick={() => {
                        setForm(null);
                        setError("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </fieldset>
              </form>
            </EntryFormAccountiner>
          )}
          {!accounts.length && (
            <Panel title="No cash accounts or posted cash movements">
              <p className="p-4 text-sm text-ink3">
                Post transactions for a bank account in the General Ledger to see them here, or add
                an account to enter forecasts.
              </p>
            </Panel>
          )}
          <Panel title="Period and view">
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
              <Field label="From">
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className={control}
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className={control}
                />
              </Field>
              <Field label="Group by">
                <select
                  value={interval}
                  onChange={(e) => setInterval(e.target.value as Interval)}
                  className={control}
                >
                  {[
                    ["daily", "Daily"],
                    ["weekly", "Weekly"],
                    ["monthly", "Monthly"],
                    ["quarterly", "Quarterly"],
                    ["yearly", "Yearly"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Currency">
                <select
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value);
                    setAccountId("");
                  }}
                  className={control}
                >
                  {currencyOptions.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Account">
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className={control}
                >
                  <option value="">All in this currency</option>
                  {accounts
                    .filter((a) => a.currency === currency)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="View">
                <select
                  value={projected ? "projected" : "actual"}
                  onChange={(e) => setProjected(e.target.value === "projected")}
                  className={control}
                >
                  <option value="actual">Actual</option>
                  <option value="projected">Actual + forecast</option>
                </select>
              </Field>
            </div>
            <p className="px-4 pb-4 text-xs text-ink3">
              Weeks start on Monday. Actual transactions use the payment date; planned transactions
              use the due date. Amounts are separated by currency without conversion. Cancelled
              transactions do not affect balances.
            </p>
          </Panel>
          {filteredAccounts.some((a) => a.ledger_opening_date) && (
            <p className="rounded-md border border-line p-3 text-sm">
              Accounts with posted activity use the General Ledger for actual balances and
              transactions. Existing manual actuals on these accounts remain visible as reference.
            </p>
          )}
          {(() => {
            // Accounts with only unposted statements have no ledger activity yet; show them
            // in the currency scope so imported banks never look empty without explanation.
            const unlinked = accountId
              ? []
              : statementPending
                  .filter((p) => {
                    // Credit cards are liabilities, not cash; they stay out of this report.
                    const gl = glAccounts.find((a) => a.code === p.account);
                    return (
                      !!gl?.cash &&
                      !accounts.some((a) => a.gl_account_code === p.account) &&
                      (gl.currency ?? "USD") === currency
                    );
                  })
                  .map((p) => p.account);
            const codes = [
              ...new Set([
                ...filteredAccounts.flatMap((a) => (a.gl_account_code ? [a.gl_account_code] : [])),
                ...unlinked,
              ]),
            ];
            const waiting = codes.flatMap((code) => pendingFor(code) ?? []);
            if (!waiting.length) return null;
            const total = waiting.reduce((s, p) => s + p.count, 0);
            return (
              <div
                role="status"
                className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              >
                {total} bank statement line{total === 1 ? "" : "s"} still await review and are not
                in actual cash yet. Review them in Bank Feed:{" "}
                {waiting.map((p, i) => (
                  <span key={p.account}>
                    {i > 0 && ", "}
                    <Link to="/statements" search={{ account: p.account }} className="underline">
                      {p.account} · {glAccounts.find((gl) => gl.code === p.account)?.name ?? ""} (
                      {p.count})
                    </Link>
                  </span>
                ))}
                .
              </div>
            );
          })()}
          {(filteredAccounts.some((a) => !a.gl_account_code) ||
            filteredTransactions.some((t) => !t.gl_account_code)) && (
            <p
              role="status"
              className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            >
              Some existing cash accounts or transactions are not linked to Chart of Accounts. Edit
              them to select the correct GL account; no historical mapping has been assumed.
            </p>
          )}
          {!validRange ? (
            <p role="alert" className="text-red-700">
              Enter a valid period of up to five years.
            </p>
          ) : (
            <>
              {!projected && plannedOutflows > 0 && (
                <p
                  role="status"
                  className="rounded border border-line bg-white p-3 text-sm text-ink2"
                >
                  There are {money(plannedOutflows)} in planned expenses for this period. These are
                  included in the projected balance; the Actual view includes only completed
                  payments.{" "}
                  <button className="text-brand underline" onClick={() => setProjected(true)}>
                    Include planned transactions
                  </button>
                </p>
              )}
              {overdue.length > 0 && (
                <Panel
                  title={`Overdue planned items · ${overdue.length}`}
                  subtitle={`Expected before ${today()} and not settled. They are excluded from the forecast until settled, rescheduled or cancelled.`}
                >
                  <Table>
                    <thead>
                      <tr>
                        <Th>Expected date</Th>
                        <Th>Description</Th>
                        <Th>Account</Th>
                        <Th align="right">Amount</Th>
                        <Th>Action</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {overdue.map((t) => (
                        <tr key={t.id} className="border-t border-line">
                          <Td>{t.due_date.split("-").reverse().join("/")}</Td>
                          <Td>{t.description}</Td>
                          <Td>{accounts.find((a) => a.id === t.account_id)?.name}</Td>
                          <Td
                            align="right"
                            className={t.direction === "out" ? "text-red-700" : "text-blue-700"}
                          >
                            {t.direction === "out" ? "−" : "+"}
                            {money(t.amount)}
                          </Td>
                          <Td>
                            <button
                              disabled={pending}
                              className="text-brand underline"
                              onClick={() => startEdit(t)}
                            >
                              Settle or reschedule
                            </button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Panel>
              )}
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  label={
                    projected && start > today()
                      ? "Projected balance before period"
                      : "Actual balance before period"
                  }
                  value={money(report.opening)}
                  hint={
                    projected && start > today()
                      ? "Actual cash plus planned items expected from today until the period starts. Overdue items are excluded."
                      : "Only realized cash; overdue planned items are not included."
                  }
                />
                <Kpi label="Inflows during period" value={money(totalIn)} tone="up" />
                <Kpi label="Outflows during period" value={money(totalOut)} tone="down" />
                <Kpi
                  label={projected ? "Projected closing balance" : "Actual closing balance"}
                  value={money(report.periods.at(-1)?.balance ?? report.opening)}
                />
              </section>
            </>
          )}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
            <TabsList className="frost h-auto w-full flex-wrap justify-start gap-1.5 p-1.5 border border-line/70">
              <TabsTrigger
                value="over-time"
                className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-xs text-ink2 hover:text-ink py-2 px-3.5 text-xs sm:text-sm font-medium"
              >
                Cash flow over time
              </TabsTrigger>
              <TabsTrigger
                value="statement"
                className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-xs text-ink2 hover:text-ink py-2 px-3.5 text-xs sm:text-sm font-medium"
              >
                Statement of Cash Flows
              </TabsTrigger>
              <TabsTrigger
                value="weekly"
                className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-xs text-ink2 hover:text-ink py-2 px-3.5 text-xs sm:text-sm font-medium"
              >
                Weekly forecast vs. actual
              </TabsTrigger>
              <TabsTrigger
                value="reconciliation"
                className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-xs text-ink2 hover:text-ink py-2 px-3.5 text-xs sm:text-sm font-medium"
              >
                <span className="hidden sm:inline">
                  Supplemental accounting reconciliation · actual · manual inputs
                </span>
                <span className="sm:hidden">Supplemental reconciliation</span>
              </TabsTrigger>
              <TabsTrigger
                value="transactions"
                className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-xs text-ink2 hover:text-ink py-2 px-3.5 text-xs sm:text-sm font-medium"
              >
                Transactions during period
              </TabsTrigger>
              <TabsTrigger
                value="accounts"
                className="data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-xs text-ink2 hover:text-ink py-2 px-3.5 text-xs sm:text-sm font-medium"
              >
                Accounts
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="over-time"
              forceMount
              className="data-[state=inactive]:hidden space-y-4 focus-visible:outline-none"
            >
              {!validRange ? (
                <p role="alert" className="text-red-700">
                  Enter a valid period of up to five years.
                </p>
              ) : (
                <Panel
                  title="Cash flow over time"
                  subtitle={
                    projected
                      ? "Projection based only on recorded transactions, without automatic estimates."
                      : "Transactions actually received or paid."
                  }
                  aside={
                    <button onClick={exportReport} className={button}>
                      Export CSV
                    </button>
                  }
                >
                  <p className="px-4 py-3 text-xs text-ink3">
                    Closing balance = previous balance + recorded opening balances + inflows −
                    outflows. Recorded opening balances are included on each account opening date.
                    Net cash flow equals inflows minus outflows.
                  </p>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Period</Th>
                        <Th align="right">Previous balance</Th>
                        <Th align="right">Inflows</Th>
                        <Th align="right">Outflows</Th>
                        <Th align="right">Recorded opening balances</Th>
                        <Th align="right">Net cash flow</Th>
                        <Th align="right">Closing balance</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.periods.map((p) => (
                        <tr key={p.label} className="border-t border-line">
                          <Td>
                            {interval === "weekly" ? "Week of " : ""}
                            {p.label}
                          </Td>
                          <Td align="right">{money(p.openingBalance)}</Td>
                          <Td align="right">{money(p.inflows)}</Td>
                          <Td align="right">{money(p.outflows)}</Td>
                          <Td align="right">{money(p.adjustments)}</Td>
                          <Td align="right">{money(p.net)}</Td>
                          <Td align="right">{money(p.balance)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Panel>
              )}
            </TabsContent>

            <TabsContent
              value="statement"
              forceMount
              className="data-[state=inactive]:hidden space-y-4 focus-visible:outline-none"
            >
              {!validRange ? (
                <p role="alert" className="text-red-700">
                  Enter a valid period of up to five years.
                </p>
              ) : (
                <CashManagementReport
                  key={`statement-${companyId}-${currency}-${accountId}-${start}-${end}`}
                  accounts={filteredAccounts}
                  transactions={filteredTransactions}
                  start={start}
                  end={end}
                  projected={projected}
                  currency={currency as string}
                  companyId={companyId}
                  accountId={accountId}
                  asOf={today()}
                  section="statement"
                />
              )}
            </TabsContent>

            <TabsContent
              value="weekly"
              forceMount
              className="data-[state=inactive]:hidden space-y-4 focus-visible:outline-none"
            >
              {!validRange ? (
                <p role="alert" className="text-red-700">
                  Enter a valid period of up to five years.
                </p>
              ) : (
                <CashManagementReport
                  key={`weekly-${companyId}-${currency}-${accountId}-${start}-${end}`}
                  accounts={filteredAccounts}
                  transactions={filteredTransactions}
                  start={start}
                  end={end}
                  projected={projected}
                  currency={currency as string}
                  companyId={companyId}
                  accountId={accountId}
                  asOf={today()}
                  section="weekly"
                />
              )}
            </TabsContent>

            <TabsContent
              value="reconciliation"
              forceMount
              className="data-[state=inactive]:hidden space-y-4 focus-visible:outline-none"
            >
              {!validRange ? (
                <p role="alert" className="text-red-700">
                  Enter a valid period of up to five years.
                </p>
              ) : (
                <CashManagementReport
                  key={`reconciliation-${companyId}-${currency}-${accountId}-${start}-${end}`}
                  accounts={filteredAccounts}
                  transactions={filteredTransactions}
                  start={start}
                  end={end}
                  projected={projected}
                  currency={currency as string}
                  companyId={companyId}
                  accountId={accountId}
                  asOf={today()}
                  section="reconciliation"
                />
              )}
            </TabsContent>

            <TabsContent
              value="transactions"
              forceMount
              className="data-[state=inactive]:hidden space-y-4 focus-visible:outline-none"
            >
              {!validRange ? (
                <p role="alert" className="text-red-700">
                  Enter a valid period of up to five years.
                </p>
              ) : (
                <Panel
                  title="Transactions during period"
                  subtitle={
                    projected
                      ? "Planned and actual transactions affect totals. Cancelled transactions do not affect balances."
                      : "Only actual transactions affect totals. Planned and cancelled transactions are shown for reference."
                  }
                >
                  <Table>
                    <thead>
                      <tr>
                        <Th>Due date</Th>
                        <Th>Payment / receipt</Th>
                        <Th>Description / category</Th>
                        <Th>Account</Th>
                        <Th>Status</Th>
                        <Th align="right">Amount</Th>
                        <Th>Actions</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {!listed.length && (
                        <tr>
                          <Td colSpan={7}>No transactions in this period.</Td>
                        </tr>
                      )}
                      {listed.map((t) => (
                        <tr key={t.id} className="border-t border-line">
                          <Td>{t.due_date.split("-").reverse().join("/")}</Td>
                          <Td>{t.paid_date ? t.paid_date.split("-").reverse().join("/") : "—"}</Td>
                          <Td>
                            {t.description}
                            <br />
                            <span className="text-xs text-ink3">{t.category}</span>
                            <br />
                            <span className="text-xs text-ink3">
                              GL:{" "}
                              {t.gl_account_code
                                ? `${t.gl_account_code} · ${glAccounts.find((a) => a.code === t.gl_account_code)?.name ?? ""}`
                                : "Not linked"}
                            </span>
                            <br />
                            <span className="text-xs text-ink3">
                              {cashFlowLines[t.cash_flow_line ?? "unclassified"].label}
                              {t.transfer_account_id &&
                                ` · ${t.direction === "out" ? "to" : "from"} ${accounts.find((a) => a.id === t.transfer_account_id)?.name ?? "another account"}`}
                            </span>
                            {t.variance_note && (
                              <p className="text-xs text-ink2">{t.variance_note}</p>
                            )}
                          </Td>
                          <Td>{accounts.find((a) => a.id === t.account_id)?.name}</Td>
                          <Td>
                            {t.balance_adjustment
                              ? "Ledger adjustment"
                              : t.ledger_posted
                                ? "Actual · General Ledger"
                                : t.reference_only
                                  ? "Manual · reference only"
                                  : statusLabels[t.status]}
                          </Td>
                          <Td
                            align="right"
                            className={`font-medium ${t.direction === "out" ? "text-red-700" : "text-blue-700"}`}
                          >
                            {t.direction === "out" ? "−" : "+"}
                            {money(t.amount)}
                          </Td>
                          <Td>
                            {t.ledger_posted ? (
                              <Link to="/journals" className="text-brand underline">
                                Journal Entries
                              </Link>
                            ) : (
                              <div className="flex gap-3">
                                <button
                                  disabled={pending}
                                  className="text-brand underline"
                                  onClick={() => startEdit(t)}
                                >
                                  Edit
                                </button>
                                <button
                                  disabled={pending || t.forecast_amount != null}
                                  title={
                                    t.forecast_amount != null
                                      ? "Cancel this transaction to preserve forecast history"
                                      : "Delete transaction"
                                  }
                                  className="text-red-700 underline"
                                  onClick={async () => {
                                    const confirmed = await modal.showConfirm({
                                      title: "Delete transaction?",
                                      message: `Permanently delete this transaction? This action cannot be undone.`,
                                      tone: "error",
                                      confirmText: "Delete",
                                      cancelText: "Cancel",
                                    });
                                    if (confirmed) {
                                      void mutate(
                                        () =>
                                          deleteCashTransaction({ data: { id: t.id, companyId } }),
                                        "Transaction deleted.",
                                      );
                                    }
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Panel>
              )}
            </TabsContent>

            <TabsContent
              value="accounts"
              forceMount
              className="data-[state=inactive]:hidden space-y-4 focus-visible:outline-none"
            >
              <Panel title="Accounts">
                <Table>
                  <thead>
                    <tr>
                      <Th>Account</Th>
                      <Th>Currency</Th>
                      <Th>Linked GL account</Th>
                      <Th>Opening date</Th>
                      <Th align="right">Opening balance</Th>
                      <Th>Bank Feed</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.id} className="border-t border-line">
                        <Td>{a.name}</Td>
                        <Td>{a.currency}</Td>
                        <Td>
                          {a.gl_account_code
                            ? `${a.gl_account_code} · ${glAccounts.find((gl) => gl.code === a.gl_account_code)?.name ?? ""}`
                            : "Not linked"}
                        </Td>
                        <Td>{a.ledger_opening_date ?? a.opening_date}</Td>
                        <Td align="right">
                          {a.ledger_opening_date
                            ? "From General Ledger"
                            : new Intl.NumberFormat("en-US", {
                                style: "currency",
                                currency: a.currency,
                              }).format(a.opening_balance)}
                        </Td>
                        <Td>
                          {(() => {
                            const waiting = pendingFor(a.gl_account_code);
                            return waiting ? (
                              <Link
                                to="/statements"
                                search={{ account: a.gl_account_code! }}
                                className="text-amber-800 underline"
                              >
                                {waiting.count} to review
                              </Link>
                            ) : a.gl_account_code &&
                              glAccounts.find((gl) => gl.code === a.gl_account_code)?.cash ? (
                              <span className="text-ink3">Up to date</span>
                            ) : (
                              <span className="text-ink3">—</span>
                            );
                          })()}
                        </Td>
                        <Td>
                          <button
                            type="button"
                            disabled={pending}
                            className="text-brand underline"
                            onClick={() => {
                              openAccountForm(a);
                              setNotice("");
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            {a.ledger_only ? "Set up forecasts" : "Edit"}
                          </button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Panel>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
