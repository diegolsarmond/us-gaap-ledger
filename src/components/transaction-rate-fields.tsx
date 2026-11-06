import { useAccounting } from "@/lib/accounting-store";
import type { useTransactionQuote } from "@/lib/use-transaction-quote";
export function TransactionRateFields({
  currency,
  date,
  onCurrency,
  quote,
}: {
  currency: string;
  date: string;
  onCurrency: (value: string) => void;
  quote: ReturnType<typeof useTransactionQuote>;
}) {
  const { currencies } = useAccounting();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">
        Transaction currency *
        <select
          className="w-full rounded border border-line p-2"
          required
          value={currency}
          onChange={(e) => onCurrency(e.target.value)}
        >
          <option value="" disabled>
            Select an active company currency
          </option>
          {!currencies.some((c) => c.status === "Active" && c.code === currency) && currency && (
            <option value={currency} disabled>
              {currency} (inactive — select another currency)
            </option>
          )}
          {currencies
            .filter((c) => c.status === "Active")
            .map((c) => c.code)
            .map((c) => (
              <option key={c}>{c}</option>
            ))}
        </select>
      </label>
      <label className="text-sm">
        USD per 1 {currency} *
        <input
          className="w-full rounded border border-line p-2"
          type="number"
          step="any"
          min="0.000000000001"
          required
          readOnly={currency === "USD"}
          value={quote.rate}
          onChange={(e) => quote.setRate(e.target.value)}
        />
      </label>
      <p className="text-xs text-ink3 sm:col-span-2">
        {quote.loading
          ? "Loading reference rate… Manual entry is available."
          : `${quote.source} · quote date ${quote.rateDate} · transaction date ${date}`}
        {quote.error && <span role="alert"> · {quote.error}</span>}
      </p>
    </div>
  );
}
