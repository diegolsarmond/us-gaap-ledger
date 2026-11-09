import type { loadBankFeed } from "./bank-feed";
import type { Account } from "./accounting-engine";
import type { Dimension } from "./dimensions";
import { quickBooksAutoPost } from "./statement-csv";

type BankFeed = Awaited<ReturnType<typeof loadBankFeed>>;
type Row = BankFeed["rows"][number];
type Rules = BankFeed["rules"];

export const bankFilterFields = [
  { id: "payee", name: "Party" },
  { id: "status", name: "Status" },
  { id: "category", name: "Category" },
  { id: "class", name: "Class" },
  { id: "location", name: "Location" },
  { id: "transactionType", name: "Transaction type" },
] as const;
export const bankQuickFilters = [
  { id: "uncategorized", name: "Uncategorized" },
  { id: "missing-payee", name: "Missing From/To" },
  { id: "rules", name: "Rules" },
  { id: "no-rules", name: "No rules" },
  { id: "auto-rule", name: "Auto-post (rule)" },
  { id: "auto-match", name: "Auto-post (match)" },
] as const;
export type BankQuickFilter = "" | (typeof bankQuickFilters)[number]["id"];
type FilterField = (typeof bankFilterFields)[number]["id"];
export const bankTextFilters = [
  { id: "description", name: "Description" },
  { id: "review", name: "Review" },
  { id: "sourcePosting", name: "Source posting" },
] as const;
export type BankAmountField = "Amount" | "Spent" | "Received";
type TextField = (typeof bankTextFilters)[number]["id"];
type AmountFilter = { field: BankAmountField; min: string; max: string };
export type BankAdvancedFilters = Record<FilterField | TextField | "files", string> & {
  amount: AmountFilter;
};
export type BankFilterOptions = Record<FilterField, { id: string; name: string }[]>;
export const emptyBankFilters: BankAdvancedFilters = {
  category: "",
  payee: "",
  status: "",
  class: "",
  location: "",
  transactionType: "",
  description: "",
  review: "",
  sourcePosting: "",
  files: "",
  amount: { field: "Amount", min: "", max: "" },
};

export function bankTab(row: Row) {
  return row.status === "Classified" || row.isSourcePosted ? "Posted" : row.status;
}

export function bankStatusLabel(row: Row) {
  if (row.attemptState === "pending") return "In approval";
  if (row.status === "Classified") return "Posted in World Business";
  return row.isSourcePosted ? "Posted in QuickBooks" : row.status;
}

export function bankReviewLabel(row: Row, categoryLabel: string, showActions: boolean) {
  if (showActions) return categoryLabel;
  if (row.attemptState === "pending") return "In approval";
  return row.journalNumber ?? (row.attemptKind === "match" ? "Matched" : categoryLabel);
}

export function bankRuleFor(row: Row, rules: Rules) {
  const description = row.description.toLowerCase();
  return rules.find((rule) => rule.kind === "rule" && description.includes(rule.pattern));
}

const normalized = (value: string) => value.trim().toLowerCase();
const values = (...items: (string | null | undefined)[]) =>
  items.map((item) => item?.trim() ?? "").filter(Boolean);

