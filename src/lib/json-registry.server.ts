const modules = {
  accounting: () => import("./accounting.operations.server"),
  auth: () => import("./auth.operations.server"),
  admin: () => import("./admin.operations.server"),
  companies: () => import("./companies.operations.server"),
  "cash-flow": () => import("./cash-flow.operations.server"),
  parameters: () => import("./parameters.operations.server"),
  reports: () => import("./reports.operations.server"),
  journals: () => import("./journals.operations.server"),
  "vendor-attachments": () => import("./vendor-attachments.operations.server"),
  "bank-feed": () => import("./bank-feed.operations.server"),
};

export async function dispatchJson(
  module: string,
  operation: string,
  method: string,
  data: unknown,
) {
  if (!Object.hasOwn(modules, module)) throw new Error("Unknown JSON module");
  const operations = await modules[module as keyof typeof modules]();
  if (!Object.hasOwn(operations, operation)) throw new Error("Unknown JSON operation");
  const handler = (
    operations as unknown as Record<
      string,
      { method: string; (options: { data: unknown }): Promise<unknown> }
    >
  )[operation]!;
  if (handler.method !== method) throw new Error("Unsupported method");
  return handler({ data });
}
