import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, FileUp, Printer, Settings2 } from "lucide-react";
import { AccountingProvider, useAccounting } from "@/lib/accounting-store";
import { bankSourceAccount } from "@/lib/bank-feed-model";
import { formatCurrency as bankMoney, downloadBlob as downloadBankBlob } from "@/lib/format";
import {
  loadBankFeed,
  loadBankFile,
  loadBankRegister,
  previewBankFile,
  runBankAction,
  uploadBankFile,
} from "@/lib/bank-feed";
import { Badge, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { BankReview } from "@/components/bank-feed-review";
import { SearchableSelect } from "@/components/searchable-select";
import {
  BankDialog,
  BankSubmit,
  ErrorMessage,
  Field,
  SelectField,
  fieldStyle,
  type BankList,
  type BankRow,
  type BankRun,
} from "@/components/bank-feed-ui";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/statements")({
  head: () =>
    pageHead("Bank Feed · LedgerX", "Review, match, and post bank or credit card transactions."),
  component: () => (
    <AccountingProvider>
      <StatementsPage />
    </AccountingProvider>
  ),
});

const statuses = [
  { id: "Pending", name: "Pending" },
  { id: "Classified", name: "Posted" },
  { id: "Excluded", name: "Excluded" },
] as const;
const optionalColumns = ["Party", "Source posting", "Status"] as const;
const pageSize = 50;
type Column = (typeof optionalColumns)[number];

function StatementsPage() {
  const { activeCompany } = useAccounting();
  return <CompanyFeed key={activeCompany.id} />;
}

