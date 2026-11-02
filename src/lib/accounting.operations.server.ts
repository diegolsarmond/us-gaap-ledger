import { defineJsonOperation } from "./json-operation.server";
import { z } from "zod";
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
