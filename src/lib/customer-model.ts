import { z } from "zod";
import { vendorCustomFieldSchema } from "./vendor-model";
const text = z.string().trim().max(2000).default("");
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const address = z.object({ street: text, city: text, state: text, zip: text, country: text });
export const customerSchema = z
  .object({
    displayName: z.string().trim().min(1, "Enter a display name.").max(120),
    title: text,
    firstName: text,
    middleName: text,
    lastName: text,
    suffix: text,
    companyName: text,
    registrationStatus: z.enum(["Draft", "Active"]).default("Active"),
    customerType: z.string().trim().max(120).optional(),
    sourceOpenBalance: z.number().finite().nullable().optional(),
    sourceBalanceDate: z.string().date().nullable().optional(),
    printOnChecksAs: text,
    phone: text,
    mobile: text,
    fax: text,
    website: text,
    email: z
      .union([z.string().trim().email("Enter a valid billing email.").max(254), z.literal("")])
      .default(""),
    billingAddress: address.default({}),
    shippingAddress: address.default({}),
    shippingSameAsBilling: z.boolean().default(true),
    sourceCurrency: z.string().max(3).default(""),
    paymentTermId: text,
    paymentMethod: z.enum(["", "Credit card", "Check", "ACH", "Cash"]).default(""),
    deliveryMethod: z
      .enum(["", "Send later", "Print later", "Email", "Portal", "Print"])
      .default(""),
    customFields: z.array(vendorCustomFieldSchema).max(50).default([]),
    taxId: text,
    taxExempt: z.boolean().default(false),
    exemptionReason: text,
    defaultTaxCode: text,
    notes: z.string().max(20000).default(""),
    parentCustomerId: text,
    billWithParent: z.boolean().default(false),
    attachments: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            name: z.string().min(1).max(255),
            size: z.number().int().min(0).max(MAX_ATTACHMENT_BYTES),
            content: z
              .string()
              .max(Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4)
              .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
          })
          .superRefine((file, ctx) => {
            const bytes =
              (file.content.length * 3) / 4 -
              (file.content.endsWith("==") ? 2 : file.content.endsWith("=") ? 1 : 0);
            if (bytes !== file.size)
              ctx.addIssue({ code: "custom", message: "Invalid attachment." });
          }),
      )
      .max(20)
      .default([]),
  })
  .superRefine((customer, ctx) => {
    const names = customer.customFields.map((f) => f.name.toLowerCase());
    if (new Set(names).size !== names.length)
      ctx.addIssue({
        code: "custom",
        path: ["customFields"],
        message: "Custom field names must be unique.",
      });
    if (customer.registrationStatus === "Draft") return;
    if (!customer.companyName)
      ctx.addIssue({
        code: "custom",
        path: ["companyName"],
        message: "Enter the customer company name.",
      });
    if (!customer.email)
      ctx.addIssue({ code: "custom", path: ["email"], message: "Enter a billing email." });
    for (const key of customer.shippingSameAsBilling
      ? (["billingAddress"] as const)
      : (["billingAddress", "shippingAddress"] as const)) {
      for (const field of ["street", "city", "country"] as const)
        if (!customer[key][field].trim())
          ctx.addIssue({
            code: "custom",
            path: [key, field],
            message: "Enter the required address field.",
          });
    }
  });
export type CustomerInput = z.infer<typeof customerSchema>;
export type Customer = CustomerInput & { id: string };
export function validateCustomers(
  customers: Customer[],
  currencies: string[],
  terms: string[],
  taxes: string[],
) {
  const names = new Set<string>();
  for (const c of customers) {
    customerSchema.parse(c);
    const name = c.displayName.toLowerCase();
    if (names.has(name)) throw new Error("A customer with this display name already exists.");
    names.add(name);
    if (c.paymentTermId && !terms.includes(c.paymentTermId))
      throw new Error("Payment term does not belong to this company.");
    if (c.defaultTaxCode && !taxes.includes(c.defaultTaxCode))
      throw new Error("Tax does not belong to this company.");
    if (c.billWithParent && !c.parentCustomerId) throw new Error("Select a parent customer.");
    const seen = new Set([c.id]);
    let parent = c.parentCustomerId;
    while (parent) {
      if (seen.has(parent)) throw new Error("Circular customer relationship.");
      seen.add(parent);
      const row = customers.find((r) => r.id === parent);
      if (!row) throw new Error("Parent customer does not belong to this company.");
      parent = row.parentCustomerId;
    }
  }
}
