import { dateSchema } from "./cash-flow-model";
import { readCsvRows } from "./statement-csv";

const reportTitle = "Transaction Detail by Account";
const postingColumnName = "Posting (Y/N)";
const bankColumns = [
  "Date",
  "Bank description",
  "Amount",
  "From/To",
  "Match/Categorize",
  "Check No.",
  "Class",
  "Location",
  "Transaction type",
  "Num",
];
const amountPattern = /^(-?)([A-Z]{3} |\$)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/;

type BankReportImportValues = [
  date: string,
  description: string,
  amount: string,
  name: string,
  split: string,
  checkNumber: string,
  sourceClass: string,
  location: string,
  type: string,
  reference: string,
];

type BankReportRow = {
  importValues: BankReportImportValues;
  sourceValues: string[];
};

export type BankReportGroup = {
  id: number;
  name: string;
  rows: BankReportRow[];
  skipped: number;
  closingBalance?: { date: string; amount: string };
  error?: string;
};

export type BankReport = {
  sourceColumns: string[];
  groups: BankReportGroup[];
};

function text(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  throw new Error("Use values without formulas or links.");
}

function reportDate(value: unknown) {
  const raw = text(value);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  return us ? `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}` : raw;
}

function parseReport(rows: unknown[][], sourceRow: (index: number) => string[]): BankReport {
  const header = rows.slice(0, 20).findIndex((row) => {
    const amount = row.indexOf("Amount");
    return (
      !row[0] && row.includes("Transaction date") && amount > 0 && amount < row.indexOf("Balance")
    );
  });
  if (header < 0 || !rows.slice(0, header).some((row) => row[0] === reportTitle))
    throw new Error("Use the QuickBooks Transaction Detail by Account report.");
  const columns = rows[header]!;
  // The extended export appends another Amount and Transaction type for the underlying
  // transaction. Use the first occurrence, which belongs to the account report line.
  const dateColumn = columns.indexOf("Transaction date");
  const amountColumn = columns.indexOf("Amount");
  const balanceColumn = columns.indexOf("Balance");
  const typeColumn = columns.indexOf("Transaction type");
  const referenceColumn = columns.indexOf("Num");
  const nameColumn = columns.indexOf("Name");
  const descriptionColumn = columns.indexOf("Description");
  const splitColumn = columns.indexOf("Split");
  const classColumn = columns.indexOf("Class full name");
  const locationColumn = columns.indexOf("Location full name");
  const groups: BankReportGroup[] = [];
  const open: BankReportGroup[] = [];
  for (let i = header + 1; i < rows.length; i++) {
    const row = rows[i]!;
    const label = text(row[0]);
    if (/^TOTAL$|^(Accrual|Cash) Basis\b/i.test(label)) break;
    if (label) {
      // Some CSV exports split account labels containing semicolons across adjacent columns.
      const heading = row.slice(0, amountColumn).map(text).filter(Boolean).join("; ");
      if (/^Total for /i.test(label)) {
        const name = heading.replace(/^Total for /i, "").replace(/ with sub-accounts$/i, "");
        let index = open.length - 1;
        while (index >= 0 && open[index]!.name !== name) index--;
        if (index >= 0) open.length = index;
      } else if (
        row.slice(1).every((cell) => cell == null || cell === "") ||
        (/^\d+\s/.test(label) &&
          !row[amountColumn] &&
          !row[balanceColumn] &&
          !dateSchema.safeParse(reportDate(row[dateColumn])).success)
      ) {
        const group = { id: i + 1, name: heading, rows: [], skipped: 0 };
        groups.push(group);
        open.push(group);
      } else if (open.length) {
        open.at(-1)!.error ??=
          `Row ${i + 1} is split across records. Use the XLSX report for this group.`;
      }
      continue;
    }
    if (row.every((cell) => cell == null || cell === "")) continue;
    const group = open.at(-1);
    try {
      const date = reportDate(row[dateColumn]);
      const rawBalance = text(row[balanceColumn]).replace(/^\((.+)\)$/, "-$1");
      const balance = amountPattern.exec(rawBalance);
      if (
        group &&
        balance &&
        dateSchema.safeParse(date).success &&
        (!group.closingBalance || date >= group.closingBalance.date)
      ) {
        group.closingBalance = {
          date,
          amount: balance[1] + balance[3]!.replaceAll(",", "") + (balance[4] ?? ""),
        };
      }
      const rawAmount = text(row[amountColumn]);
      const amount = amountPattern.exec(rawAmount);
      if (
        !rawAmount ||
        (amount && Number(amount[3]!.replaceAll(",", "") + (amount[4] ?? "")) === 0)
      ) {
        if (group) group.skipped++;
        continue;
      }
      if (!amount || !dateSchema.safeParse(date).success)
        throw new Error("Invalid transaction date or amount.");
      if (!group) throw new Error("Transaction has no account group.");
      const type = text(row[typeColumn]);
      const reference = text(row[referenceColumn]);
      const name = text(row[nameColumn]);
      group.rows.push({
        sourceValues: sourceRow(i),
        importValues: [
          date,
          text(row[descriptionColumn]) ||
            [type, reference, name].filter(Boolean).join(" · ") ||
            group.name,
          rawAmount,
          name,
          text(row[splitColumn]),
          /^check$|\(check\)$/i.test(type) ? reference : "",
          text(row[classColumn]),
          text(row[locationColumn]),
          type,
          reference,
        ],
      });
    } catch (error) {
      const message = `Row ${i + 1}: ${error instanceof Error ? error.message : "Invalid transaction."}`;
      if (!group) throw new Error(message);
      group.error ??= message;
    }
  }
  const selectable = groups.filter((group) => group.rows.length || group.error);
  if (!selectable.length) throw new Error("No groups with transactions were found in this report.");
  return { sourceColumns: sourceRow(header), groups: selectable };
}

