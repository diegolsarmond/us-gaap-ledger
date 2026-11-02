import { jsonClient } from "./json-client";

export const loadCashData = jsonClient<typeof import("./cash-flow.operations.server").loadCashData>(
  "cash-flow",
  "loadCashData",
  "GET",
);
export const saveCashAccount = jsonClient<
  typeof import("./cash-flow.operations.server").saveCashAccount
>("cash-flow", "saveCashAccount", "POST");
export const saveCashTransaction = jsonClient<
  typeof import("./cash-flow.operations.server").saveCashTransaction
>("cash-flow", "saveCashTransaction", "POST");
export const deleteCashTransaction = jsonClient<
  typeof import("./cash-flow.operations.server").deleteCashTransaction
>("cash-flow", "deleteCashTransaction", "POST");
export const saveCashCategory = jsonClient<
  typeof import("./cash-flow.operations.server").saveCashCategory
>("cash-flow", "saveCashCategory", "POST");
export const deleteCashCategory = jsonClient<
  typeof import("./cash-flow.operations.server").deleteCashCategory
>("cash-flow", "deleteCashCategory", "POST");
export const loadCashReconciliation = jsonClient<
  typeof import("./cash-flow.operations.server").loadCashReconciliation
>("cash-flow", "loadCashReconciliation", "GET");
export const saveCashReconciliation = jsonClient<
  typeof import("./cash-flow.operations.server").saveCashReconciliation
>("cash-flow", "saveCashReconciliation", "POST");
export const checkCashAgainstGl = jsonClient<
  typeof import("./cash-flow.operations.server").checkCashAgainstGl
>("cash-flow", "checkCashAgainstGl", "GET");
