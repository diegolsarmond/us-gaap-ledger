import { defineJsonOperation } from "./json-operation.server";
import { z } from "zod";
import { journalConfiguration } from "./journal-configuration";
export const loadJournalConfiguration = defineJsonOperation({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data }) =>
    (await import("./journal-configuration.server")).loadConfiguration(data.companyId),
  );
export const saveJournalConfiguration = defineJsonOperation({ method: "POST" })
  .validator(journalConfiguration)
  .handler(async ({ data }) =>
    (await import("./journal-configuration.server")).saveConfiguration(data),
  );
