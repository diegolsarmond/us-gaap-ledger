import { z } from "zod";
const text = z.string().trim().min(1).max(200);
export const parameterScopeFields = {
  scope: z.enum(["global", "companies"]).optional(),
  companyIds: z.array(z.string().uuid()).max(1000).optional(),
  sharedId: z.string().uuid().optional(),
};
const base = {
  ...parameterScopeFields,
  code: text,
  name: text,
  status: z.enum(["Active", "Inactive"]),
};
const date = z.string().date();
export const parameterSchemas = {
  currencies: z.object({
    ...base,
    code: z.string().regex(/^[A-Z]{3}$/),
    isBaseCurrency: z.boolean(),
  }),
  taxJurisdictions: z.object({
    ...base,
    id: text,
    state: z.string().regex(/^[A-Z]{2}$/),
    rate: z.number().finite().min(0).max(100),
    taxType: z.enum(["State Sales Tax", "Local Surcharge", "Combined"]),
    glAccountCode: text,
    filingFrequency: z.enum(["Monthly", "Quarterly", "Annual"]),
  }),
  paymentTerms: z
    .object({
      ...base,
      id: text,
      days: z.number().int().min(0).max(3650),
      earlyDiscountPercentage: z.number().min(0).max(100).optional(),
      discountDays: z.number().int().min(0).optional(),
      isDefaultCustomer: z.boolean(),
      isDefaultVendor: z.boolean(),
    })
    .refine(
      (v) =>
        (v.discountDays ?? 0) <= v.days &&
        (!(v.isDefaultCustomer || v.isDefaultVendor) || v.status === "Active"),
      "The discount deadline must be on or before the due date, and default payment terms must be active.",
    ),
  costCenters: z.object({
    ...base,
    id: text,
    manager: text,
    annualBudget: z.number().finite().min(0),
    description: z.string().max(2000),
  }),
  expenseCategories: z.object({
    ...base,
    id: text,
    glAccountCode: text,
    taxDeductibility: z.enum(["100% Deductible", "50% Meals & Ent.", "Non-Deductible"]),
    description: z.string().max(2000),
  }),
  fiscalPeriods: z
    .object({
      id: text,
      ...parameterScopeFields,
      periodCode: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      fiscalYear: text,
      startDate: date,
      endDate: date,
      status: z.enum(["Open", "Soft-Close", "Locked"]),
      closedBy: z.string().optional(),
      closingDate: z.string().optional(),
      notes: z.string().max(4000).optional(),
    })
    .refine((v) => v.startDate <= v.endDate, "The start date must be on or before the end date."),
};
export const domainSchema = z.enum([
  "currencies",
  "taxJurisdictions",
  "paymentTerms",
  "costCenters",
  "expenseCategories",
  "fiscalPeriods",
]);
export type ParameterDomain = z.infer<typeof domainSchema>;
export const mutationSchema = z.object({
  companyId: z.string().uuid(),
  domain: domainSchema,
  id: text,
  revision: z.number().int().min(0),
  operation: z.enum(["create", "update", "delete"]),
  value: z.unknown().optional(),
});
