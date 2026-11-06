import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchTransactionRate } from "@/lib/transaction-rates";
export function useTransactionQuote(currency: string, date: string) {
  const key = currency + ":" + date;
  const [manual, setManual] = useState<{ key: string; value: string } | null>(null);
  const query = useQuery({
    queryKey: ["transaction-rate", currency, date],
    queryFn: () => fetchTransactionRate(currency, date),
    enabled: !!currency && !!date,
    staleTime: 300000,
    retry: 1,
  });
  const overridden = manual?.key === key && currency !== "USD";
  return {
    rate:
      currency === "USD"
        ? "1"
        : overridden
          ? manual.value
          : query.data
            ? String(query.data.rate)
            : "",
    source: overridden ? "Manual / contractual override" : query.data?.source || "Manual",
    rateDate: overridden ? date : query.data?.date || date,
    setRate: (value: string) => setManual({ key, value }),
    loading: query.isPending && currency !== "USD",
    error: query.isError && !overridden ? query.error.message : "",
  };
}
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
          {[...new Set(["USD", "EUR", "GBP", "MXN", "BRL", "CAD", "JPY", currency])].map((c) => (
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
