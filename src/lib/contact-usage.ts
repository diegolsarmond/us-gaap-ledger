import type { Customer } from "./customer-model";
import type { Vendor } from "./vendor-model";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Records kept outside the ledger state (journal lines, stored files), counted on the server. */
export type ContactUsage = {
  customers: Record<string, { journalLines: number }>;
  vendors: Record<string, { journalLines: number; attachments: number }>;
};

type CustomerState = {
  customers: Customer[];
  invoices: { customerId?: string | undefined; customerName: string }[];
  projects: { customerId?: string | undefined }[];
};
type VendorState = { bills: { vendorId?: string | undefined; vendorName: string }[] };

/**
 * Everything that would be orphaned by deleting the customer. Legacy invoices without a
 * customerId are matched by display name, as the customer activity panel does.
 */
export function customerLinks(
  state: CustomerState,
  customer: Customer,
  usage?: ContactUsage["customers"][string],
) {
  const invoices = state.invoices.filter(
    (i) =>
      i.customerId === customer.id || (!i.customerId && i.customerName === customer.displayName),
  ).length;
  const projects = state.projects.filter((p) => p.customerId === customer.id).length;
  const children = state.customers.filter((c) => c.parentCustomerId === customer.id).length;
  const attachments = customer.attachments?.length ?? 0;
  return [
    invoices && plural(invoices, "invoice"),
    projects && plural(projects, "project"),
    children && plural(children, "sub-customer"),
    attachments && plural(attachments, "attachment"),
    usage?.journalLines && plural(usage.journalLines, "journal line"),
  ].filter(Boolean) as string[];
}

export function vendorLinks(
  state: VendorState,
  vendor: Vendor,
  usage?: ContactUsage["vendors"][string],
) {
  const bills = state.bills.filter(
    (b) => b.vendorId === vendor.id || (!b.vendorId && b.vendorName === vendor.displayName),
  ).length;
  return [
    bills && plural(bills, "bill"),
    usage?.attachments && plural(usage.attachments, "attachment"),
    usage?.journalLines && plural(usage.journalLines, "journal line"),
  ].filter(Boolean) as string[];
}
