import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccounting } from "@/lib/accounting-store";
import { loadBankReportArchive, loadBankReportFile, submitBankReport } from "@/lib/bank-feed";
import { bankSourceAccount } from "@/lib/bank-feed-model";
import {
  bankReportAmount,
  bankReportGroupCsv,
  readBankReportCsv,
  readBankReportXlsx,
  type BankReportGroup,
} from "@/lib/bank-transaction-report";
import { downloadBlob, formatCurrency } from "@/lib/format";
import {
  BankDialog,
  BankSubmit,
  ErrorMessage,
  Field,
  SelectField,
  fieldStyle,
} from "./bank-feed-ui";
import { PaginationBar, usePagination } from "./data-list";
import { SearchableSelect } from "./searchable-select";
import { Button } from "./ui/button";
import { Table, Td, Th } from "./ui-kit";

type Mapping = { subgroup: string; account: string; currency: string };
type PreviewDestination = Pick<Mapping, "account" | "currency"> & { creditCard: boolean };
const emptyMapping: Mapping = { subgroup: "", account: "", currency: "USD" };

function ReportTransactionGrid({
  groups,
  destinations,
}: {
  groups: BankReportGroup[];
  destinations: Map<number, PreviewDestination> | undefined;
}) {
  const [groupFilter, setGroupFilter] = useState("");
  const rows = groups
    .filter((group) => !groupFilter || String(group.id) === groupFilter)
    .flatMap((group) => group.rows.map((row, index) => ({ group, row, index })));
  const { pageRows, ...pagination } = usePagination(rows, groupFilter);

  return (
    <section aria-label="Report transactions" className="min-w-0 space-y-2">
      <h3 className="text-sm font-semibold">
        {destinations ? "Transactions to import" : "Report transactions"}
      </h3>
      <SelectField
        name="Filter transactions by source group"
        value={groupFilter}
        change={setGroupFilter}
        placeholder="All groups"
        options={groups
          .filter((group) => group.rows.length > 0)
          .map((group) => ({ id: String(group.id), name: group.name }))}
      />
      <div className="rounded-md border border-line">
        <div
          className="max-h-[46dvh] overflow-auto"
          tabIndex={0}
          role="region"
          aria-label="Transaction grid"
        >
          <table className="w-full text-[13px] tabular-nums">
            <caption className="sr-only">Transactions from the QuickBooks report</caption>
            <thead className="sticky top-0 bg-background">
              <tr className="whitespace-nowrap">
                <Th>Date</Th>
                <Th>Description</Th>
                <Th align="right">{destinations ? "Import amount" : "Report amount"}</Th>
                <Th>Source group</Th>
                {destinations && <Th>Destination account</Th>}
                <Th>Transaction type</Th>
                <Th>Num</Th>
                <Th>Name</Th>
                <Th>Split account</Th>
                <Th>Class</Th>
                <Th>Location</Th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(({ group, row, index }) => {
                const [
                  date,
                  description,
                  amount,
                  name,
                  split,
                  ,
                  sourceClass,
                  location,
                  type,
                  reference,
                ] = row;
                const destination = destinations?.get(group.id);
                return (
                  <tr className="border-t border-line" key={`${group.id}:${index}`}>
                    <Td className="whitespace-nowrap">{date}</Td>
                    <Td className="min-w-64 break-words">{description}</Td>
                    <Td className="whitespace-nowrap" align="right">
                      {destination?.currency}{" "}
                      {bankReportAmount(amount, destination?.creditCard ?? false)}
                    </Td>
                    <Td className="min-w-44">{group.name}</Td>
                    {destinations && <Td>{destination?.account}</Td>}
                    <Td>{type}</Td>
                    <Td>{reference}</Td>
                    <Td className="min-w-36">{name}</Td>
                    <Td className="min-w-44">{split}</Td>
                    <Td>{sourceClass}</Td>
                    <Td>{location}</Td>
                  </tr>
                );
              })}
              {!pageRows.length && (
                <tr>
                  <Td colSpan={destinations ? 11 : 10}>No transactions for this group.</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pagination} />
      </div>
    </section>
  );
}

