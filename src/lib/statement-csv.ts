import { dateSchema } from "./cash-flow-model";
import { currencyPrecision } from "./format";

type SourceFormat = "ledgerx" | "quickbooks-posted" | "quickbooks-review";
export type QuickBooksStatus = "Posted" | "Pending";

export function quickBooksAutoPost(posting: string) {
  if (
    /\b(?:auto[- ]post\s*\(\s*match\s*\)|automatically matched\b|auto[- ]matched\b)/i.test(posting)
  )
    return "match" as const;
  if (/\bauto[- ]post(?:\s*\(\s*rule\s*\)|\s*$)/i.test(posting)) return "rule" as const;
  return null;
}

export function quickBooksSourceStatus(
  format: SourceFormat | null,
  posting: string,
  reportedStatus?: QuickBooksStatus | null,
): QuickBooksStatus | null {
  if (reportedStatus) return reportedStatus;
  if (format === "quickbooks-review") return "Pending" as const;
  // Older imports may have a posting label but no persisted source format.
  if (
    format !== "ledgerx" &&
    (/^(?:(?:Added|Matched) to:\s*\S|Posted$)/i.test(posting) || quickBooksAutoPost(posting))
  )
    return "Posted" as const;
  return null;
}

export function readCsvRows(source: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quote: "open" | "closed" | undefined;
  const pushField = () => {
    row.push(field);
    field = "";
    quote = undefined;
  };
  const pushRow = () => {
    pushField();
    if (row.length > 1 || row[0]?.trim()) rows.push(row);
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote === "open") {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quote = "closed";
      else field += char;
    } else if (char === delimiter) pushField();
    else if (char === "\r" || char === "\n") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      pushRow();
    } else if (char === '"' && !field && !quote) quote = "open";
    else if (char === '"' || quote === "closed")
      throw new Error(`Linha ${rows.length + 1}: aspas inválidas.`);
    else field += char;
  }
  if (quote === "open") throw new Error(`Linha ${rows.length + 1}: aspas não fechadas.`);
  pushRow();
  return rows;
}

export function parseStatementCsv(content: string, currency = "USD") {
  return parseStatementFile(content, currency).rows;
}

