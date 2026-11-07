import { jsonClient } from "./json-client";
export const importAccountList = jsonClient<
  typeof import("./accounting.operations.server").importAccountList
>("accounting", "importAccountList", "POST");
export const importSpreadsheet = jsonClient<
  typeof import("./accounting.operations.server").importSpreadsheet
>("accounting", "importSpreadsheet", "POST");

export const loadAccounting = jsonClient<
  typeof import("./accounting.operations.server").loadAccounting
>("accounting", "loadAccounting", "GET");
export const loadCashAccountLinks = jsonClient<
  typeof import("./accounting.operations.server").loadCashAccountLinks
>("accounting", "loadCashAccountLinks", "GET");
export const runAccountingCommand = jsonClient<
  typeof import("./accounting.operations.server").runAccountingCommand
>("accounting", "runAccountingCommand", "POST");
export const loadContactUsage = jsonClient<
  typeof import("./accounting.operations.server").loadContactUsage
>("accounting", "loadContactUsage", "GET");
