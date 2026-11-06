export type ExchangeQuote = { rate: number; date: string; source: string };
export async function fetchTransactionRate(currency: string, date: string): Promise<ExchangeQuote> {
  if (!/^[A-Z]{3}$/.test(currency) || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("Select a currency and a valid date.");
  if (currency === "USD") return { rate: 1, date, source: "Functional currency parity" };
  const response = await fetch(
    `https://api.frankfurter.dev/v2/providers/ecb/rate/${currency}/USD?date=${date}`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok) throw new Error("Reference quote unavailable. Enter the agreed rate manually.");
  const data = await response.json();
  if (
    data.base !== currency ||
    data.quote !== "USD" ||
    !Number.isFinite(data.rate) ||
    data.rate <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
    data.date > date
  )
    throw new Error("Invalid reference quote. Enter a manual rate.");
  return { rate: data.rate, date: data.date, source: "ECB via Frankfurter" };
}