export function parseStatementFile(content: string, currency = "USD") {
  if (!content || new TextEncoder().encode(content).length > 2_000_000)
    throw new Error("Selecione um CSV de até 2 MB.");
  const source = content.replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n|\r/, 1)[0] ?? "";
  const delimiter = firstLine.replace(/"(?:[^"]|"")*"/g, "").includes(";") ? ";" : ",";
  const rows = readCsvRows(source, delimiter);
  const header =
    rows.shift()?.map((value) => value.trim().toLowerCase().replace(/\s+/g, " ")) ?? [];
  const columns = new Map(header.map((name, index) => [name, index]));
  if (columns.size !== header.length) throw new Error("O CSV contém colunas duplicadas.");
  const quickBooks = columns.has("bank description");
  const review = columns.has("match/categorize");
  const posted = columns.has("transaction posted");
  const reportPosting = columns.has("posting (y/n)");
  const amountColumn = columns.has("amount");
  const splitAmounts = columns.has("spent") && columns.has("received");
  const hasSplitColumn = columns.has("spent") || columns.has("received");
  if (
    !columns.has("date") ||
    (amountColumn ? hasSplitColumn : !splitAmounts) ||
    (quickBooks
      ? review && posted
      : !columns.has("description") || !amountColumn || review || posted || reportPosting)
  )
    throw new Error("Use o CSV do QuickBooks ou o modelo date,description,amount.");
  if (!rows.length || rows.length > 5000)
    throw new Error("O CSV deve conter de 1 a 5.000 transações.");
  const format: SourceFormat | null = !quickBooks
    ? "ledgerx"
    : review
      ? "quickbooks-review"
      : posted
        ? "quickbooks-posted"
        : null;
  const read = (row: string[], column: string) => row[columns.get(column) ?? -1] ?? "";
  const precision = Math.min(currencyPrecision(currency), 4);
  const transactions = rows.map((row, i) => {
    const rawDate = read(row, "date").trim();
    const spent = read(row, "spent").trim();
    const received = read(row, "received").trim();
    const bankDescription = read(row, quickBooks ? "bank description" : "description");
    const party = read(row, "from/to");
    const posting = read(row, review ? "match/categorize" : "transaction posted");
    const postingFlag = read(row, "posting (y/n)").trim();
    const reportedStatus = /^(y|yes|true|posted)$/i.test(postingFlag)
      ? "Posted"
      : /^(n|no|false|pending)$/i.test(postingFlag)
        ? "Pending"
        : null;
    const checkNumber = read(row, "check no.").trim() || null;
    const sourceClass = read(row, "class").trim() || null;
    const sourceLocation = read(row, "location").trim() || null;
    const sourceCustomer = read(row, "customer").trim() || null;
    const usDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(rawDate);
    const date =
      quickBooks && usDate
        ? `${usDate[3]}-${usDate[1]!.padStart(2, "0")}-${usDate[2]!.padStart(2, "0")}`
        : rawDate;
    const raw = splitAmounts ? spent || received : read(row, "amount").trim();
    const externalAmount = /^(-?)([A-Z]{3} |\$)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/.exec(raw);
    const symbol = externalAmount?.[2]?.trim();
    const decimal =
      quickBooks && externalAmount
        ? `${spent ? "-" : externalAmount[1]}${externalAmount[3]!.replaceAll(",", "")}${externalAmount[4] ?? ""}`
        : raw;
    const amount = Number(decimal);
    if (
      row.length !== header.length ||
      (splitAmounts && (Boolean(spent) === Boolean(received) || raw.startsWith("-"))) ||
      !dateSchema.safeParse(date).success ||
      !bankDescription.trim() ||
      bankDescription.length > 500 ||
      party.length > 500 ||
      posting.length > 2000 ||
      (postingFlag && !reportedStatus) ||
      [checkNumber, sourceClass, sourceLocation, sourceCustomer].some(
        (value) => (value?.length ?? 0) > 500,
      ) ||
      (quickBooks && !externalAmount) ||
      (symbol === "$" ? currency !== "USD" : symbol && symbol !== currency) ||
      !/^-?\d+(\.\d+)?$/.test(decimal) ||
      (decimal.split(".")[1]?.length ?? 0) > precision ||
      !Number.isFinite(amount) ||
      amount === 0 ||
      Math.abs(amount) > 999999999999
    )
      throw new Error(`Linha ${i + 2} inválida (data, descrição, valor ou moeda).`);
    return {
      date,
      description: bankDescription.trim(),
      amount,
      amountText: decimal,
      fromTo: party.trim(),
      externalPosting: posting.trim(),
      sourceStatus: quickBooksSourceStatus(format, posting.trim(), reportedStatus),
      checkNumber,
      sourceClass,
      sourceLocation,
      sourceCustomer,
      reportedStatus,
    };
  });
  return { format, rows: transactions };
}

export function externalAccount(value: string, format?: SourceFormat | null) {
  if (format === "quickbooks-review") return /^(\d+)\s+/.exec(value)?.[1];
  return /^(?:Added to|Matched to):\s*[^:]+:\s*(\d+)\s/i.exec(value)?.[1];
}

export function sourceCategoryAccount(
  value: string,
  format: SourceFormat | null,
  accounts: readonly {
    code: string;
    sourceAccount?: { number: string; path: string } | undefined;
  }[],
) {
  if (format !== "quickbooks-review" || !value) return undefined;
  const number = externalAccount(value, format);
  const matches = accounts.filter((account) =>
    number
      ? account.sourceAccount?.number === number
      : account.sourceAccount?.path.toLowerCase() === value.toLowerCase(),
  );
  return matches.length === 1 ? matches[0]?.code : undefined;
}