export function BankReportImport({
  companyId,
  accountCurrency,
  close,
  done,
}: {
  companyId: string;
  accountCurrency: (code: string) => string | undefined;
  close: () => void;
  done: () => void;
}) {
  const { accounts, currencies } = useAccounting();
  const [view, setView] = useState<"import" | "history">("import");
  const [report, setReport] = useState<{ name: string; groups: BankReportGroup[] }>();
  const [mappings, setMappings] = useState<Record<number, Mapping>>({});
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof submitBankReport>>>();
  const history = useQuery({
    queryKey: ["transaction-report-imports", companyId],
    queryFn: ({ signal }) => loadBankReportArchive({ data: { companyId }, signal }),
    enabled: view === "history",
  });
  const accountGroups = new Map<string, typeof accounts>();
  for (const account of accounts) {
    const group = account.subgroup ? `${account.type} · ${account.subgroup}` : account.type;
    const members = accountGroups.get(group) ?? [];
    members.push(account);
    accountGroups.set(group, members);
  }
  const subgroupOptions = [...accountGroups.keys()].sort().map((name) => ({ id: name, name }));
  const selectableGroups = report?.groups.filter((group) => !group.error) ?? [];
  const selected = selectableGroups.filter((group) => mappings[group.id]);
  const ready =
    selected.length > 0 &&
    selected.every((group) => {
      const mapping = mappings[group.id]!;
      return (
        mapping.currency &&
        accountGroups.get(mapping.subgroup)?.some((a) => a.code === mapping.account)
      );
    });
  const previewDestinations = preview
    ? new Map(
        selected.map(({ id }) => {
          const { account, currency } = mappings[id]!;
          return [id, { account, currency, creditCard: isCreditCard(account) }] as const;
        }),
      )
    : undefined;

  function isCreditCard(code: string) {
    const destination = accounts.find((a) => a.code === code);
    return destination?.type === "Liability" && bankSourceAccount(destination, accounts);
  }

  function changeMapping(id: number, value?: Mapping) {
    setMappings((previous) => {
      const next = { ...previous };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });
    setPreview(undefined);
    setError(null);
  }

  function selectAllGroups() {
    setMappings((previous) =>
      Object.fromEntries(selectableGroups.map(({ id }) => [id, previous[id] ?? emptyMapping])),
    );
    setPreview(undefined);
    setError(null);
  }

  function clearSelection() {
    setMappings({});
    setPreview(undefined);
    setError(null);
  }

  async function read(file: File) {
    setBusy(true);
    setReport(undefined);
    setMappings({});
    setPreview(undefined);
    setError(null);
    setNotice("");
    setSearch("");
    try {
      if (file.size > 2_000_000) throw new Error("Select a CSV or XLSX report of up to 2 MB.");
      const bytes = await file.arrayBuffer();
      const groups = file.name.toLowerCase().endsWith(".xlsx")
        ? await readBankReportXlsx(bytes)
        : readBankReportCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!groups) throw new Error("Select the QuickBooks Transaction Detail by Account report.");
      setReport({ name: file.name, groups });
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!report || !ready || busy || preview?.groups.some((group) => group.duplicateBatch)) return;
    setBusy(true);
    setError(null);
    try {
      const files = selected.map((group) => {
        const { account, currency } = mappings[group.id]!;
        const name = `${report.name.replace(/\.(csv|xlsx)$/i, "")} - ${group.name}`;
        return {
          sourceGroup: group.name,
          account,
          currency,
          fileName: name.slice(0, 296) + ".csv",
          content: bankReportGroupCsv(group, isCreditCard(account)),
        };
      });
      const result = await submitBankReport({ data: { companyId, files, preview: !preview } });
      if (!preview) {
        setPreview(result);
        return;
      }
      const bankCount = result.groups.reduce(
        (sum, group) => sum + (group.bankFeed ? group.count : 0),
        0,
      );
      setNotice(
        `${result.count} transactions imported · ${bankCount} in Bank Feed · ${result.count - bankCount} in report history.`,
      );
      setReport(undefined);
      setMappings({});
      setPreview(undefined);
      void history.refetch();
      done();
    } catch (error) {
      setError(error);
      setPreview(undefined);
    } finally {
      setBusy(false);
    }
  }

  async function download(id: string) {
    setError(null);
    try {
      const file = await loadBankReportFile({ data: { companyId, id } });
      downloadBlob(file.name, file.content, "text/csv;charset=utf-8");
    } catch (error) {
      setError(error);
    }
  }

  return (
    <BankDialog
      title="Transaction Detail by Account"
      description="Upload the QuickBooks report. Choose the source groups and map each one to an account in this company."
      close={() => {
        if (!busy) close();
      }}
      contentClassName="h-[96dvh] max-h-[96dvh] w-[98vw] max-w-none p-4 sm:p-6"
    >
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={view === "import" ? "default" : "outline"}
          disabled={busy}
          onClick={() => {
            setError(null);
            setView("import");
          }}
        >
          Import report
        </Button>
        <Button
          type="button"
          variant={view === "history" ? "default" : "outline"}
          disabled={busy}
          onClick={() => {
            setError(null);
            setView("history");
          }}
        >
          Report history
        </Button>
      </div>
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <ErrorMessage error={error} />
      {view === "history" ? (
        <>
          <p className="text-sm text-ink2">
            Bank and card groups are available in the Bank Feed archive. Other groups appear here.
          </p>
          <ErrorMessage error={history.error} />
          {history.isPending && <p role="status">Loading report history…</p>}
          {history.data?.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Source group</Th>
                  <Th>Destination</Th>
                  <Th>Transactions</Th>
                  <Th>Imported</Th>
                  <Th>File</Th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((item) => (
                  <tr key={item.id}>
                    <Td>{item.sourceGroup}</Td>
                    <Td>
                      {item.account} · {accounts.find((a) => a.code === item.account)?.name} ·{" "}
                      {item.currency}
                    </Td>
                    <Td>{item.count}</Td>
                    <Td>{item.importedAt.slice(0, 10)}</Td>
                    <Td>
                      <Button variant="outline" size="sm" onClick={() => void download(item.id)}>
                        Download CSV
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            history.data && <p className="text-sm">No archived report groups.</p>
          )}
        </>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <fieldset className="min-w-0 space-y-3" disabled={busy}>
            <Field name="Report file (.csv or .xlsx)">
              <input
                type="file"
                accept=".csv,.xlsx"
                className="block max-w-full text-sm"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void read(file);
                }}
              />
            </Field>
            {report && (
              <>
                <p className="text-sm">
                  {report.name} · {report.groups.length} source groups · {selected.length} selected
                </p>
                <p className="text-sm text-ink2">
                  Bank and card groups go to Bank Feed for review. Other groups are saved in report
                  history. Rows with no amount or a zero amount are skipped.
                </p>
                <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={selected.length === selectableGroups.length}
                        onClick={selectAllGroups}
                      >
                        Select all valid groups
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={selected.length === 0}
                        onClick={clearSelection}
                      >
                        Clear selection
                      </Button>
                    </div>
                    <Field name="Find a source group">
                      <input
                        className={fieldStyle}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </Field>
                    <div className="max-h-[50dvh] space-y-2 overflow-y-auto pr-2">
                      {report.groups
                        .filter((group) =>
                          group.name.toLowerCase().includes(search.trim().toLowerCase()),
                        )
                        .map((group) => {
                          const mapping = mappings[group.id];
                          const destination =
                            mapping && accounts.find((a) => a.code === mapping.account);
                          const bank = destination && bankSourceAccount(destination, accounts);
                          const fixedCurrency =
                            mapping && bank ? accountCurrency(mapping.account) : undefined;
                          return (
                            <div
                              className="space-y-2 rounded-md border border-line p-3"
                              key={group.id}
                            >
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={!!mapping}
                                  disabled={!!group.error}
                                  onChange={(e) =>
                                    changeMapping(
                                      group.id,
                                      e.target.checked ? emptyMapping : undefined,
                                    )
                                  }
                                />
                                <span>
                                  <strong>{group.name}</strong> · {group.rows.length} transactions
                                  {!!group.skipped &&
                                    ` · ${group.skipped} without an amount or zero`}
                                </span>
                              </label>
                              <ErrorMessage error={group.error} />
                              {mapping && (
                                <div className="grid gap-2 md:grid-cols-[1fr_1.4fr_8rem] xl:grid-cols-1">
                                  <SelectField
                                    name="Destination group"
                                    value={mapping.subgroup}
                                    options={subgroupOptions}
                                    change={(subgroup) =>
                                      changeMapping(group.id, {
                                        ...mapping,
                                        subgroup,
                                        account: "",
                                        currency: "USD",
                                      })
                                    }
                                  />
                                  <div className="space-y-1">
                                    <span className="block text-xs font-medium text-ink2">
                                      Destination account
                                    </span>
                                    <SearchableSelect
                                      label={`Destination account for ${group.name}`}
                                      value={mapping.account}
                                      options={(accountGroups.get(mapping.subgroup) ?? []).map(
                                        (a) => ({
                                          value: a.code,
                                          label: `${a.code} · ${a.name}`,
                                        }),
                                      )}
                                      onChange={(code) => {
                                        const account = accounts.find((a) => a.code === code);
                                        const currency =
                                          account && bankSourceAccount(account, accounts)
                                            ? accountCurrency(code)
                                            : undefined;
                                        changeMapping(group.id, {
                                          ...mapping,
                                          account: code,
                                          currency: currency ?? mapping.currency,
                                        });
                                      }}
                                      fitViewport
                                    />
                                  </div>
                                  <SelectField
                                    name="Currency"
                                    value={mapping.currency}
                                    options={currencies
                                      .filter(
                                        (c) =>
                                          c.status === "Active" &&
                                          (!fixedCurrency || c.code === fixedCurrency),
                                      )
                                      .map((c) => ({ id: c.code, name: c.code }))}
                                    change={(currency) =>
                                      changeMapping(group.id, { ...mapping, currency })
                                    }
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                  <ReportTransactionGrid
                    key={preview ? "import-preview" : "source-report"}
                    groups={preview ? selected : report.groups}
                    destinations={previewDestinations}
                  />
                </div>
              </>
            )}
          </fieldset>
          {preview && (
            <div
              className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3 text-sm"
              role="status"
            >
              <strong>{preview.count} transactions ready for review</strong>
              {preview.groups.map((result, index) => {
                const group = selected[index]!;
                const mapping = mappings[group.id]!;
                return (
                  <p key={group.id}>
                    {group.name} → {mapping.account} ·{" "}
                    {result.bankFeed ? "Bank Feed" : "Report history"} · {result.count} transactions
                    · {mapping.currency} {formatCurrency(result.total, mapping.currency)}
                    {result.duplicateBatch
                      ? " · Already imported"
                      : result.duplicates > 0
                        ? ` · ${result.duplicates} possible duplicates`
                        : ""}
                  </p>
                );
              })}
            </div>
          )}
          <BankSubmit
            busy={busy}
            disabled={!ready || !!preview?.groups.some((group) => group.duplicateBatch)}
          >
            {preview ? "Confirm report import" : "Preview selected groups"}
          </BankSubmit>
        </form>
      )}
    </BankDialog>
  );
}
