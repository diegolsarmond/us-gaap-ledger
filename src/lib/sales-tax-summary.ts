import type { Invoice } from "./accounting-engine";
import { money, normalizedFx } from "./transaction-fx";
/** Month-to-date amounts in the functional currency, with each invoice converted at issue. */
export function salesTaxSummary(invoices: Invoice[], asOf: string) {
  let taxableSales = 0,
    exemptSales = 0,
    collected = 0;
  for (const invoice of invoices) {
    if (invoice.date > asOf || invoice.date.slice(0, 7) !== asOf.slice(0, 7)) continue;
    const rate = normalizedFx(invoice).exchangeRateValue;
    const taxable = invoice.taxExempt
      ? 0
      : invoice.items.filter((i) => i.taxable).reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
    taxableSales += money(taxable * rate);
    exemptSales += money((invoice.subtotal - taxable) * rate);
    collected += money(invoice.taxAmount * rate);
  }
  return {
    taxableSales: money(taxableSales),
    exemptSales: money(exemptSales),
    collected: money(collected),
  };
}
