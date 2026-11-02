import { importCatalog, importColumns, type ImportDomain } from "./bulk-import";

export function importExample(domain: ImportDomain): Record<string, string | number | boolean> {
  const examples: Record<ImportDomain, Record<string, string | number | boolean>> = {
    companies: {
      name: "EXEMPLO - Silva Services LLC",
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
      email: "contato@example.com",
      basis: "Accrual",
      fiscalYearEndMonth: 12,
      active: true,
    },
    customers: {
      displayName: "EXEMPLO - Cliente Silva",
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
      displayName: "EXEMPLO - Fornecedor",
      companyName: "Example Supplies",
      email: "contato@example.com",
      phone: "0013055550200",
      streetAddress: "200 Example Street",
      city: "Miami",
      stateProvince: "FL",
      zipCode: "33101",
      country: "US",
      track1099: false,
    },
    accounts: {
      code: "EXEMPLO-1001",
      name: "EXEMPLO - Caixa",
      type: "Asset",
      balanceType: "Debit",
      description: "Conta de caixa de exemplo",
      maturity: "Current",
      isContra: false,
      track1099: false,
    },
    currencies: { code: "EUR", name: "Euro (EXEMPLO)", isBaseCurrency: false, status: "Active" },
    paymentTerms: {
      code: "EXEMPLO-NET30",
      name: "EXEMPLO - 30 dias",
      days: 30,
      earlyDiscountPercentage: 0,
      discountDays: 0,
      isDefaultCustomer: false,
      isDefaultVendor: false,
      status: "Active",
    },
    costCenters: {
      code: "EXEMPLO-ADM",
      name: "EXEMPLO - Administrativo",
      manager: "Ana Silva",
      annualBudget: 12000.5,
      description: "Centro de custo de exemplo",
      status: "Active",
    },
    expenseCategories: {
      code: "EXEMPLO-DESP",
      name: "EXEMPLO - Material de escritório",
      glAccountCode: "6100",
      taxDeductibility: "100% Deductible",
      description: "Substitua 6100 por uma conta de despesa existente",
      status: "Active",
    },
    taxJurisdictions: {
      code: "EXEMPLO-FL",
      state: "FL",
      name: "EXEMPLO - Florida",
      rate: 6,
      taxType: "State Sales Tax",
      glAccountCode: "2100",
      filingFrequency: "Monthly",
      status: "Active",
    },
    fiscalPeriods: {
      periodCode: "EXEMPLO-2026-11",
      fiscalYear: "2026",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      status: "Open",
      notes: "Período de exemplo: substitua por datas sem sobreposição",
    },
  };
  return examples[domain];
}

export async function downloadImportTemplate(domain: ImportDomain) {
  const { default: ExcelJS } = await import("exceljs");
  const { Workbook } = ExcelJS;
  const book = new Workbook();
  const columns = importColumns(domain);
  const data = book.addWorksheet("Dados");
  data.addRow(columns.map((c) => c.path));
  const example = importExample(domain);
  data.addRow(columns.map((c) => example[c.path] ?? ""));
  data.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } };
  data.getCell("A2").note =
    "Linha de exemplo. Substitua pelos seus dados ou remova antes de importar.";
  data.views = [{ state: "frozen", ySplit: 1 }];
  data.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  data.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF174D41" } };
  data.columns.forEach((c) => {
    c.width = 26;
    c.numFmt = "@";
  });
  const guide = book.addWorksheet("Instruções");
  guide.addRows([
    [importCatalog[domain].label],
    [
      "A linha 2 da aba Dados contém exemplos. Substitua ou remova essa linha antes de importar. Não altere a linha 1 (cabeçalhos).",
    ],
    [
      "Referências contábeis nos exemplos são ilustrativas: substitua pelos códigos existentes no cliente de destino.",
    ],
    ["Preencha a aba Dados sem alterar os cabeçalhos. Limite: 1.000 registros."],
    [
      "Somente inclusão. Códigos existentes são rejeitados. Datas: AAAA-MM-DD. Números: ponto decimal, sem milhar.",
    ],
    [
      "Booleanos: true ou false. Campos de referência usam os códigos/IDs já cadastrados na empresa.",
    ],
    [importCatalog[domain].dependency],
    [],
    ["Campo", "Obrigatório", "Tipo", "Valores permitidos"],
    ...columns.map((c) => [c.path, c.required ? "Sim" : "Não", c.type, c.options.join(" | ")]),
  ]);
  guide.columns = [{ width: 48 }, { width: 18 }, { width: 20 }, { width: 100 }];
  const blob = new Blob([(await book.xlsx.writeBuffer()) as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `modelo-${domain}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readImportWorkbook(file: File, domain: ImportDomain) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Selecione uma planilha .xlsx.");
  if (file.size > 5 * 1024 * 1024) throw new Error("O arquivo deve ter até 5 MB.");
  const { default: ExcelJS } = await import("exceljs");
  const { Workbook } = ExcelJS;
  const book = new Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const sheet = book.getWorksheet("Dados");
  if (!sheet) throw new Error("A aba Dados não foi encontrada. Use o modelo deste cadastro.");
  if (sheet.rowCount > 1001) throw new Error("O limite é de 1.000 linhas por lote.");
  const expected = importColumns(domain).map((c) => c.path);
  const headers = expected.map((_, i) => sheet.getRow(1).getCell(i + 1).text);
  if (sheet.getRow(1).cellCount !== expected.length || headers.some((h, i) => h !== expected[i]))
    throw new Error("Cabeçalhos incompatíveis. Baixe o modelo do cadastro selecionado.");
  const rows: Record<string, string | number | boolean | null>[] = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row: Record<string, string | number | boolean | null> = {};
    for (let j = 0; j < headers.length; j++) {
      const cell = sheet.getRow(i).getCell(j + 1);
      const value = cell.value;
      if (value instanceof Date) row[headers[j]!] = value.toISOString().slice(0, 10);
      else if (value !== null && typeof value === "object")
        throw new Error(
          `Linha ${i}: fórmulas, links e objetos não são aceitos. Cole apenas valores.`,
        );
      else row[headers[j]!] = value ?? null;
    }
    if (Object.values(row).every((v) => v === null || v === "")) {
      if (i < sheet.rowCount) throw new Error(`Linha ${i}: remova linhas vazias entre registros.`);
    } else rows.push(row);
  }
  return rows;
}
