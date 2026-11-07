import { dateSchema } from "./cash-flow-model";
import { currencyPrecision } from "./format";

const basicHeader = ["date", "description", "amount"];
const quickBooksHeader = ["date", "bank description", "amount", "from/to", "transaction posted"];

function readRows(source: string, delimiter: string) {
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
  if (!content || new TextEncoder().encode(content).length > 2_000_000)
    throw new Error("Selecione um CSV de até 2 MB.");
  const source = content.replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n|\r/, 1)[0] ?? "";
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const rows = readRows(source, delimiter);
  const header = rows
    .shift()
    ?.map((v) => v.trim().toLowerCase())
    .join(",");
  const quickBooks = header === quickBooksHeader.join(",");
  if (!quickBooks && header !== basicHeader.join(","))
    throw new Error("Use o CSV do QuickBooks ou o modelo date,description,amount.");
  if (!rows.length || rows.length > 5000)
    throw new Error("O CSV deve conter de 1 a 5.000 transações.");
  const precision = Math.min(currencyPrecision(currency), 4);
  return rows.map((row, i) => {
    const [rawDate = "", description = "", rawAmount = "", fromTo = "", externalPosting = ""] = row;
    const usDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(rawDate.trim());
    const date = quickBooks && usDate ? `${usDate[3]}-${usDate[1]}-${usDate[2]}` : rawDate.trim();
    const raw = rawAmount.trim();
    const externalAmount = /^(-?)([A-Z]{3} |\$)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/.exec(raw);
    const symbol = externalAmount?.[2]?.trim();
    const decimal =
      quickBooks && externalAmount
        ? `${externalAmount[1]}${externalAmount[3]!.replaceAll(",", "")}${externalAmount[4] ?? ""}`
        : raw;
    const amount = Number(decimal);
    if (
      row.length !== (quickBooks ? 5 : 3) ||
      !dateSchema.safeParse(date).success ||
      !description.trim() ||
      description.length > 500 ||
      fromTo.length > 500 ||
      externalPosting.length > 2000 ||
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
      description: description.trim(),
      amount,
      amountText: decimal,
      fromTo: fromTo.trim(),
      externalPosting: externalPosting.trim(),
    };
  });
}

export function externalAccount(value: string) {
  return /^(?:Added to|Matched to):\s*[^:]+:\s*(\d+)\s/i.exec(value)?.[1];
}
