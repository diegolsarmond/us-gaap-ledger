import { defineJsonOperation } from "./json-operation.server";
import { z } from "zod";
import {
  cashFlowLineSchema,
  forecastSchema,
  mappingSchema,
  reconciliationSchema,
  reconciliationScopeSchema,
} from "./cash-flow-model";
const company = z.object({ companyId: z.string().uuid() });
export const loadCashData = defineJsonOperation({ method: "GET" })
  .validator(company)
  .handler(async ({ data }) => (await import("./cash-flow.server")).load(data.companyId));
export const saveCashForecast = defineJsonOperation({ method: "POST" })
  .validator(z.intersection(forecastSchema, company))
  .handler(async ({ data }) => (await import("./cash-flow.server")).saveForecast(data));
export const saveCashFlowMapping = defineJsonOperation({ method: "POST" })
  .validator(
    z.union([
      mappingSchema.extend(company.shape),
      company.extend({
        account_code: mappingSchema.shape.account_code,
        inflow_line: z.null(),
        outflow_line: z.null(),
      }),
    ]),
  )
  .handler(async ({ data }) => (await import("./cash-flow.server")).saveMapping(data));
export const saveCashFlowOverride = defineJsonOperation({ method: "POST" })
  .validator(
    company.extend({
      journal_id: z.string().min(1).max(200),
      line_sequence: z.number().int().nonnegative(),
      counterpart_code: z.string().trim().min(1).max(120),
      cash_flow_line: cashFlowLineSchema.nullable(),
    }),
  )
  .handler(async ({ data }) => (await import("./cash-flow.server")).saveOverride(data));

export const loadCashReconciliation = defineJsonOperation({ method: "GET" })
  .validator(reconciliationScopeSchema)
  .handler(async ({ data }) => (await import("./cash-flow.server")).readReconciliation(data));
export const saveCashReconciliation = defineJsonOperation({ method: "POST" })
  .validator(reconciliationSchema.refine((d) => d.start <= d.end, "Invalid period"))
  .handler(async ({ data }) => (await import("./cash-flow.server")).writeReconciliation(data));
export const checkCashAgainstGl = defineJsonOperation({ method: "GET" })
  .validator(reconciliationScopeSchema)
  .handler(async ({ data }) => (await import("./cash-flow.server")).checkGlCash(data));
