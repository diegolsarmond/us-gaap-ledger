import { defineJsonOperation } from "./json-operation.server";
import { z } from "zod";
export const loadReportSources = defineJsonOperation({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data }) => (await import("./reports.server")).loadSources(data.companyId));