export function readBankReportCsv(content: string) {
  const source = content.replace(/^\uFEFF/, "");
  const title =
    /^(?:"Transaction Detail by Account"|Transaction Detail by Account)([;,]|\r?$)/m.exec(source);
  if (!title) return undefined;
  const delimiter = title[1] === ";" || /^[;]"?Transaction date"?;/m.test(source) ? ";" : ",";
  const rows = readCsvRows(source, delimiter);
  return parseReport(rows, (index) => rows[index]!);
}

export async function readBankReportXlsx(bytes: ArrayBuffer) {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  const sheet = book.worksheets.find((sheet) =>
    Array.from({ length: 20 }, (_, i) => sheet.getCell(i + 1, 1).value).includes(reportTitle),
  );
  if (!sheet) throw new Error("Use the QuickBooks Transaction Detail by Account report.");
  if (sheet.rowCount > 25_000) throw new Error("The report must have at most 25,000 rows.");
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values = row.values;
    rows.push(Array.isArray(values) ? values.slice(1) : []);
  });
  return parseReport(rows, (index) => {
    const row = sheet.getRow(index + 1);
    return Array.from({ length: row.cellCount }, (_, i) => row.getCell(i + 1).text);
  });
}

export function bankReportAmount(value: string, creditCard: boolean) {
  if (!creditCard) return value;
  return value.startsWith("-") ? value.slice(1) : "-" + value;
}

export function bankReportGroupCsv(
  group: BankReportGroup,
  creditCard: boolean,
  sourceColumns: string[],
) {
  const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  const postingColumn = sourceColumns.indexOf(postingColumnName);
  const columns = postingColumn >= 0 ? [...bankColumns, postingColumnName] : bankColumns;
  return [
    columns.join(","),
    ...group.rows.map(({ importValues, sourceValues }) =>
      (postingColumn >= 0 ? [...importValues, sourceValues[postingColumn] ?? ""] : importValues)
        .map((value, index) => quote(index === 2 ? bankReportAmount(value, creditCard) : value))
        .join(","),
    ),
  ].join("\r\n");
}