function CompanyFeed() {
  const { activeCompany, accounts } = useAccounting();
  const companyId = activeCompany.id;
  const cache = useQueryClient();
  const feed = useQuery({
    queryKey: ["bank-feed", companyId],
    queryFn: () => loadBankFeed({ data: { companyId } }),
  });
  const [accountChoice, setAccountChoice] = useState("");
  const [status, setStatus] = useState<BankRow["status"]>("Pending");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [direction, setDirection] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState("");
  const [dialog, setDialog] = useState<
    "import" | "archive" | "settings" | "balance" | "register" | "rules" | null
  >(null);
  const [columns, setColumns] = useState<Column[]>([...optionalColumns]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["bank-feed", companyId] }),
      cache.invalidateQueries({ queryKey: ["accounting", companyId] }),
      cache.invalidateQueries({ queryKey: ["journal-list", companyId] }),
      cache.invalidateQueries({ queryKey: ["trial-balance", companyId] }),
    ]);
  };
  const run: BankRun = async (input) => {
    const result = await runBankAction({ data: { companyId, input } });
    await refresh();
    return result;
  };
  if (feed.isPending) return <p role="status">Loading Bank Feed…</p>;
  if (feed.isError)
    return (
      <>
        <ErrorMessage error={feed.error} />
        <Button variant="outline" onClick={() => void feed.refetch()}>
          Retry
        </Button>
      </>
    );
  const data = feed.data;
  const sourceAccounts = accounts.filter((a) => bankSourceAccount(a, accounts));
  const accountCodes = new Set([
    ...sourceAccounts.map((a) => a.code),
    ...data.files.map((f) => f.account),
  ]);
  const account = accountCodes.has(accountChoice)
    ? accountChoice
    : (data.files[0]?.account ?? sourceAccounts[0]?.code ?? "");
  const bankBalance = data.balances.find((b) => b.account === account);
  const accountName = (code: string) => accounts.find((a) => a.code === code)?.name ?? code;
  const accountCurrency = (code: string) =>
    data.files.find((f) => f.account === code)?.currency ??
    data.balances.find((b) => b.account === code)?.currency ??
    data.cashAccounts.find((a) => a.account === code)?.currency;
  const rows = data.rows.filter((r) => r.account === account);
  const filter = search.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      row.status === status &&
      (!from || row.date >= from) &&
      (!to || row.date <= to) &&
      (!direction || (Number(row.amount) < 0 ? "out" : "in") === direction) &&
      (!filter ||
        [row.description, row.fromTo, row.externalPosting, row.journalNumber ?? ""].some((v) =>
          v.toLowerCase().includes(filter),
        )),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const row = rows.find((r) => r.id === selected);
  const close = () => {
    setDialog(null);
    setError(null);
  };
  const handle = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const table = (items: BankRow[], printable = false) => (
    <Table>
      <thead className="border-b bg-muted/40">
        <tr>
          <Th>Date</Th>
          <Th>Full bank description</Th>
          <Th align="right">Amount</Th>
          {columns.map((column) => (
            <Th key={column}>{column}</Th>
          ))}
          {!printable && <Th>Action</Th>}
        </tr>
      </thead>
      <tbody>
        {items.map((r) => (
          <tr key={r.id} className="border-b border-line/50 hover:bg-muted/30">
            <Td className="whitespace-nowrap">{r.date}</Td>
            <Td className="min-w-52 max-w-lg">
              {printable ? (
                r.description
              ) : (
                <button
                  className="block max-w-full truncate text-left font-medium hover:underline"
                  title={r.description}
                  onClick={() => setSelected(r.id)}
                >
                  {r.description}
                </button>
              )}
              {r.duplicate && <Badge tone="down">Possible duplicate</Badge>}
            </Td>
            <Td
              align="right"
              className={
                Number(r.amount) < 0 ? "whitespace-nowrap text-down" : "whitespace-nowrap text-up"
              }
            >
              {bankMoney(r.amount, r.currency)}
            </Td>
            {columns.includes("Party") && <Td>{r.fromTo || "—"}</Td>}
            {columns.includes("Source posting") && (
              <Td className="max-w-56 truncate" title={r.externalPosting}>
                {r.externalPosting || "—"}
              </Td>
            )}
            {columns.includes("Status") && (
              <Td>
                <Badge tone={r.status === "Classified" ? "up" : "neutral"}>
                  {r.attemptState === "pending"
                    ? "In approval"
                    : statuses.find((tab) => tab.id === r.status)?.name}
                </Badge>
                {r.journalNumber && <div className="mt-1 text-xs">{r.journalNumber}</div>}
              </Td>
            )}
            {!printable && (
              <Td>
                <Button variant="ghost" size="sm" onClick={() => setSelected(r.id)}>
                  {r.status === "Pending" && !r.attemptId && data.canWrite ? "Review" : "Details"}
                </Button>
              </Td>
            )}
          </tr>
        ))}
        {!items.length && (
          <tr>
            <Td className="py-7 text-ink3" colSpan={3 + columns.length + (printable ? 0 : 1)}>
              No transactions for these filters.
            </Td>
          </tr>
        )}
      </tbody>
    </Table>
  );

  return (
    <div className="space-y-4">
      <PageTitle
        title="Bank Feed"
        description={`${activeCompany.name} · Bank and credit card transactions`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" onClick={() => setDialog("archive")}>
              Archive
            </Button>
            {data.canWrite && (
              <Button onClick={() => setDialog("import")}>
                <FileUp /> Import CSV
              </Button>
            )}
          </div>
        }
      />
      <div className="grid auto-cols-[minmax(13rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2 print:hidden">
        {[...accountCodes].map((code) => {
          const balance = data.balances.find((b) => b.account === code);
          const pending = data.rows.filter(
            (r) => r.account === code && r.status === "Pending",
          ).length;
          return (
            <button
              type="button"
              key={code}
              aria-pressed={account === code}
              onClick={() => {
                setAccountChoice(code);
                setPage(0);
                setSelected("");
                setNotice("");
              }}
              className={`rounded-lg border p-3 text-left ${account === code ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-line bg-background"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold">
                  {code} · {accountName(code)}
                </span>
                <Badge>{pending}</Badge>
              </div>
              <div className="mt-2 text-sm">
                Bank {balance ? bankMoney(balance.amount, balance.currency) : "—"}
              </div>
              <div className="text-xs text-ink3">
                Posted {bankMoney(data.posted.find((b) => b.account === code)?.amount ?? "0")} USD
              </div>
            </button>
          );
        })}
      </div>
      {!account && (
        <p className="text-sm text-ink3">
          Create an analytical bank or credit card account to begin.
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md bg-up/10 p-2 text-sm">
          {notice}
        </p>
      )}
      {account && (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3 print:hidden">
            <div className="flex flex-wrap gap-1" aria-label="Bank Feed status">
              {statuses.map((tab) => (
                <Button
                  key={tab.id}
                  size="sm"
                  variant={tab.id === status ? "secondary" : "ghost"}
                  aria-pressed={tab.id === status}
                  onClick={() => {
                    setStatus(tab.id);
                    setPage(0);
                  }}
                >
                  {tab.name} ({rows.filter((r) => r.status === tab.id).length})
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              <Button variant="ghost" size="sm" onClick={() => setDialog("register")}>
                Bank register
              </Button>
              {data.canWrite && (
                <Button variant="ghost" size="sm" onClick={() => setDialog("balance")}>
                  {bankBalance ? `Balance as of ${bankBalance.date}` : "Set bank balance"}
                </Button>
              )}
              {data.canWrite && (
                <Button variant="ghost" size="sm" onClick={() => setDialog("rules")}>
                  Mapping & rules
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2 p-3 print:hidden">
            <Field name="Search">
              <input
                className={fieldStyle}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Description or party"
              />
            </Field>
            <Field name="From">
              <input
                className={fieldStyle}
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(0);
                }}
              />
            </Field>
            <Field name="To">
              <input
                className={fieldStyle}
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(0);
                }}
              />
            </Field>
            <SelectField
              name="Direction"
              placeholder="All movements"
              value={direction}
              change={(value) => {
                setDirection(value);
                setPage(0);
              }}
              options={[
                { id: "in", name: "Money in" },
                { id: "out", name: "Money out" },
              ]}
            />
            <div className="ml-auto flex gap-1">
              <Button
                variant="outline"
                size="icon"
                title="Print filtered transactions"
                aria-label="Print filtered transactions"
                onClick={() => window.print()}
              >
                <Printer />
              </Button>
              <Button
                variant="outline"
                size="icon"
                title="Export filtered CSV"
                aria-label="Export filtered CSV"
                onClick={() => exportRows(filtered)}
              >
                <Download />
              </Button>
              <Button
                variant="outline"
                size="icon"
                title="Choose columns"
                aria-label="Choose columns"
                onClick={() => setDialog("settings")}
              >
                <Settings2 />
              </Button>
            </div>
          </div>
          <div className="print:hidden">
            {table(filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize))}
          </div>
          <div className="hidden print:block">
            <p>
              {account} · {accountName(account)} · {statuses.find((tab) => tab.id === status)?.name}
            </p>
            {table(filtered, true)}
          </div>
          <div className="flex items-center justify-end gap-2 p-3 text-sm print:hidden">
            <span>
              {filtered.length} transactions · Page {currentPage + 1} of {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage + 1 === pages}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </Panel>
      )}
      {row && (
        <BankReview
          key={row.id}
          row={row}
          data={data}
          run={run}
          close={() => setSelected("")}
          saved={(message) => {
            setNotice(message);
            setSelected("");
          }}
        />
      )}
      {dialog === "import" && (
        <ImportDialog
          account={account}
          companyId={companyId}
          sourceAccounts={sourceAccounts}
          accountCurrency={accountCurrency}
          close={close}
          done={(code, count) => {
            setAccountChoice(code);
            setStatus("Pending");
            setPage(0);
            setNotice(`${count} transactions imported to Pending.`);
            close();
            void refresh();
          }}
        />
      )}
      {dialog === "archive" && (
        <BankDialog
          title="Statement archive"
          description="Original CSV uploads for the selected company."
          close={close}
          wide
        >
          <ErrorMessage error={error} />
          <Table>
            <thead>
              <tr>
                <Th>File</Th>
                <Th>Account</Th>
                <Th>Rows</Th>
                <Th>Uploaded</Th>
                <Th>Download</Th>
              </tr>
            </thead>
            <tbody>
              {data.files.map((file) => (
                <tr key={file.id} className="border-b">
                  <Td>{file.name}</Td>
                  <Td>
                    {file.account} · {file.currency}
                  </Td>
                  <Td>{file.count}</Td>
                  <Td>{file.uploadedAt.slice(0, 10)}</Td>
                  <Td>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void handle(async () => {
                          const saved = await loadBankFile({ data: { companyId, id: file.id } });
                          downloadBankBlob(saved.name, saved.content, "text/csv");
                        })
                      }
                    >
                      Download
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!data.files.length && <p className="text-sm text-ink3">No archived statements.</p>}
        </BankDialog>
      )}
      {dialog === "settings" && (
        <BankDialog
          title="Visible columns"
          description="Date, description, and amount are always shown."
          close={close}
        >
          {optionalColumns.map((column) => (
            <label key={column} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={columns.includes(column)}
                onChange={(e) =>
                  setColumns(
                    optionalColumns.filter((candidate) =>
                      candidate === column ? e.target.checked : columns.includes(candidate),
                    ),
                  )
                }
              />
              {column}
            </label>
          ))}
        </BankDialog>
      )}
      {dialog === "balance" && (
        <BalanceDialog
          close={close}
          run={run}
          account={account}
          currency={accountCurrency(account)}
          current={bankBalance}
        />
      )}
      {dialog === "register" && (
        <RegisterDialog companyId={companyId} account={account} close={close} />
      )}
      {dialog === "rules" && <RulesDialog data={data} close={close} run={run} />}
    </div>
  );
}

function exportRows(rows: BankRow[]) {
  const quote = (value: string) =>
    '"' + (/^[\s]*[=+\-@]/.test(value) ? "'" : "") + value.replaceAll('"', '""') + '"';
  const csv = [
    "date,description,amount,currency,from/to,source posting,status",
    ...rows.map((r) =>
      [
        r.date,
        quote(r.description),
        r.amount,
        r.currency,
        quote(r.fromTo),
        quote(r.externalPosting),
        r.status === "Classified" ? "Posted" : r.status,
      ].join(","),
    ),
  ].join("\r\n");
  downloadBankBlob("bank-feed.csv", "\uFEFF" + csv, "text/csv;charset=utf-8");
}

function ImportDialog({
  account,
  companyId,
  sourceAccounts,
  accountCurrency,
  close,
  done,
}: {
  account: string;
  companyId: string;
  sourceAccounts: ReturnType<typeof useAccounting>["accounts"];
  accountCurrency: (code: string) => string | undefined;
  close: () => void;
  done: (code: string, count: number) => void;
}) {
  const { currencies } = useAccounting();
  const [code, setCode] = useState(sourceAccounts.find((a) => a.code === account)?.code ?? "");
  const [currency, setCurrency] = useState(accountCurrency(code) ?? "USD");
  const [file, setFile] = useState<{ name: string; content: string }>();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const data = {
    companyId,
    account: code,
    currency,
    fileName: file?.name ?? "",
    content: file?.content ?? "",
  };
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewBankFile>>>();
  return (
    <BankDialog
      title="Import bank or card CSV"
      description="QuickBooks Bank Transactions exports and the LedgerX CSV template are supported."
      close={close}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const submit = async () => {
            if (!preview) setPreview(await previewBankFile({ data }));
            else {
              const result = await uploadBankFile({ data });
              done(code, result.count);
            }
          };
          void submit()
            .catch(setError)
            .finally(() => setBusy(false));
        }}
      >
        <fieldset className="min-w-0 space-y-1" disabled={busy}>
          <legend className="text-xs font-medium text-ink2">Bank or credit card account</legend>
          <SearchableSelect
            label="Bank or credit card account"
            placeholder="Select an account"
            value={code}
            onChange={(value) => {
              if (value === code) return;
              setCode(value);
              setCurrency(accountCurrency(value) ?? "USD");
              setPreview(undefined);
            }}
            options={sourceAccounts.map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }))}
            required
            fitViewport
          />
        </fieldset>
        <SelectField
          name="Statement currency"
          value={currency}
          change={(value) => {
            setCurrency(value);
            setPreview(undefined);
          }}
          options={currencies
            .filter(
              (c) =>
                c.status === "Active" &&
                (!accountCurrency(code) || c.code === accountCurrency(code)),
            )
            .map((c) => ({ id: c.code, name: c.code + " · " + c.name }))}
        />
        <Field name="CSV file">
          <input
            className="block max-w-full text-sm"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const value = e.target.files?.[0];
              setFile(undefined);
              setPreview(undefined);
              setError(null);
              if (!value) return;
              if (value.size > 2_000_000) {
                setError("Select a CSV of up to 2 MB.");
                return;
              }
              setBusy(true);
              void value
                .arrayBuffer()
                .then((bytes) => {
                  const content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
                    bytes,
                  );
                  setFile({ name: value.name, content });
                })
                .catch(() => setError("Save the CSV in UTF-8 and try again."))
                .finally(() => setBusy(false));
            }}
          />
        </Field>
        <Button
          type="button"
          size="sm"
          variant="link"
          onClick={() =>
            downloadBankBlob(
              "bank-feed-template.csv",
              "date,description,amount\r\n2026-01-15,Example bank fee,-10.00\r\n",
              "text/csv",
            )
          }
        >
          Download CSV template
        </Button>
        <ErrorMessage error={error} />
        {preview && (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p>
              <strong>{preview.count} transactions</strong> · Net{" "}
              {bankMoney(preview.total, currency)}
            </p>
            {!!preview.duplicates && <p>{preview.duplicates} rows flagged for duplicate review.</p>}
            {preview.duplicateBatch && <ErrorMessage error="This batch was already imported." />}
            {preview.sample.map((r, index) => (
              <p className="truncate" key={index}>
                {r.date} · {bankMoney(r.amount, currency)} · {r.description}
              </p>
            ))}
          </div>
        )}
        <BankSubmit busy={busy} disabled={!file || !code || !currency || !!preview?.duplicateBatch}>
          {preview ? "Import to Pending" : "Preview CSV"}
        </BankSubmit>
      </form>
    </BankDialog>
  );
}

function BalanceDialog({
  close,
  run,
  account,
  currency,
  current,
}: {
  close: () => void;
  run: BankRun;
  account: string;
  currency: string | undefined;
  current: BankList["balances"][number] | undefined;
}) {
  const { currencies } = useAccounting();
  const [selectedCurrency, setCurrency] = useState(currency ?? "USD");
  const [date, setDate] = useState(current?.date ?? new Date().toLocaleDateString("en-CA"));
  const [amount, setAmount] = useState(current?.amount ?? "");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <BankDialog
      title="Bank statement balance"
      description="Record the reported balance for its statement date."
      close={close}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          void run({ operation: "balance", account, currency: selectedCurrency, date, amount })
            .then(close)
            .catch(setError)
            .finally(() => setBusy(false));
        }}
      >
        <SelectField
          name="Currency"
          value={selectedCurrency}
          change={setCurrency}
          options={currencies
            .filter((c) => c.status === "Active" && (!currency || currency === c.code))
            .map((c) => ({ id: c.code, name: c.code }))}
        />
        <Field name="Balance date">
          <input
            className={fieldStyle}
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field name="Reported balance">
          <input
            className={fieldStyle}
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <ErrorMessage error={error} />
        <BankSubmit busy={busy}>Save balance</BankSubmit>
      </form>
    </BankDialog>
  );
}

function RegisterDialog({
  companyId,
  account,
  close,
}: {
  companyId: string;
  account: string;
  close: () => void;
}) {
  const query = useQuery({
    queryKey: ["bank-feed", companyId, "register", account],
    queryFn: () => loadBankRegister({ data: { companyId, account } }),
  });
  return (
    <BankDialog
      title="Bank register"
      description={`Posted general ledger movements for account ${account}.`}
      close={close}
      wide
    >
      <ErrorMessage error={query.error} />
      {query.isPending && <p role="status">Loading register…</p>}
      <Table>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Journal</Th>
            <Th>Description</Th>
            <Th align="right">Amount (USD)</Th>
          </tr>
        </thead>
        <tbody>
          {query.data?.map((m) => (
            <tr key={m.key} className="border-b">
              <Td>{m.date}</Td>
              <Td>{m.reference}</Td>
              <Td>{m.description}</Td>
              <Td align="right">{bankMoney(m.base)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </BankDialog>
  );
}

function RulesDialog({ data, close, run }: { data: BankList; close: () => void; run: BankRun }) {
  const { accounts } = useAccounting();
  const [kind, setKind] = useState<"mapping" | "rule">("mapping");
  const [pattern, setPattern] = useState("");
  const [account, setAccount] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const save = (input: Parameters<BankRun>[0]) => {
    setBusy(true);
    setError(null);
    void run(input)
      .then(() => setPattern(""))
      .catch(setError)
      .finally(() => setBusy(false));
  };
  return (
    <BankDialog
      title="Account mapping and rules"
      description="Save confirmed account mappings or description rules for future suggestions."
      close={close}
    >
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          save({ operation: "rule", kind, pattern, account });
        }}
      >
        <SelectField
          name="Suggestion type"
          value={kind}
          change={(value) => setKind(value === "rule" ? "rule" : "mapping")}
          options={[
            { id: "mapping", name: "QuickBooks account mapping" },
            { id: "rule", name: "Description contains" },
          ]}
        />
        <Field name={kind === "mapping" ? "QuickBooks account number" : "Text in bank description"}>
          <input
            className={fieldStyle}
            value={pattern}
            required
            onChange={(e) => setPattern(e.target.value)}
          />
        </Field>
        <SelectField
          name="LedgerX posting account"
          value={account}
          change={setAccount}
          options={accounts
            .filter((a) => !accounts.some((child) => child.parentCode === a.code))
            .map((a) => ({ id: a.code, name: a.code + " · " + a.name }))}
        />
        <ErrorMessage error={error} />
        <BankSubmit busy={busy} disabled={!pattern.trim() || !account}>
          Save suggestion
        </BankSubmit>
      </form>
      <ul className="divide-y">
        {data.rules.map((rule) => (
          <li key={rule.id} className="flex items-center justify-between gap-2 py-1 text-sm">
            <span>
              {rule.kind === "mapping" ? "Account" : "Contains"} {rule.pattern} → {rule.account}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => save({ operation: "removeRule", id: rule.id })}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </BankDialog>
  );
}
