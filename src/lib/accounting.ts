import { jsonClient } from "./json-client";

export const loadAccounting = jsonClient<
  typeof import("./accounting.operations.server").loadAccounting
>("accounting", "loadAccounting", "GET");
export const loadCashAccountLinks = jsonClient<
  typeof import("./accounting.operations.server").loadCashAccountLinks
>("accounting", "loadCashAccountLinks", "GET");
export const runAccountingCommand = jsonClient<
  typeof import("./accounting.operations.server").runAccountingCommand
>("accounting", "runAccountingCommand", "POST");