export function bankFilterData(
  row: Row,
  accounts: Account[],
  dimensions: Dimension[],
  rules: Rules,
  suggestion?: string,
  canWrite = false,
) {
  const posting = row.externalPosting;
  const sourceType = /^(?:Added|Matched) to:\s*([^:]+):/i.exec(posting)?.[1];
  const postedCategory = /^Added to:\s*[^:]+:\s*(.+)$/i
    .exec(posting)?.[1]
    ?.replace(/\s+\d{1,2}\/\d{1,2}\/\d{4}(?:\s.*)?$/, "");
  const sourceCategory = row.sourceFormat === "quickbooks-review" ? posting : postedCategory;
  const sourceCode = sourceCategory && /^(\d+)\s/.exec(sourceCategory)?.[1];
  const sourceAccount = sourceCode
    ? accounts.find((account) => account.sourceAccount?.number === sourceCode)
    : undefined;
  const assignedCodes = values(...(row.allocationAccounts ?? []), row.classifiedAccount);
  const categoryCodes = assignedCodes.length
    ? assignedCodes
    : values(suggestion ?? sourceAccount?.code);
  const category = categoryCodes.length
    ? categoryCodes.map(
        (code) => `${code} · ${accounts.find((account) => account.code === code)?.name ?? code}`,
      )
    : values(sourceCategory);
  const optionName = (code: string, id: string | null) =>
    dimensions
      .find((dimension) => dimension.code.toUpperCase() === code)
      ?.options.find((option) => option.id === id)?.name ?? id;
  const autoPost = row.sourceStatus === "Posted" ? quickBooksAutoPost(posting) : null;
  return {
    amount: Number(row.amount),
    hasFiles: row.attachmentCount > 0,
    text: {
      description: row.description,
      review: bankReviewLabel(
        row,
        suggestion
          ? `${suggestion} · ${accounts.find((account) => account.code === suggestion)?.name ?? suggestion}`
          : "",
        bankTab(row) === "Pending" && !row.attemptId && canWrite,
      ),
      sourcePosting: posting,
    },
    fields: {
      category,
      payee: values(row.partyName ?? (row.partyEdited ? "" : row.fromTo)),
      status: [bankStatusLabel(row)],
      class: values(...(row.classIds ?? []).map((id) => optionName("CLASS", id)), row.sourceClass),
      location: values(optionName("LOCATION", row.locationId ?? null), row.sourceLocation),
      transactionType: values(row.transactionType ?? sourceType ?? "Unspecified"),
    },
    uncategorized: row.status === "Pending" && !row.isSourcePosted && !assignedCodes.length,
    hasRule:
      Boolean(bankRuleFor(row, rules)) ||
      autoPost === "rule" ||
      /(?:^|\n)\s*Rule:\s*\S/i.test(posting),
    autoRule: autoPost === "rule",
    autoMatch: autoPost === "match",
  };
}

type FilterData = ReturnType<typeof bankFilterData>;
export function bankFilterOptions(rows: FilterData[]): BankFilterOptions {
  return Object.fromEntries(
    bankFilterFields.map(({ id }) => {
      const distinct = new Map(
        rows.flatMap((row) => row.fields[id].map((name) => [normalized(name), name] as const)),
      );
      return [
        id,
        [...distinct]
          .map(([key, name]) => ({ id: key, name }))
          .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true })),
      ];
    }),
  ) as BankFilterOptions;
}

export function matchesBankFilters(
  row: FilterData,
  advanced: BankAdvancedFilters,
  quick: BankQuickFilter,
) {
  if (
    bankFilterFields.some(
      ({ id }) =>
        advanced[id] && !row.fields[id].some((value) => normalized(value) === advanced[id]),
    ) ||
    bankTextFilters.some(
      ({ id }) => !normalized(row.text[id]).includes(normalized(advanced[id])),
    ) ||
    (advanced.files && row.hasFiles !== (advanced.files === "attached"))
  )
    return false;
  const { field, min, max } = advanced.amount;
  if (min || max) {
    if ((field === "Spent" && row.amount >= 0) || (field === "Received" && row.amount < 0))
      return false;
    const amount = field === "Spent" ? -row.amount : row.amount;
    if ((min && amount < Number(min)) || (max && amount > Number(max))) return false;
  }
  switch (quick) {
    case "uncategorized":
      return row.uncategorized;
    case "missing-payee":
      return !row.fields.payee.length;
    case "rules":
      return row.hasRule;
    case "no-rules":
      return !row.hasRule;
    case "auto-rule":
      return row.autoRule;
    case "auto-match":
      return row.autoMatch;
    default:
      return true;
  }
}
