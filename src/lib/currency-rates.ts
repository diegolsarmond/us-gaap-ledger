import { useQuery } from "@tanstack/react-query";

export const currencyCodes = [
  "USD",
  "BRL",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "CHF",
  "AUD",
  "CNY",
  "MXN",
  "ARS",
  "CLP",
  "COP",
  "PEN",
  "UYU",
  "INR",
  "NZD",
  "ZAR",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "KRW",
  "SGD",
  "HKD",
  "TRY",
  "AED",
  "ILS",
];
export function currencyName(code: string) {
  return new Intl.DisplayNames(["pt-BR"], { type: "currency" }).of(code) ?? code;
}
export function currencySymbol(code: string) {
  return (
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? code
  );
}
export function useCurrencyRates(codes: string[]) {
  const key = [...new Set(codes.filter((code) => code !== "USD"))].sort().join(",");
  return useQuery({
    queryKey: ["live-currency-rates", key],
    queryFn: async () => {
      const entries = await Promise.all(
        key
          .split(",")
          .filter(Boolean)
          .map(async (code) => {
            // USD pairs are available for more currencies; invert to obtain USD per unit.
            const response = await fetch(`https://economia.awesomeapi.com.br/last/USD-${code}`, {
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) throw new Error(`Cotação de ${code} indisponível.`);
            const item = (await response.json())[`USD${code}`];
            const bid = Number(item?.bid);
            const timestamp = Number(item?.timestamp);
            if (!Number.isFinite(bid) || bid <= 0 || !Number.isFinite(timestamp) || timestamp <= 0)
              throw new Error(`Cotação de ${code} inválida.`);
            return [
              code,
              { rate: 1 / bid, date: new Date(timestamp * 1000).toISOString() },
            ] as const;
          }),
      );
      return Object.fromEntries(entries);
    },
    staleTime: 60000,
    refetchInterval: 120000,
    retry: 1,
  });
}
