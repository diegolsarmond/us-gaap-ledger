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
    loading: query.isFetching && !!currency && currency !== "USD",
    error: query.isError && !overridden ? query.error.message : "",
  };
}
