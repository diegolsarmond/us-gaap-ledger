import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { journalConfiguration } from "./journal-configuration";
export const loadJournalConfiguration = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data }) =>
    (await import("./journal-configuration.server")).loadConfiguration(data.companyId),
  );
export const saveJournalConfiguration = createServerFn({ method: "POST" })
  .validator(journalConfiguration)
  .handler(async ({ data }) =>
    (await import("./journal-configuration.server")).saveConfiguration(data),
  );
