import { z } from "zod";

const optionalText = z.string().trim().max(300).default("");
export const vendorSchema = z.object({
  displayName: z.string().trim().min(1, "Enter a display name.").max(120),
  title: optionalText,
  firstName: optionalText,
  middleName: optionalText,
  lastName: optionalText,
  suffix: optionalText,
  companyName: optionalText,
  sourceOpenBalance: z.number().finite().nullable().optional(),
  sourceBalanceDate: z.string().date().nullable().optional(),
  printOnCheckAs: optionalText,
  email: z.union([z.literal(""), z.string().trim().email().max(254)]).default(""),
  phone: optionalText,
  mobile: optionalText,
  fax: optionalText,
  website: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .url()
        .max(500)
        .refine((v) => /^https?:\/\//i.test(v), "Use http:// or https://."),
    ])
    .default(""),
  streetAddress: optionalText,
  city: optionalText,
  stateProvince: optionalText,
  zipCode: optionalText,
  country: optionalText,
  paymentTermId: optionalText,
  currency: z.union([z.literal(""), z.string().regex(/^[A-Z]{3}$/)]).default(""),
  defaultExpenseAccountCode: optionalText,
  accountNumber: optionalText,
  taxId: optionalText,
  track1099: z.boolean().default(false),
  bankName: optionalText,
  routingNumber: optionalText,
  bankAccountNumber: optionalText,
  bankAccountType: z.enum(["", "Checking", "Savings"]).default(""),
  notes: z.string().trim().max(10000).default(""),
});
export type VendorInput = z.infer<typeof vendorSchema>;
export type Vendor = VendorInput & { id: string };
export const MAX_VENDOR_ATTACHMENT_BYTES = 20 * 1024 * 1024;
