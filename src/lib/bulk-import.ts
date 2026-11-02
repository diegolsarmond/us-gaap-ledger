import { z } from "zod";
import { commandArgs } from "./accounting-model";
import { companySchema } from "./company-model";

export const importCatalog = {
  companies: {
    label: "Empresas (Companies)",
    command: "saveCompany",
    dependency: "Exige permissão para gerenciar empresas; não exige cliente de destino",
  },
  customers: {
    label: "Clientes",
    command: "addCustomer",
    dependency: "Moedas, condições de pagamento e jurisdições tributárias",
  },
  vendors: {
    label: "Fornecedores",
    command: "addVendor",
    dependency: "Moedas, condições de pagamento e contas de despesa",
  },
  accounts: {
    label: "Plano de contas",
    command: "addAccount",
    dependency: "Importe contas pai antes das contas filhas",
  },
  currencies: {
    label: "Moedas",
    command: "addCurrency",
    dependency: "USD deve ser a única moeda base",
  },
  paymentTerms: {
    label: "Condições de pagamento",
    command: "addPaymentTerm",
    dependency: "Sem dependências",
  },
  costCenters: {
    label: "Centros de custo",
    command: "addCostCenter",
    dependency: "Sem dependências",
  },
  expenseCategories: {
    label: "Categorias de despesas",
    command: "addExpenseCategory",
    dependency: "Plano de contas",
  },
  taxJurisdictions: {
    label: "Jurisdições tributárias",
    command: "addTaxJurisdiction",
    dependency: "Plano de contas",
  },
  fiscalPeriods: {
    label: "Períodos fiscais",
    command: "addFiscalPeriod",
    dependency: "Exige permissão de fechamento; períodos não podem se sobrepor",
  },
} as const;
export type ImportDomain = keyof typeof importCatalog;
export const importDomainSchema = z.enum([
  "companies",
  "customers",
  "vendors",
  "accounts",
  "currencies",
  "paymentTerms",
  "costCenters",
  "expenseCategories",
  "taxJurisdictions",
  "fiscalPeriods",
]);
export function importSchema(domain: ImportDomain) {
  if (domain === "companies") return companySchema.omit({ id: true });
  return commandArgs[importCatalog[domain].command].items[0];
}
export type ImportColumn = { path: string; type: string; required: boolean; options: string[] };
export function importColumns(domain: ImportDomain): ImportColumn[] {
  const columns: ImportColumn[] = [];
  function walk(schema: z.ZodTypeAny, path: string) {
    const required = !schema.isOptional();
    while (
      schema instanceof z.ZodOptional ||
      schema instanceof z.ZodDefault ||
      schema instanceof z.ZodNullable
    )
      schema = schema instanceof z.ZodDefault ? schema.removeDefault() : schema.unwrap();
    if (schema instanceof z.ZodArray) return;
    if (schema instanceof z.ZodObject) {
      for (const [key, value] of Object.entries(schema.shape))
        walk(value as z.ZodTypeAny, path ? `${path}.${key}` : key);
      return;
    }
    columns.push({
      path,
      required,
      type:
        schema instanceof z.ZodNumber
          ? "número"
          : schema instanceof z.ZodBoolean
            ? "booleano"
            : "texto",
      options: schema instanceof z.ZodEnum ? schema.options : [],
    });
  }
  walk(importSchema(domain), "");
  return columns;
}
export function parseImportRows(domain: ImportDomain, rows: Record<string, unknown>[]) {
  if (!rows.length || rows.length > 1000)
    throw new Error("Informe de 1 a 1.000 registros por lote.");
  const columns = importColumns(domain);
  return rows.map((row, index) => {
    const record: Record<string, unknown> = {};
    for (const column of columns) {
      let value = row[column.path];
      if (value === undefined || value === null || value === "") continue;
      if (column.type === "número" && typeof value === "string") {
        if (!/^-?\d+(\.\d+)?$/.test(value.trim()))
          throw new Error(
            `Linha ${index + 2}, ${column.path}: use número com ponto decimal, sem separador de milhar.`,
          );
        value = Number(value);
      }
      if (column.type === "booleano" && typeof value === "string") {
        if (!/^(true|false|sim|não|nao)$/i.test(value.trim()))
          throw new Error(`Linha ${index + 2}, ${column.path}: use true ou false.`);
        value = /^(true|sim)$/i.test(value.trim());
      }
      const keys = column.path.split(".");
      let target = record;
      for (const key of keys.slice(0, -1)) target = (target[key] ??= {}) as Record<string, unknown>;
      target[keys[keys.length - 1]!] = value;
    }
    const parsed = importSchema(domain).safeParse(record);
    if (!parsed.success)
      throw new Error(
        `Linha ${index + 2}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    return parsed.data;
  });
}
