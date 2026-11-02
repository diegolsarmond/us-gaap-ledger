import { defineJsonOperation } from "./json-operation.server";
import { companySchema } from "./company-model";
export const loadCompanies = defineJsonOperation({ method: "GET" }).handler(async () =>
  (await import("./companies.server")).listCompanies(),
);
export const saveCompany = defineJsonOperation({ method: "POST" })
  .validator(companySchema)
  .handler(async ({ data }) => (await import("./companies.server")).saveCompany(data));
