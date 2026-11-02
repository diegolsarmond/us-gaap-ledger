import { jsonClient } from "./json-client";

export const loadReportSources = jsonClient<
  typeof import("./reports.operations.server").loadReportSources
>("reports", "loadReportSources", "GET");
