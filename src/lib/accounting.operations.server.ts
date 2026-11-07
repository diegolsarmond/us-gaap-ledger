import { defineJsonOperation } from "./json-operation.server";
import { z } from "zod";
import { importCatalog, importDomainSchema, parseImportRows } from "./bulk-import";
import { companySchema } from "./company-model";
import { parseAccountListCsv } from "./account-list-csv.server";

export const importAccountList = defineJsonOperation({ method: "POST" })
  .validator(
    z.object({
      companyId: z.string().uuid(),
      revision: z.number().int().nonnegative(),
      content: z.string().max(2_000_000),
      preview: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const accounts = parseAccountListCsv(data.content);
    const rows = accounts.map((account) => [account]);
    await (
      await import("./accounting.server")
    ).execute(
      { companyId: data.companyId, revision: data.revision, command: "addAccount", args: rows[0]! },
      { rows, preview: data.preview },
    );
    return { accounts: data.preview ? accounts : [], count: accounts.length };
  });

export const importSpreadsheet = defineJsonOperation({ method: "POST" })
  .validator(
    z.object({
      companyId: z.string().uuid().optional(),
      revision: z.number().int().nonnegative(),
      domain: importDomainSchema,
      preview: z.boolean(),
      rows: z
        .array(
          z.record(z.union([z.string().max(20000), z.number().finite(), z.boolean(), z.null()])),
        )
        .min(1)
        .max(1000),
    }),
  )
  .handler(async ({ data }) => {
    const rows = parseImportRows(data.domain, data.rows).map((row) => [row]);
    if (data.domain === "companies") {
      const companies = rows.map((row) => companySchema.parse(row[0]));
      await (
        await import("./companies.server")
      ).saveCompany(companies[0]!, { rows: companies, preview: data.preview });
      return { result: { success: true, count: companies.length } };
    }
    if (!data.companyId) throw new Error("Select the destination company.");
    return (await import("./accounting.server")).execute(
      {
        companyId: data.companyId,
        revision: data.revision,
        command: importCatalog[data.domain].command,
        args: rows[0]!,
      },
      { rows, preview: data.preview },
    );
  });
export const loadAccounting = defineJsonOperation({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data }) => (await import("./accounting.server")).load(data.companyId));
export const loadCashAccountLinks = defineJsonOperation({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data }) =>
    (await import("./accounting.server")).cashAccountLinks(data.companyId),
  );
export const runAccountingCommand = defineJsonOperation({ method: "POST" })
  .validator(
    z.object({
      companyId: z.string().uuid(),
      revision: z.number().int().nonnegative(),
      command: z.string().max(80),
      args: z.array(z.unknown()).max(5),
    }),
  )
  .handler(async ({ data }) => (await import("./accounting.server")).execute(data));
export const loadContactUsage = defineJsonOperation({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await (await import("./companies.server")).authorizeCompany(data.companyId);
    return (await import("./accounting.server")).contactUsage(data.companyId);
  });
