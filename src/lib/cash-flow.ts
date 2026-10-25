import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { accountSchema, transactionSchema } from "./cash-flow-model";
export const loadCashData = createServerFn({ method: "GET" }).validator(z.object({companyId:z.string().uuid()})).handler(async ({data}) => {
  const server = await import("./cash-flow.server");
  return server.load(data.companyId);
});
export const saveCashAccount = createServerFn({ method: "POST" })
  .validator(accountSchema.extend({companyId:z.string().uuid()}))
  .handler(async ({ data }) => {
    const server = await import("./cash-flow.server");
    return server.saveAccount(data);
  });
export const saveCashTransaction = createServerFn({ method: "POST" })
  .validator(z.intersection(transactionSchema,z.object({companyId:z.string().uuid()})))
  .handler(async ({ data }) => {
    const server = await import("./cash-flow.server");
    return server.saveTransaction(data);
  });
export const deleteCashTransaction = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid(),companyId:z.string().uuid() }))
  .handler(async ({ data }) => {
    const server = await import("./cash-flow.server");
    return server.removeTransaction(data.id,data.companyId);
  });
