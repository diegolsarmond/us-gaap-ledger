import { jsonClient } from "./json-client";

export const loadCompanies = jsonClient<
  typeof import("./companies.operations.server").loadCompanies
>("companies", "loadCompanies", "GET");
export const saveCompany = jsonClient<typeof import("./companies.operations.server").saveCompany>(
  "companies",
  "saveCompany",
  "POST",
);
