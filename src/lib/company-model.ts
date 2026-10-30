import { z } from "zod";

export const US_STATES =
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC AS GU MP PR VI".split(
    " ",
  );
export const companySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(200),
  tradeName: z.string().trim().max(200).default(""),
  entity: z.enum(["LLC", "Corporation", "Partnership", "Sole Proprietorship", "Nonprofit"]),
  federalTaxClassification: z
    .enum([
      "Unspecified",
      "Disregarded Entity",
      "Partnership",
      "C Corporation",
      "S Corporation",
      "Tax Exempt",
    ])
    .default("Unspecified"),
  state: z.string().refine((s) => US_STATES.includes(s), "Invalid state"),
  ein: z
    .string()
    .trim()
    .regex(/^(?:\d{2}-?\d{7})?$/, "EIN must contain nine digits")
    .transform((s) => s.replace(/-/g, ""))
    .default(""),
  address: z.string().trim().max(300).default(""),
  city: z.string().trim().max(120).default(""),
  addressState: z
    .string()
    .refine((s) => !s || US_STATES.includes(s))
    .default(""),
  zip: z
    .string()
    .regex(/^(?:\d{5}(?:-\d{4})?)?$/)
    .default(""),
  phone: z.string().trim().max(40).default(""),
  email: z.union([z.literal(""), z.string().email().max(254)]).default(""),
  basis: z.enum(["Accrual", "Cash"]).default("Accrual"),
  fiscalYearEndMonth: z.number().int().min(1).max(12).default(12),
  active: z.boolean().default(true),
});
export type Company = z.infer<typeof companySchema> & {
  id: string;
  baseCurrency: "USD";
  initials: string;
  costMethod: "FIFO" | "WeightedAverage";
  isPeriodClosed: boolean;
  activePeriod: string;
};
export const formatEin = (ein: string) =>
  ein ? `${ein.slice(0, 2)}-${ein.slice(2)}` : "EIN not provided";

export function formatUsPhone(value: string): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.length === 11 && digits.startsWith("1")) {
    const d = digits.slice(1);
    return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
  }

  if (digits.startsWith("1") && digits.length > 1) {
    const d = digits.slice(1, 11);
    if (d.length <= 3) return `+1 (${d}`;
    if (d.length <= 6) return `+1 (${d.slice(0, 3)}) ${d.slice(3)}`;
    return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
  }

  const d = digits.slice(0, 10);
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
}
