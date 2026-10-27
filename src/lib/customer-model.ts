import { z } from "zod";
const text = z.string().trim().max(2000).default("");
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const address = z.object({ street: text, city: text, state: text, zip: text, country: text });
export const customerSchema = z.object({
  displayName: z.string().trim().min(1, "Informe o nome de exibição.").max(120),
  title: text,
  firstName: text,
  middleName: text,
  lastName: text,
  suffix: text,
  companyName: text,
  printOnChecksAs: text,
  phone: text,
  mobile: text,
  fax: text,
  website: text,
  email: z.union([z.string().trim().email().max(254), z.literal("")]).default(""),
  billingAddress: address.default({}),
  shippingAddress: address.default({}),
  shippingSameAsBilling: z.boolean().default(true),
  currency: z.string().max(3).default(""),
  paymentTermId: text,
  paymentMethod: z.enum(["", "Credit card", "Check", "ACH", "Cash"]).default(""),
  deliveryMethod: z.enum(["", "Send later", "Print later"]).default(""),
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
          if (bytes !== file.size) ctx.addIssue({ code: "custom", message: "Anexo inválido." });
        }),
    )
    .max(20)
    .default([]),
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
    if (names.has(name)) throw new Error("Nome de exibição de cliente já cadastrado.");
    names.add(name);
    if (c.currency && !currencies.includes(c.currency))
      throw new Error("Moeda não pertence à empresa.");
    if (c.paymentTermId && !terms.includes(c.paymentTermId))
      throw new Error("Termo não pertence à empresa.");
    if (c.defaultTaxCode && !taxes.includes(c.defaultTaxCode))
      throw new Error("Imposto não pertence à empresa.");
    if (c.billWithParent && !c.parentCustomerId) throw new Error("Selecione o cliente pai.");
    const seen = new Set([c.id]);
    let parent = c.parentCustomerId;
    while (parent) {
      if (seen.has(parent)) throw new Error("Vínculo circular de clientes.");
      seen.add(parent);
      const row = customers.find((r) => r.id === parent);
      if (!row) throw new Error("Cliente pai não pertence à empresa.");
      parent = row.parentCustomerId;
    }
  }
}
