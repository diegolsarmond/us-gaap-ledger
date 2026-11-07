import { dateSchema } from "./cash-flow-model";
import { currencyPrecision } from "./format";

type SourceFormat = "ledgerx" | "quickbooks-posted" | "quickbooks-review";
const formats = new Map<string, SourceFormat>([
  ["date,description,amount", "ledgerx"],
  ["date,bank description,amount,from/to,transaction posted", "quickbooks-posted"],
  [
    "date,check no.,bank description,spent,received,from/to,class,location,customer,match/categorize",
    "quickbooks-review",
  ],
]);

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
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const rows = readCsvRows(source, delimiter);
  const header = rows
    .shift()
    ?.map((v) => v.trim().toLowerCase())
    .join(",");
  const format = formats.get(header ?? "");
  if (!format) throw new Error("Use o CSV do QuickBooks ou o modelo date,description,amount.");
  if (!rows.length || rows.length > 5000)
    throw new Error("O CSV deve conter de 1 a 5.000 transações.");
  const precision = Math.min(currencyPrecision(currency), 4);
  const quickBooks = format !== "ledgerx";
  const review = format === "quickbooks-review";
  const transactions = rows.map((row, i) => {
    const [rawDate = "", description = "", rawAmount = "", fromTo = "", externalPosting = ""] = row;
    const spent = review ? row[3]?.trim() || "" : "";
    const received = review ? row[4]?.trim() || "" : "";
    const bankDescription = review ? rawAmount : description;
    const party = review ? (row[5] ?? "") : fromTo;
    const posting = review ? (row[9] ?? "") : externalPosting;
    const checkNumber = review ? row[1]?.trim() || null : null;
    const sourceClass = review ? row[6]?.trim() || null : null;
    const sourceLocation = review ? row[7]?.trim() || null : null;
    const sourceCustomer = review ? row[8]?.trim() || null : null;
    const usDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(rawDate.trim());
    const date = quickBooks && usDate ? `${usDate[3]}-${usDate[1]}-${usDate[2]}` : rawDate.trim();
    const raw = review ? spent || received : rawAmount.trim();
    const externalAmount = /^(-?)([A-Z]{3} |\$)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/.exec(raw);
    const symbol = externalAmount?.[2]?.trim();
    const decimal =
      quickBooks && externalAmount
        ? `${spent ? "-" : externalAmount[1]}${externalAmount[3]!.replaceAll(",", "")}${externalAmount[4] ?? ""}`
        : raw;
    const amount = Number(decimal);
    if (
      row.length !== (review ? 10 : quickBooks ? 5 : 3) ||
      (review && (Boolean(spent) === Boolean(received) || raw.startsWith("-"))) ||
      !dateSchema.safeParse(date).success ||
      !bankDescription.trim() ||
      bankDescription.length > 500 ||
      party.length > 500 ||
      posting.length > 2000 ||
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
      checkNumber,
      sourceClass,
      sourceLocation,
      sourceCustomer,
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
