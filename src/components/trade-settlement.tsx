import { useState } from "react";
import { useAccounting } from "@/lib/accounting-store";
import { normalizedFx, outstanding, settlement } from "@/lib/transaction-fx";
import { useTransactionQuote } from "@/lib/use-transaction-quote";
export function TradeSettlement({
  kind,
  documentId,
  onClose,
}: {
  kind: "AP" | "AR";
  documentId: string;
  onClose: () => void;
}) {
  const { bills, invoices, vendors, payBill, recordInvoicePayment } = useAccounting();
  const doc =
    kind === "AP"
      ? bills.find((b) => b.id === documentId)
      : invoices.find((i) => i.id === documentId);
  const fx = normalizedFx(doc || {}),
    open = doc ? outstanding(doc) : { native: 0, functional: 0 };
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(String(open.native));
  const [bankId, setBankId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const quote = useTransactionQuote(fx.transactionCurrency, date);
  if (!doc) return null;
  const bankAccounts =
    kind === "AP" && "vendorId" in doc
      ? vendors.find((v) => v.id === doc.vendorId)?.bankAccounts || []
      : [];
  let preview = "";
  try {
    const result = settlement(doc, kind, Number(amount), Number(quote.rate), date);
    preview = `Functional payment: USD ${result.functionalAmount.toFixed(2)} · Realized FX gain / (loss): USD ${result.realizedGain.toFixed(2)}`;
  } catch {
    /* Show field validation when submitted. */
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result =
        kind === "AP"
          ? await payBill(
              documentId,
              date,
              Number(quote.rate),
              Number(amount),
              bankId || undefined,
              { source: quote.source, date: quote.rateDate },
            )
          : await recordInvoicePayment(documentId, date, Number(quote.rate), Number(amount), {
              source: quote.source,
              date: quote.rateDate,
            });
      if (!result.success) throw new Error(result.error);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to settle.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Record payment"
        className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 className="font-semibold">
          {kind === "AP" ? "Pay bill" : "Receive payment"} · {documentId}
        </h2>
        <p className="text-sm">
          Outstanding: {fx.transactionCurrency} {open.native.toFixed(2)}
        </p>
        <form className="space-y-3" onSubmit={save}>
          <fieldset disabled={busy} className="space-y-3">
            <label className="block text-sm">
              Payment date
              <input
                className="block w-full rounded border border-line p-2"
                type="date"
                required
                min={doc.date}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Amount ({fx.transactionCurrency})
              <input
                className="block w-full rounded border border-line p-2"
                type="number"
                min="0.01"
                step="0.01"
                max={open.native}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              USD per {fx.transactionCurrency}
              <input
                className="block w-full rounded border border-line p-2"
                type="number"
                min="0.000000000001"
                step="any"
                required
                readOnly={fx.transactionCurrency === "USD"}
                value={quote.rate}
                onChange={(e) => quote.setRate(e.target.value)}
              />
            </label>
            <p className="text-xs text-ink3">
              {quote.source} · {quote.rateDate}
              {quote.error ? " · " + quote.error : ""}
            </p>
            {kind === "AP" && (
              <label className="block text-sm">
                Vendor bank account
                <select
                  className="block w-full rounded border border-line p-2"
                  value={bankId}
                  onChange={(e) => setBankId(e.target.value)}
                >
                  <option value="">Ledger payment only — no destination selected</option>
                  {bankAccounts
                    .filter((b) => b.currency === fx.transactionCurrency)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label} · {b.currency} · ending {b.accountNumber.slice(-4)}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <p className="text-sm">{preview}</p>
            <p className="text-xs text-ink3">
              Records the accounting settlement. No bank transfer is sent.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="rounded bg-brand px-4 py-2 text-white">
                {busy ? "Saving…" : "Record payment"}
              </button>
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="text-down">
              {error}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
