import { jsonClient } from "./json-client";
import type * as operations from "./bank-reconciliation.operations.server";

const client = <T extends keyof typeof operations>(name: T, method: "GET" | "POST") =>
  jsonClient<(typeof operations)[T]>("bank-reconciliation", name, method);

export const loadReconciliations = client("list", "GET");
export const loadReconciliation = client("detail", "GET");
export const createReconciliation = client("create", "POST");
export const updateReconciliation = client("update", "POST");
export const toggleReconciliation = client("toggle", "POST");
export const completeReconciliation = client("complete", "POST");
export const reopenReconciliation = client("reopen", "POST");
export const deleteReconciliation = client("remove", "POST");
