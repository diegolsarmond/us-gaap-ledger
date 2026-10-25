import { createServerFn } from "@tanstack/react-start";
import { companySchema } from "./company-model";
export const loadCompanies = createServerFn({ method: "GET" }).handler(async () => (await import("./companies.server")).listCompanies());
export const saveCompany = createServerFn({ method: "POST" }).validator(companySchema).handler(async ({ data }) => (await import("./companies.server")).saveCompany(data));
