import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Download,
  FileUp,
  GripVertical,
  Paperclip,
  Printer,
  Settings2,
} from "lucide-react";
import { AccountingProvider, useAccounting } from "@/lib/accounting-store";
import { bankBatchLimit, bankSourceAccount, type BankBatchAction } from "@/lib/bank-feed-model";
import { externalAccount, sourceCategoryAccount } from "@/lib/statement-csv";
import { formatCurrency as bankMoney, downloadBlob as downloadBankBlob } from "@/lib/format";
import {
  loadBankFeed,
  loadBankFile,
  loadBankRegister,
  previewBankFile,
  runBankAction,
  runBankBatch,
  uploadBankFile,
} from "@/lib/bank-feed";
import { Badge, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { BankReview, type BankReviewView } from "@/components/bank-feed-review";
import { BankBatchDialog } from "@/components/bank-feed-batch";
import { SearchableSelect } from "@/components/searchable-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
const optionalColumns = ["Files", "Party", "Source posting", "Status"] as const;
const gridColumns = [
  "Date",
  "Description",
  "Amount",
  "Files",
  "Party",
  "Review",
  "Source posting",
  "Status",
] as const;
const pageSize = bankBatchLimit;
type Column = (typeof optionalColumns)[number];
type GridColumn = (typeof gridColumns)[number];
type SortField = "date" | "description" | "amount";

function loadColumnOrder(key: string): GridColumn[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (Array.isArray(value)) {
      return [
        ...new Set([
          ...value.filter((column): column is GridColumn =>
            gridColumns.some((item) => item === column),
          ),
          ...gridColumns,
        ]),
      ];
    }
  } catch {
    // Storage may be unavailable.
  }
  return [...gridColumns];
}

function StatementsPage() {
  const { activeCompany } = useAccounting();
  return <CompanyFeed key={activeCompany.id} />;
}

