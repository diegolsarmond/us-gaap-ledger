import { defineJsonOperation } from "./json-operation.server";
import { z } from "zod";
import {
  accountSchema,
  transactionSchema,
  cashCategorySchema,
  reconciliationSchema,
  reconciliationScopeSchema,
} from "./cash-flow-model";
export const loadCashData = defineJsonOperation({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const server = await import("./cash-flow.server");
    return server.load(data.companyId);
  });
export const saveCashAccount = defineJsonOperation({ method: "POST" })
  .validator(accountSchema.extend({ companyId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const server = await import("./cash-flow.server");
    return server.saveAccount(data);
  });
export const saveCashTransaction = defineJsonOperation({ method: "POST" })
  .validator(z.intersection(transactionSchema, z.object({ companyId: z.string().uuid() })))
  .handler(async ({ data }) => {
    const server = await import("./cash-flow.server");
    return server.saveTransaction(data);
  });
export const deleteCashTransaction = defineJsonOperation({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), companyId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const server = await import("./cash-flow.server");
    return server.removeTransaction(data.id, data.companyId);
  });

export const saveCashCategory = defineJsonOperation({ method: "POST" })
  .validator(cashCategorySchema.extend({ companyId: z.string().uuid() }))
  .handler(async ({ data }) => (await import("./cash-flow.server")).writeCategory(data));
export const deleteCashCategory = defineJsonOperation({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(), companyId: z.string().uuid() }))
  .handler(async ({ data }) => (await import("./cash-flow.server")).writeCategory(data));

export const loadCashReconciliation = defineJsonOperation({ method: "GET" })
  .validator(reconciliationScopeSchema)
  .handler(async ({ data }) => (await import("./cash-flow.server")).readReconciliation(data));
export const saveCashReconciliation = defineJsonOperation({ method: "POST" })
  .validator(reconciliationSchema.refine((d) => d.start <= d.end, "Invalid period"))
  .handler(async ({ data }) => (await import("./cash-flow.server")).writeReconciliation(data));
export const checkCashAgainstGl = defineJsonOperation({ method: "GET" })
  .validator(reconciliationScopeSchema)
  .handler(async ({ data }) => (await import("./cash-flow.server")).checkGlCash(data));
