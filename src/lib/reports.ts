import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
export const loadReportSources = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data }) => (await import("./reports.server")).loadSources(data.companyId));
