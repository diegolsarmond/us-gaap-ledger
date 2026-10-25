// Keep navigation availability aligned with the workspace route guard.
const availableModulePaths = new Set([
  "/dashboard",
  "/invoices",
  "/payables",
  "/inventory",
  "/projects",
  "/journals",
  "/accounts",
  "/trial-balance",
  "/dre",
  "/balance-sheet",
  "/taxes",
  "/receivables",
  "/statements",
  "/companies",
  "/cash-flow",
  "/parameters/cash-categories",
  "/access",
  "/users",
  "/audit-log",
  "/parameters",
  "/parameters/currencies",
  "/parameters/tax-jurisdictions",
  "/parameters/payment-terms",
  "/parameters/cost-centers",
  "/parameters/expense-categories",
  "/parameters/fiscal-periods",
]);

export function isModuleAvailable(pathname: string): boolean {
  return availableModulePaths.has(pathname.replace(/\/+$/, "") || "/");
}
