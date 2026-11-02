import { importCatalog, importColumns, type ImportDomain } from "./bulk-import";

export function importExample(domain: ImportDomain): Record<string, string | number | boolean> {
  const examples: Record<ImportDomain, Record<string, string | number | boolean>> = {
    companies: {
      name: "EXAMPLE - Silva Services LLC",
      tradeName: "Silva Services",
      entity: "LLC",
      federalTaxClassification: "Disregarded Entity",
      state: "FL",
      ein: "123456789",
      address: "100 Example Street",
      city: "Miami",
      addressState: "FL",
      zip: "33101",
      phone: "0013055550100",
      email: "contact@example.com",
      basis: "Accrual",
      fiscalYearEndMonth: 12,
      active: true,
    },
    customers: {
      displayName: "EXAMPLE - Silva Customer",
      firstName: "Ana",
      lastName: "Silva",
      companyName: "Silva Services",
      email: "ana@example.com",
      phone: "0013055550100",
      "billingAddress.street": "100 Example Street",
      "billingAddress.city": "Miami",
      "billingAddress.state": "FL",
      "billingAddress.zip": "33101",
      "billingAddress.country": "US",
      shippingSameAsBilling: true,
      taxExempt: false,
      billWithParent: false,
    },
    vendors: {
      displayName: "EXAMPLE - Vendor",
      companyName: "Example Supplies",
      email: "contact@example.com",
      phone: "0013055550200",
      streetAddress: "200 Example Street",
      city: "Miami",
      stateProvince: "FL",
      zipCode: "33101",
      country: "US",
      track1099: false,
    },
    accounts: {
      code: "EXAMPLE-1001",
      name: "EXAMPLE - Cash",
      type: "Asset",
      balanceType: "Debit",
      description: "Example cash account",
      maturity: "Current",
      isContra: false,
      track1099: false,
    },
    currencies: { code: "EUR", name: "Euro (EXAMPLE)", isBaseCurrency: false, status: "Active" },
    paymentTerms: {
      code: "EXAMPLE-NET30",
      name: "EXAMPLE - Net 30",
      days: 30,
      earlyDiscountPercentage: 0,
      discountDays: 0,
      isDefaultCustomer: false,
      isDefaultVendor: false,
      status: "Active",
    },
    costCenters: {
      code: "EXAMPLE-ADM",
      name: "EXAMPLE - Administration",
      manager: "Ana Silva",
      annualBudget: 12000.5,
      description: "Example cost center",
      status: "Active",
    },
    expenseCategories: {
      code: "EXAMPLE-DESP",
      name: "EXAMPLE - Office supplies",
      glAccountCode: "6100",
      taxDeductibility: "100% Deductible",
      description: "Replace 6100 with an existing expense account",
      status: "Active",
    },
    taxJurisdictions: {
      code: "EXAMPLE-FL",
      state: "FL",
      name: "EXAMPLE - Florida",
      rate: 6,
      taxType: "State Sales Tax",
      glAccountCode: "2100",
      filingFrequency: "Monthly",
      status: "Active",
    },
    fiscalPeriods: {
      periodCode: "EXAMPLE-2026-11",
      fiscalYear: "2026",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      status: "Open",
      notes: "Example period: replace with dates that do not overlap",
    },
  };
  return examples[domain];
}

export async function downloadImportTemplate(domain: ImportDomain) {
  const { default: ExcelJS } = await import("exceljs");
  const { Workbook } = ExcelJS;
  const book = new Workbook();
  const columns = importColumns(domain);
  const data = book.addWorksheet("Data");
  data.addRow(columns.map((c) => c.path));
  const example = importExample(domain);
  data.addRow(columns.map((c) => example[c.path] ?? ""));
  data.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
  data.getCell("A2").note = "Example row. Replace with your data or delete before importing.";
  data.views = [{ state: "frozen", ySplit: 1 }];
  data.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  data.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF174D41" } };
  data.columns.forEach((c) => {
    c.width = 26;
    c.numFmt = "@";
  });
  const guide = book.addWorksheet("Instructions");
  guide.addRows([
    [importCatalog[domain].label],
    [
      "Row 2 of the Data sheet contains examples. Replace or delete this row before importing. Do not change row 1 (headers).",
    ],
    [
      "Account references in examples are illustrative: replace them with existing account codes in the destination company.",
    ],
    ["Fill out the Data sheet without changing the headers. Limit: 1,000 records."],
    [
      "New records only. Existing codes are rejected. Dates: YYYY-MM-DD. Numbers: decimal point, no thousands separator.",
    ],
    ["Booleans: true or false. Reference fields use existing company codes/IDs."],
    [importCatalog[domain].dependency],
    [],
    ["Field", "Required", "Type", "Allowed values"],
    ...columns.map((c) => [c.path, c.required ? "Yes" : "No", c.type, c.options.join(" | ")]),
  ]);
  guide.columns = [{ width: 48 }, { width: 18 }, { width: 20 }, { width: 100 }];
  const blob = new Blob([(await book.xlsx.writeBuffer()) as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `template-${domain}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readImportWorkbook(file: File, domain: ImportDomain) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Select an .xlsx spreadsheet.");
  if (file.size > 5 * 1024 * 1024) throw new Error("The file must be no larger than 5 MB.");
  const { default: ExcelJS } = await import("exceljs");
  const { Workbook } = ExcelJS;
  const book = new Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const sheet = book.getWorksheet("Data") ?? book.getWorksheet("Dados");
  if (!sheet) throw new Error("The Data sheet was not found. Use the template for this data type.");
  if (sheet.rowCount > 1001) throw new Error("The limit is 1,000 rows per batch.");
  const expected = importColumns(domain).map((c) => c.path);
  const headers = expected.map((_, i) => sheet.getRow(1).getCell(i + 1).text);
  if (sheet.getRow(1).cellCount !== expected.length || headers.some((h, i) => h !== expected[i]))
    throw new Error("Headers do not match. Download the template for the selected data type.");
  const rows: Record<string, string | number | boolean | null>[] = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row: Record<string, string | number | boolean | null> = {};
    for (let j = 0; j < headers.length; j++) {
      const cell = sheet.getRow(i).getCell(j + 1);
      const value = cell.value;
      if (value instanceof Date) row[headers[j]!] = value.toISOString().slice(0, 10);
      else if (value !== null && typeof value === "object")
        throw new Error(
          `Row ${i}: formulas, links, and objects are not accepted. Paste values only.`,
        );
      else row[headers[j]!] = value ?? null;
    }
    if (Object.values(row).every((v) => v === null || v === "")) {
      if (i < sheet.rowCount) throw new Error(`Row ${i}: remove empty rows between records.`);
    } else rows.push(row);
  }
  return rows;
}
