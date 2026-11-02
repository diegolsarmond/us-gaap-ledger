import { jsonClient } from "./json-client";

export const loadJournalConfiguration = jsonClient<
  typeof import("./journals.operations.server").loadJournalConfiguration
>("journals", "loadJournalConfiguration", "GET");
export const saveJournalConfiguration = jsonClient<
  typeof import("./journals.operations.server").saveJournalConfiguration
>("journals", "saveJournalConfiguration", "POST");
