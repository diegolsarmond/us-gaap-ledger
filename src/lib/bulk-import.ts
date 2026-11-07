import { z } from "zod";
import { commandArgs } from "./accounting-model";
import { companySchema } from "./company-model";

export const importCatalog = {
  companies: {
    label: "Companies",
    command: "saveCompany",
    dependency: "Requires permission to manage companies; no destination client required",
  },
  customers: {
    label: "Customers",
    command: "addCustomer",
    dependency: "Currencies, payment terms, and tax jurisdictions",
  },
  vendors: {
    label: "Vendors",
    command: "addVendor",
    dependency: "Currencies, payment terms, and expense accounts",
  },
  accounts: {
    label: "Chart of Accounts",
    command: "addAccount",
    dependency: "Import parent accounts before child accounts",
  },
  currencies: {
    label: "Currencies",
    command: "addCurrency",
    dependency: "USD must be the only base currency",
  },
  paymentTerms: {
    label: "Payment Terms",
    command: "addPaymentTerm",
    dependency: "No dependencies",
  },
  costCenters: {
    label: "Cost Centers",
    command: "addCostCenter",
    dependency: "No dependencies",
  },
  expenseCategories: {
    label: "Expense Categories",
    command: "addExpenseCategory",
    dependency: "Chart of Accounts",
  },
  taxJurisdictions: {
    label: "Tax Jurisdictions",
    command: "addTaxJurisdiction",
    dependency: "Chart of Accounts",
  },
  fiscalPeriods: {
    label: "Fiscal Periods",
    command: "addFiscalPeriod",
    dependency: "Requires period closing permission; periods must not overlap",
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
  if (domain === "accounts") return commandArgs.addAccount.items[0].omit({ sourceAccount: true });
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
      schema instanceof z.ZodNullable ||
      schema instanceof z.ZodEffects
    )
      schema =
        schema instanceof z.ZodDefault
          ? schema.removeDefault()
          : schema instanceof z.ZodEffects
            ? schema.innerType()
            : schema.unwrap();
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
          ? "number"
          : schema instanceof z.ZodBoolean
            ? "boolean"
            : "text",
      options: schema instanceof z.ZodEnum ? schema.options : [],
    });
  }
  walk(importSchema(domain), "");
  return columns;
}
export function parseImportRows(domain: ImportDomain, rows: Record<string, unknown>[]) {
  if (!rows.length || rows.length > 1000)
    throw new Error("Provide between 1 and 1,000 records per batch.");
  const columns = importColumns(domain);
  return rows.map((row, index) => {
    const record: Record<string, unknown> = {};
    for (const column of columns) {
      let value = row[column.path];
      if (value === undefined || value === null || value === "") continue;
      if (column.type === "number" && typeof value === "string") {
        if (!/^-?\d+(\.\d+)?$/.test(value.trim()))
          throw new Error(
            `Row ${index + 2}, ${column.path}: use a number with a decimal point and no thousands separator.`,
          );
        value = Number(value);
      }
      if (column.type === "boolean" && typeof value === "string") {
        if (!/^(true|false|sim|não|nao)$/i.test(value.trim()))
          throw new Error(`Row ${index + 2}, ${column.path}: use true or false.`);
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
        `Row ${index + 2}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    return parsed.data;
  });
}
