import { jsonClient } from "./json-client";
import type * as operations from "./bank-feed.operations.server";

export const loadBankFeed = jsonClient<typeof operations.list>("bank-feed", "list", "GET");
export const loadBankRow = jsonClient<typeof operations.detail>("bank-feed", "detail", "GET");
export const loadBankRegister = jsonClient<typeof operations.register>(
  "bank-feed",
  "register",
  "GET",
);
export const loadBankFile = jsonClient<typeof operations.archivedFile>(
  "bank-feed",
  "archivedFile",
  "GET",
);
export const loadBankAttachment = jsonClient<typeof operations.attachment>(
  "bank-feed",
  "attachment",
  "GET",
);
export const previewBankFile = jsonClient<typeof operations.preview>(
  "bank-feed",
  "preview",
  "POST",
);
export const uploadBankFile = jsonClient<typeof operations.upload>("bank-feed", "upload", "POST");
export const submitBankReport = jsonClient<typeof operations.reportImport>(
  "bank-feed",
  "reportImport",
  "POST",
);
export const loadBankReportArchive = jsonClient<typeof operations.reportArchive>(
  "bank-feed",
  "reportArchive",
  "GET",
);
export const loadBankReportFile = jsonClient<typeof operations.reportFile>(
  "bank-feed",
  "reportFile",
  "GET",
);
export const previewBankSettlement = jsonClient<typeof operations.previewSettlement>(
  "bank-feed",
  "previewSettlement",
  "POST",
);
export const runBankAction = jsonClient<typeof operations.command>("bank-feed", "command", "POST");
export const runBankBatch = jsonClient<typeof operations.batch>("bank-feed", "batch", "POST");
