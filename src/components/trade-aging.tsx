import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccounting } from "@/lib/accounting-store";
import { fetchTransactionRate, type ExchangeQuote } from "@/lib/transaction-rates";
import { normalizedFx, outstanding, money } from "@/lib/transaction-fx";
export function TradeAging({ kind }: { kind: "AP" | "AR" }) {
  const { bills, invoices, revalueOpenItems, userPersona } = useAccounting();
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [manual, setManual] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const all = [...bills, ...invoices];
  const codes = [
    ...new Set(
      all
        .filter((d) => outstanding(d, asOf).native > 0)
        .map((d) => normalizedFx(d).transactionCurrency),
    ),
  ]
    .filter((c) => c !== "USD")
    .sort();
  const key = codes.join(",");
  const query = useQuery({
    queryKey: ["aging-rates", key, asOf],
    queryFn: async () =>
      Object.fromEntries(
        await Promise.all(
          codes.map(async (c) => {
            try {
              return [c, await fetchTransactionRate(c, asOf)] as const;
            } catch {
              return [c, null] as const;
            }
          }),
        ),
      ),
    staleTime: 300000,
  });
  const quotes: Record<string, ExchangeQuote> = {};
  for (const code of codes) {
    const entered = manual[asOf + ":" + code];
    if (entered && Number(entered) > 0)
      quotes[code] = {
        rate: Number(entered),
        date: asOf,
        source: "Manual closing / reporting rate",
      };
    else if (query.data?.[code]) quotes[code] = query.data[code];
  }
  const docs = (kind === "AP" ? bills : invoices).filter((d) => outstanding(d, asOf).native > 0);
  async function revalue() {
    setBusy(true);
    setNotice("");
    try {
      const result = await revalueOpenItems(asOf, quotes);
      setNotice(
        result.success
          ? `Revalued ${result.count} documents. Reversals are dated the first day of the next month.`
          : result.error || "Unable to revalue.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Unable to revalue.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-lg border border-line bg-white p-4">
      <h2 className="font-semibold">
        {kind === "AP" ? "A/P" : "A/R"} Aging · original and functional currencies
      </h2>
      <label className="text-sm">
        As of{" "}
        <input
          className="rounded border border-line p-2"
          type="date"
          required
          value={asOf}
          onChange={(e) => setAsOf(e.target.value || new Date().toISOString().slice(0, 10))}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        {codes.map((code) => (
          <label key={code} className="text-xs">
            USD per {code}
            <input
              className="block w-36 rounded border border-line p-2"
              type="number"
              step="any"
              min="0.000000000001"
              placeholder={
                query.isPending
                  ? "Loading…"
                  : quotes[code]
                    ? String(quotes[code].rate)
                    : "Rate unavailable"
              }
              value={manual[asOf + ":" + code] || ""}
              onChange={(e) => setManual({ ...manual, [asOf + ":" + code]: e.target.value })}
            />
            <span>
              {quotes[code]
                ? quotes[code].source + " · " + quotes[code].date
                : "Enter a rate to value this currency."}
            </span>
          </label>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Document",
                "Contact",
                "Due date",
                "Aging",
                "Original balance",
                "Historical USD",
                "Updated USD",
              ].map((h) => (
                <th className="p-2" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => {
              const fx = normalizedFx(d),
                open = outstanding(d, asOf),
                age = Math.floor((Date.parse(asOf) - Date.parse(d.dueDate)) / 86400000),
                rate = fx.transactionCurrency === "USD" ? 1 : quotes[fx.transactionCurrency]?.rate;
              return (
                <tr key={d.id} className="border-t border-line">
                  <td className="p-2">{d.id}</td>
                  <td className="p-2">{"vendorName" in d ? d.vendorName : d.customerName}</td>
                  <td className="p-2">{d.dueDate}</td>
                  <td className="p-2">
                    {age <= 0
                      ? "Current"
                      : age <= 30
                        ? "1–30"
                        : age <= 60
                          ? "31–60"
                          : age <= 90
                            ? "61–90"
                            : "90+"}
                  </td>
                  <td className="p-2">
                    {fx.transactionCurrency} {open.native.toFixed(2)}
                  </td>
                  <td className="p-2">{open.functional.toFixed(2)}</td>
                  <td className="p-2">
                    {rate ? money(open.native * rate).toFixed(2) : "Rate unavailable"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!docs.length && <p className="p-2 text-sm text-ink3">No open documents at this date.</p>}
      </div>
      {userPersona.canClosePeriod && (
        <button
          type="button"
          disabled={busy || codes.some((c) => !quotes[c])}
          className="rounded border border-line px-3 py-2 text-sm disabled:opacity-50"
          onClick={() => void revalue()}
        >
          {busy ? "Revaluing…" : "Revalue A/P and A/R at month end"}
        </button>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
    </section>
  );
}
