import { z } from "zod";

const key = z.string().trim().min(1).max(120);
export const dimensionSchema = z.object({
  id: key,
  code: key,
  name: z.string().trim().min(1).max(200),
  status: z.enum(["Active", "Inactive"]),
  required: z.boolean(),
  applyInvoices: z.boolean(),
  applyBills: z.boolean(),
  options: z
    .array(
      z.object({
        id: key,
        code: key,
        name: z.string().trim().min(1).max(200),
        status: z.enum(["Active", "Inactive"]),
      }),
    )
    .min(1)
    .max(500),
});
export const dimensionValueSchema = z.object({
  dimensionId: key,
  valueId: key,
  lineId: key.optional(),
});
export const dimensionValuesSchema = z.array(dimensionValueSchema).max(10000).optional();
export type Dimension = z.infer<typeof dimensionSchema>;
export type DimensionValue = z.infer<typeof dimensionValueSchema>;
export type DimensionDocument = "invoices" | "bills";
export const isProfitLoss = (type: string) =>
  ["Revenue", "COGS", "Operating Expense", "Other Income", "Other Expense"].includes(type);
export function appliesTo(d: Dimension, document: DimensionDocument) {
  return document === "invoices" ? d.applyInvoices : d.applyBills;
}
export function effectiveDimensions(
  values: DimensionValue[] = [],
  lineId?: string,
): DimensionValue[] {
  const result = new Map(values.filter((v) => !v.lineId).map((v) => [v.dimensionId, v]));
  if (lineId)
    for (const v of values.filter((v) => v.lineId === lineId)) result.set(v.dimensionId, v);
  return [...result.values()].map(({ dimensionId, valueId }) => ({ dimensionId, valueId }));
}
export function validateDimensionDefinitions(dimensions: Dimension[]) {
  const codes = new Set<string>();
  for (const d of dimensions) {
    dimensionSchema.parse(d);
    const code = d.code.toLowerCase();
    if (codes.has(code)) throw new Error("Dimension codes must be unique.");
    codes.add(code);
    if (
      new Set(d.options.map((o) => o.id)).size !== d.options.length ||
      new Set(d.options.map((o) => o.code.toLowerCase())).size !== d.options.length
    )
      throw new Error(`Option IDs and codes must be unique in ${d.name}.`);
  }
}
// Historical references remain valid after archiving. Required/active rules apply only on entry.
export function validateDimensionValues(
  dimensions: Dimension[],
  values: DimensionValue[] = [],
  lineIds: string[] = [],
  document?: DimensionDocument,
  entering = false,
) {
  if (entering && new Set(lineIds).size !== lineIds.length)
    throw new Error("Document line IDs must be unique.");
  const keys = new Set<string>();
  for (const v of values) {
    const d = dimensions.find((d) => d.id === v.dimensionId);
    const option = d?.options.find((o) => o.id === v.valueId);
    if (!d || !option) throw new Error("Dimension or option does not belong to this company.");
    const key = JSON.stringify([v.lineId ?? "", v.dimensionId]);
    if (keys.has(key)) throw new Error("Select only one option per dimension and line.");
    keys.add(key);
    if (v.lineId && !lineIds.includes(v.lineId))
      throw new Error("Dimension references an unknown document line.");
    if (
      entering &&
      (d.status !== "Active" || option.status !== "Active" || (document && !appliesTo(d, document)))
    )
      throw new Error(`Select an active option for ${d.name} on this document.`);
  }
}
export function requireDimensions(
  dimensions: Dimension[],
  values: DimensionValue[],
  document: DimensionDocument,
) {
  for (const d of dimensions.filter(
    (d) => d.status === "Active" && d.required && appliesTo(d, document),
  ))
    if (!values.some((v) => v.dimensionId === d.id))
      throw new Error(`Select ${d.name} for every revenue or expense line.`);
}
export function recommendedDimensions(): Dimension[] {
  return [
    [
      "PRODUCT",
      "Product category",
      ["Filter Elements", "Vessels / Housings", "Replacement Parts", "Services / Installation"],
    ],
    ["LOGISTICS", "Transport mode", ["Air Freight", "Ocean Freight", "Land / Courier Express"]],
    ["OPERATION", "Operation type", ["Normal Sale", "Free Sample", "Test / R&D", "Internal Use"]],
  ].map(([code, name, options]) => ({
    id: crypto.randomUUID(),
    code: code as string,
    name: name as string,
    status: "Active",
    required: false,
    applyInvoices: true,
    applyBills: true,
    options: (options as string[]).map((name, i) => ({
      id: crypto.randomUUID(),
      code: String(i + 1),
      name,
      status: "Active",
    })),
  }));
}