function CompanyFeed() {
  const { activeCompany, accounts, vendors, customers } = useAccounting();
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
  const [review, setReview] = useState<{ id: string; view: BankReviewView }>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batch, setBatch] = useState<{
    operation: BankBatchAction["operation"];
    rows: BankRow[];
  }>();
  const [sort, setSort] = useState<{ field: SortField; descending: boolean }>({
    field: "date",
    descending: true,
  });
  const [dialog, setDialog] = useState<
    "import" | "archive" | "settings" | "balance" | "register" | "rules" | null
  >(null);
  const [columns, setColumns] = useState<Column[]>(["Files", "Party"]);
  const columnKey = `ledgerx:bank-feed:columns:${companyId}`;
  const [columnOrder, setColumnOrder] = useState(() => loadColumnOrder(columnKey));
  const [dragColumn, setDragColumn] = useState<GridColumn>();
  const [editingParty, setEditingParty] = useState<string>();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const moveColumn = (from: GridColumn, to: GridColumn) => {
    if (from === to) return;
    const next = columnOrder.filter((column) => column !== from);
    next.splice(columnOrder.indexOf(to), 0, from);
    setColumnOrder(next);
    try {
      window.localStorage.setItem(columnKey, JSON.stringify(next));
    } catch {
      // The order still applies in this session.
    }
  };
  const visibleColumns = columnOrder.filter(
    (column) =>
      !optionalColumns.some((item) => item === column) || columns.some((item) => item === column),
  );

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
    data.cashAccounts.find((a) => a.account === code)?.currency ??
    sourceAccounts.find((a) => a.code === code)?.sourceAccount?.currency;
  const rows = data.rows.filter((r) => r.account === account);
  const filter = search.trim().toLowerCase();
  const filtered = rows
    .filter(
      (row) =>
        row.status === status &&
        (!from || row.date >= from) &&
        (!to || row.date <= to) &&
        (!direction || (Number(row.amount) < 0 ? "out" : "in") === direction) &&
        (!filter ||
          [
            row.description,
            row.fromTo,
            row.partyName ?? "",
            row.externalPosting,
            row.journalNumber ?? "",
          ].some((v) => v.toLowerCase().includes(filter))),
    )
    .sort((a, b) => {
      const order =
        sort.field === "amount"
          ? Number(a.amount) - Number(b.amount)
          : a[sort.field].localeCompare(b[sort.field]);
      return sort.descending ? -order : order;
    });
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const pageRows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const canUndo = (row: BankRow) =>
    row.status === "Classified" &&
    !!row.attemptId &&
    (row.attemptKind === "match" || data.canReverse);
  const canSelect = (row: BankRow) =>
    data.canWrite &&
    ((row.status === "Pending" && !row.attemptId) || row.status === "Excluded" || canUndo(row));
  const eligibleRows = filtered.filter(canSelect);
  const selectableRows = pageRows.filter(canSelect);
  const selectedSet = new Set(selectedIds);
  const selectedRows = eligibleRows.filter((row) => selectedSet.has(row.id));
  const checkedOnPage = selectableRows.filter((row) => selectedSet.has(row.id)).length;
  const allChecked = selectableRows.length > 0 && checkedOnPage === selectableRows.length;
  const clearSelection = () => {
    setSelectedIds([]);
    setReview(undefined);
    setEditingParty(undefined);
  };
  const goToPage = (page: number) => {
    setPage(page);
    clearSelection();
  };
  const selectAccount = (code: string) => {
    setAccountChoice(code);
    goToPage(0);
    setNotice("");
  };
  const paginate = (page: number) => {
    setPage(page);
    setReview(undefined);
    setEditingParty(undefined);
  };
  const togglePage = (checked: boolean) => {
    const pageIds = new Set(selectableRows.map((row) => row.id));
    setSelectedIds((old) =>
      checked ? [...new Set([...old, ...pageIds])] : old.filter((id) => !pageIds.has(id)),
    );
  };
  const openReview = (id: string, view: BankReviewView = "details") =>
    setReview((old) =>
      old?.id === id && old.view === view && view === "details" ? undefined : { id, view },
    );
  const changeSort = (field: SortField) => {
    setSort({ field, descending: sort.field === field ? !sort.descending : field === "date" });
    goToPage(0);
  };
  const suggestionFor = (row: BankRow) => {
    if (row.classifiedAccount) return row.classifiedAccount;
    if (row.status !== "Pending" || row.attemptId) return;
    const external = externalAccount(row.externalPosting, row.sourceFormat);
    const sourceAccount = sourceCategoryAccount(row.externalPosting, row.sourceFormat, accounts);
    return (
      data.rules.find((rule) => rule.kind === "mapping" && rule.pattern === external)?.account ??
      data.rules.find(
        (rule) => rule.kind === "rule" && row.description.toLowerCase().includes(rule.pattern),
      )?.account ??
      (sourceAccount &&
      sourceAccount !== row.account &&
      !accounts.some((a) => a.parentCode === sourceAccount)
        ? sourceAccount
        : undefined)
    );
  };
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

  const sortHeading = (label: string, field: SortField, printable: boolean) => {
    if (printable) return label;
    const active = sort.field === field;
    const Icon = active ? (sort.descending ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        aria-label={`Sort by ${label}`}
        onClick={() => changeSort(field)}
      >
        {label}
        <Icon aria-hidden="true" className={`size-3 ${active ? "" : "opacity-50"}`} />
      </button>
    );
  };
  const table = (items: BankRow[], printable = false) => {
    const showSelection = data.canWrite && !printable;
    const columnCount = visibleColumns.length + (printable ? 0 : 1) + (showSelection ? 1 : 0);
    const columnLabel = (column: GridColumn) => {
      if (column === "Description") return "Full bank description";
      if (column === "Party") return "From/To";
      if (column === "Review") return status === "Pending" ? "Match / Categorize" : "Posting";
      return column;
    };
    const sortFields = { Date: "date", Description: "description", Amount: "amount" } as const;
    return (
      <Table
        className={
          printable ? "" : "min-w-[820px] text-xs [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-2"
        }
      >
        <thead className="border-b bg-muted">
          <tr>
            {showSelection && (
              <Th className="w-8">
                <input
                  type="checkbox"
                  className="size-3.5 cursor-pointer align-middle accent-brand"
                  aria-label="Select all eligible transactions on this page"
                  disabled={!selectableRows.length}
                  checked={allChecked}
                  ref={(input) => {
                    if (input) input.indeterminate = !allChecked && checkedOnPage > 0;
                  }}
                  onChange={(event) => togglePage(event.target.checked)}
                />
              </Th>
            )}
            {visibleColumns.map((column, index) => {
              const label = columnLabel(column);
              const sortable = column === "Date" || column === "Description" || column === "Amount";
              const field = sortable ? sortFields[column] : undefined;
              return (
                <th
                  key={column}
                  scope="col"
                  className={`whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-ink3 ${column === "Amount" ? "text-right" : "text-left"} ${dragColumn === column ? "bg-brand/15" : ""}`}
                  aria-sort={
                    field && sort.field === field
                      ? sort.descending
                        ? "descending"
                        : "ascending"
                      : undefined
                  }
                  onDragOver={(event) => {
                    if (dragColumn) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragColumn) moveColumn(dragColumn, column);
                    setDragColumn(undefined);
                  }}
                >
                  <div
                    className={`flex items-center gap-1 ${column === "Amount" ? "justify-end" : ""}`}
                  >
                    {!printable && (
                      <button
                        type="button"
                        draggable
                        className="cursor-grab rounded p-0.5 text-ink3 hover:bg-background focus-visible:ring-1 focus-visible:ring-brand active:cursor-grabbing"
                        title="Drag to reorder or use the left and right arrow keys"
                        aria-label={`Move ${label} column`}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", column);
                          setDragColumn(column);
                        }}
                        onDragEnd={() => setDragColumn(undefined)}
                        onKeyDown={(event) => {
                          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                          event.preventDefault();
                          const target =
                            visibleColumns[index + (event.key === "ArrowLeft" ? -1 : 1)];
                          if (target) moveColumn(column, target);
                        }}
                      >
                        <GripVertical className="size-3" aria-hidden="true" />
                      </button>
                    )}
                    {field ? (
                      sortHeading(label, field, printable)
                    ) : column === "Files" ? (
                      <>
                        <Paperclip aria-hidden="true" className="size-3.5" />
                        <span className="sr-only">Files</span>
                      </>
                    ) : (
                      label
                    )}
                  </div>
                </th>
              );
            })}
            {!printable && <Th>Action</Th>}
          </tr>
        </thead>
        <tbody>
          {items.map((row, index) => {
            const pending = row.status === "Pending" && !row.attemptId && data.canWrite;
            const expanded = !printable && review?.id === row.id;
            const checked = !printable && selectedSet.has(row.id);
            const category = suggestionFor(row);
            const categoryLabel = category ? `${category} · ${accountName(category)}` : "";
            const fromTo = row.partyName ?? (row.partyEdited ? "" : row.fromTo);
            const cells: Record<GridColumn, ReactNode> = {
              Date: <Td className="whitespace-nowrap">{row.date}</Td>,
              Description: (
                <Td className="min-w-48 max-w-80">
                  {printable ? (
                    row.description
                  ) : (
                    <button
                      type="button"
                      className="block max-w-full truncate text-left font-medium hover:underline"
                      title={row.description}
                      aria-expanded={expanded}
                      onClick={() => openReview(row.id)}
                    >
                      {row.description}
                    </button>
                  )}
                  {row.duplicate && <Badge tone="down">Possible duplicate</Badge>}
                </Td>
              ),
              Amount: (
                <Td
                  align="right"
                  className={
                    Number(row.amount) < 0
                      ? "whitespace-nowrap text-down"
                      : "whitespace-nowrap text-up"
                  }
                >
                  {bankMoney(row.amount, row.currency)}
                </Td>
              ),
              Files: (
                <Td align="center">
                  {printable ? (
                    row.attachmentCount || "—"
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-1.5"
                      aria-label={
                        row.attachmentCount
                          ? `View ${row.attachmentCount} attached files`
                          : "View transaction files"
                      }
                      onClick={() => openReview(row.id)}
                    >
                      <Paperclip className="size-3" />
                      {row.attachmentCount || ""}
                    </Button>
                  )}
                </Td>
              ),
              Party: (
                <Td className="min-w-32 max-w-44">
                  {pending && !printable ? (
                    editingParty === row.id ? (
                      <SearchableSelect
                        label={`From/To for ${row.description}`}
                        value={row.partyId ?? ""}
                        options={[
                          { value: "", label: "Clear party" },
                          ...(Number(row.amount) < 0 ? vendors : customers).map((party) => ({
                            value: party.id,
                            label: party.displayName,
                          })),
                        ]}
                        onOpenChange={(open) => {
                          if (!open) setEditingParty(undefined);
                        }}
                        onChange={(payeeId) => {
                          void handle(async () => {
                            try {
                              await run({
                                operation: "party",
                                rowId: row.id,
                                payeeId: payeeId || null,
                              });
                              setNotice("From/To updated.");
                            } finally {
                              setEditingParty(undefined);
                            }
                          });
                        }}
                        initiallyOpen
                        fitViewport
                      />
                    ) : (
                      <button
                        type="button"
                        title={fromTo || "Select a party"}
                        aria-label={`Change From/To for ${row.description}`}
                        className="flex max-w-full items-center gap-1 truncate text-left hover:underline"
                        disabled={busy}
                        onClick={() => {
                          setError(null);
                          setEditingParty(row.id);
                        }}
                      >
                        <span className="truncate">{fromTo || "Select a party"}</span>
                        <ChevronDown aria-hidden="true" className="size-3 shrink-0 text-ink3" />
                      </button>
                    )
                  ) : (
                    fromTo || "—"
                  )}
                </Td>
              ),
              Review: (
                <Td>
                  {pending && !printable ? (
                    <div className="flex min-w-52 flex-wrap items-center gap-1">
                      {categoryLabel && (
                        <span
                          className="max-w-48 truncate text-brand"
                          title={`Suggested: ${categoryLabel}`}
                        >
                          {categoryLabel}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        aria-label={`Match ${row.description}`}
                        onClick={() => openReview(row.id, "match")}
                      >
                        Match
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        aria-label={`Categorize ${row.description}`}
                        onClick={() => openReview(row.id)}
                      >
                        Categorize
                      </Button>
                    </div>
                  ) : row.attemptState === "pending" ? (
                    <Badge tone="brand">In approval</Badge>
                  ) : (
                    <span className="text-ink2" title={categoryLabel || undefined}>
                      {row.journalNumber ??
                        (row.attemptKind === "match" ? "Matched" : categoryLabel || "—")}
                    </span>
                  )}
                </Td>
              ),
              "Source posting": (
                <Td className="max-w-56 truncate" title={row.externalPosting}>
                  {row.externalPosting || "—"}
                </Td>
              ),
              Status: (
                <Td>
                  <Badge tone={row.status === "Classified" ? "up" : "neutral"}>
                    {row.attemptState === "pending"
                      ? "In approval"
                      : statuses.find((tab) => tab.id === row.status)?.name}
                  </Badge>
                </Td>
              ),
            };
            return (
              <Fragment key={row.id}>
                <tr
                  className={`border-b border-line/50 ${expanded || checked ? "bg-brand/10" : index % 2 ? "bg-muted/35 hover:bg-muted/65" : "hover:bg-muted/40"}`}
                >
                  {showSelection && (
                    <Td>
                      <input
                        type="checkbox"
                        className="size-3.5 cursor-pointer align-middle accent-brand"
                        aria-label={`Select transaction ${row.description}`}
                        disabled={!canSelect(row)}
                        checked={checked}
                        onChange={(event) => {
                          const value = event.target.checked;
                          setSelectedIds((old) =>
                            value ? [...old, row.id] : old.filter((id) => id !== row.id),
                          );
                        }}
                      />
                    </Td>
                  )}
                  {visibleColumns.map((column) => (
                    <Fragment key={column}>{cells[column]}</Fragment>
                  ))}
                  {!printable && (
                    <Td>
                      {pending ? (
                        <div className="flex items-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-xs text-brand"
                            onClick={() => openReview(row.id)}
                          >
                            Post
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                aria-label={`More actions for ${row.description}`}
                              >
                                <ChevronDown className="size-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => openReview(row.id, "exclude")}>
                                Exclude
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : canUndo(row) && data.canWrite ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-xs"
                          onClick={() => openReview(row.id, "undo")}
                        >
                          Undo
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-xs"
                          onClick={() => openReview(row.id)}
                        >
                          Details
                        </Button>
                      )}
                    </Td>
                  )}
                </tr>
                {expanded && review && (
                  <tr className="border-b border-brand/20 bg-muted/20">
                    <Td colSpan={columnCount}>
                      <BankReview
                        key={`${row.id}:${review.view}:${row.partyEdited}:${row.partyId ?? ""}`}
                        row={row}
                        initialView={review.view}
                        data={data}
                        run={run}
                        close={() => setReview(undefined)}
                        saved={(message) => {
                          setNotice(message);
                          clearSelection();
                        }}
                      />
                    </Td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {!items.length && (
            <tr>
              <Td className="py-7 text-ink3" colSpan={columnCount}>
                No transactions for these filters.
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    );
  };

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
      {account && (
        <div className="max-w-md space-y-1 print:hidden">
          <p className="text-xs font-medium text-ink2">Bank or credit card account</p>
          <SearchableSelect
            label="Bank or credit card account"
            value={account}
            onChange={selectAccount}
            options={[...accountCodes].map((code) => ({
              value: code,
              label: `${code} · ${accountName(code)}`,
            }))}
            fitViewport
          />
        </div>
      )}
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
              onClick={() => selectAccount(code)}
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
      {!dialog && <ErrorMessage error={error} />}
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
                    goToPage(0);
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
                  goToPage(0);
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
                  goToPage(0);
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
                  goToPage(0);
                }}
              />
            </Field>
            <SelectField
              name="Direction"
              placeholder="All movements"
              value={direction}
              change={(value) => {
                setDirection(value);
                goToPage(0);
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs print:hidden">
            <div className="flex flex-wrap items-center gap-2">
              {eligibleRows.length > selectableRows.length &&
                selectedRows.length < eligibleRows.length && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedIds(eligibleRows.map((row) => row.id))}
                  >
                    Select all {eligibleRows.length} filtered transactions
                  </Button>
                )}
              {selectedRows.length > 0 && (
                <>
                  <span className="font-semibold" role="status">
                    {selectedRows.length} selected
                  </span>
                  {status === "Pending" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => setBatch({ operation: "categorize", rows: selectedRows })}
                      >
                        Post selected
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBatch({ operation: "exclude", rows: selectedRows })}
                      >
                        Exclude selected
                      </Button>
                    </>
                  )}
                  {status === "Classified" && (
                    <Button
                      size="sm"
                      onClick={() => setBatch({ operation: "undo", rows: selectedRows })}
                    >
                      Undo selected
                    </Button>
                  )}
                  {status === "Excluded" && (
                    <Button
                      size="sm"
                      onClick={() => setBatch({ operation: "restore", rows: selectedRows })}
                    >
                      Restore selected
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                    Clear selection
                  </Button>
                </>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span>
                {filtered.length
                  ? `${currentPage * pageSize + 1}–${currentPage * pageSize + pageRows.length} of ${filtered.length}`
                  : "0 transactions"}{" "}
                · Page {currentPage + 1} of {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 0}
                onClick={() => paginate(currentPage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage + 1 === pages}
                onClick={() => paginate(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
          <div className="print:hidden">{table(pageRows)}</div>
          <div className="hidden print:block">
            <p>
              {account} · {accountName(account)} · {statuses.find((tab) => tab.id === status)?.name}
            </p>
            {table(filtered, true)}
          </div>
        </Panel>
      )}
      {batch && (
        <BankBatchDialog
          key={batch.operation}
          operation={batch.operation}
          rows={batch.rows}
          close={() => setBatch(undefined)}
          run={(input) => runBankBatch({ data: { companyId, input } })}
          refresh={refresh}
          saved={(message) => {
            setBatch(undefined);
            setNotice(message);
            clearSelection();
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
            goToPage(0);
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
          description="Drag the grips in the table header to reorder columns. With a grip focused, use the left and right arrow keys."
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
      description="Supports QuickBooks exports with Spent and Received, QuickBooks posted transactions, and the LedgerX CSV template."
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
            disabled={busy}
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
            {preview.format === "quickbooks-review" && (
              <p>QuickBooks · Spent / Received. Source categories are saved for review.</p>
            )}
            <p>
              <strong>{preview.count} transactions</strong> · Net{" "}
              {bankMoney(preview.total, currency)}
            </p>
            {!!preview.duplicates && <p>{preview.duplicates} rows flagged for duplicate review.</p>}
            {preview.duplicateBatch && <ErrorMessage error="This batch was already imported." />}
            {preview.sample.map((r, index) => (
              <p className="truncate" key={index}>
                {r.date} · {bankMoney(r.amount, currency)} · {r.description}
                {r.checkNumber && ` · Check ${r.checkNumber}`}
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
