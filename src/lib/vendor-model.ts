import { z } from "zod";

const optionalText = z.string().trim().max(300).default("");
const emailList = z
  .string()
  .trim()
  .max(2000)
  .default("")
  .refine(
    (value) =>
      !value ||
      value.split(/[;,]/).every((email) => z.string().email().safeParse(email.trim()).success),
    "Enter valid email addresses separated by commas or semicolons.",
  );
const optionalRate = z.number().finite().min(0).nullable().default(null);
export const vendorCustomFieldSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    type: z.enum(["Text", "Number", "Date", "Checkbox"]),
    value: z.string().max(2000),
  })
  .superRefine((field, ctx) => {
    if (!field.value) return;
    const valid =
      field.type === "Text" ||
      (field.type === "Number" &&
        /^-?\d+(\.\d+)?$/.test(field.value) &&
        Number.isFinite(Number(field.value))) ||
      (field.type === "Date" && z.string().date().safeParse(field.value).success) ||
      (field.type === "Checkbox" && ["true", "false"].includes(field.value));
    if (!valid)
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Value does not match the custom field type.",
      });
  });
export const vendorNameLimits = {
  displayName: 500,
  title: 16,
  firstName: 100,
  middleName: 100,
  lastName: 100,
  suffix: 16,
} as const;
export const vendorNameParts = ["title", "firstName", "middleName", "lastName", "suffix"] as const;
const nameText = (key: keyof typeof vendorNameLimits) =>
  z.string().trim().max(vendorNameLimits[key]).default("");
export const vendorSchema = z
  .object({
    displayName: nameText("displayName"),
    title: nameText("title"),
    firstName: nameText("firstName"),
    middleName: nameText("middleName"),
    lastName: nameText("lastName"),
    suffix: nameText("suffix"),
    companyName: z.string().trim().min(1, "Enter the company name.").max(300),
    sourceOpenBalance: z.number().finite().nullable().optional(),
    sourceBalanceDate: z.string().date().nullable().optional(),
    printOnCheckAs: optionalText,
    email: z.union([z.literal(""), z.string().trim().email().max(254)]).default(""),
    cc: emailList,
    bcc: emailList,
    phone: optionalText,
    mobile: optionalText,
    fax: optionalText,
    otherContact: optionalText,
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
    streetAddress2: optionalText,
    addressLines: z
      .array(z.object({ line: z.string().trim().min(1).max(300) }))
      .max(10)
      .default([]),
    city: optionalText,
    stateProvince: optionalText,
    zipCode: optionalText,
    country: optionalText,
    paymentTermId: optionalText,
    sourceCurrency: z.string().max(3).default(""),
    defaultExpenseAccountCode: optionalText,
    accountNumber: optionalText,
    taxId: optionalText,
    track1099: z.boolean().default(false),
    costRate: optionalRate,
    billingRate: optionalRate,
    bankName: optionalText,
    routingNumber: z
      .string()
      .trim()
      .regex(/^(?:\d{9})?$/, "Routing number must contain exactly 9 digits.")
      .default(""),
    bankAccountNumber: z
      .string()
      .trim()
      .regex(/^(?:\d{5,17})?$/, "Bank account number must contain 5 to 17 digits.")
      .default(""),
    bankAccountType: z.enum(["", "Checking", "Savings"]).default(""),
    notes: z.string().trim().max(10000).default(""),
    customFields: z.array(vendorCustomFieldSchema).max(50).default([]),
    bankAccounts: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            label: z.string().trim().min(1).max(120),
            currency: z.string().regex(/^[A-Z]{3}$/),
            bankName: optionalText,
            accountNumber: z
              .string()
              .trim()
              .regex(/^\d{5,17}$/, "Account number must contain 5 to 17 digits."),
            routingNumber: z
              .string()
              .trim()
              .regex(/^(?:\d{9})?$/)
              .default(""),
            swiftBic: z.string().trim().max(20).default(""),
            paymentType: z.enum(["ACH", "Wire"]).default("ACH"),
          })
          .refine(
            (a) => a.paymentType !== "ACH" || /^\d{9}$/.test(a.routingNumber),
            "ACH accounts require a 9 digit routing number.",
          ),
      )
      .max(20)
      .default([]),
  })
  .superRefine((vendor, ctx) => {
    if (!vendor.displayName && !vendorNameParts.some((key) => vendor[key]))
      ctx.addIssue({
        code: "custom",
        path: ["displayName"],
        message: "Enter a display name or at least one part of the vendor name.",
      });
    if (!!vendor.routingNumber !== !!vendor.bankAccountNumber)
      ctx.addIssue({
        code: "custom",
        path: [vendor.routingNumber ? "bankAccountNumber" : "routingNumber"],
        message: "Enter both the routing number and bank account number for ACH payments.",
      });
    if (vendor.sourceBalanceDate && vendor.sourceOpenBalance == null)
      ctx.addIssue({
        code: "custom",
        path: ["sourceOpenBalance"],
        message: "Enter an opening balance for this date.",
      });
    const names = vendor.customFields.map((f) => f.name.toLowerCase());
    if (new Set(names).size !== names.length)
      ctx.addIssue({
        code: "custom",
        path: ["customFields"],
        message: "Custom field names must be unique.",
      });
  })
  .transform((vendor) => ({
    ...vendor,
    displayName:
      vendor.displayName ||
      vendorNameParts
        .map((key) => vendor[key])
        .filter(Boolean)
        .join(" "),
  }));
export type VendorInput = z.infer<typeof vendorSchema>;
export type Vendor = VendorInput & { id: string };
export const MAX_VENDOR_ATTACHMENT_BYTES = 20 * 1024 * 1024;
