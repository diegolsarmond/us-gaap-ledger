import { useModal } from "@/components/modal-provider";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting } from "@/lib/parameters-context";
import {
  currencyCodes,
  currencyName,
  currencySymbol,
  useCurrencyRates,
} from "@/lib/currency-rates";
import { PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/parameters/currencies")({
  head: () =>
    pageHead(
      "Company currencies · LedgerX",
      "Select the currencies used by the company and view exchange rates automatically.",
    ),
  component: CurrenciesPage,
});
function CurrenciesPage() {
  const { activeCompany, currencies, addCurrency, deleteCurrency } = useAccounting();
  const modal = useModal();
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const rates = useCurrencyRates(currencies.map((currency) => currency.code));
  const available = currencyCodes.filter(
    (value) => !currencies.some((currency) => currency.code === value),
  );
  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!code || saving) return;
    setSaving(true);
    try {
      await addCurrency({
        code,
        name: currencyName(code),
        status: "Active",
        isBaseCurrency: code === "USD",
        scope: "companies",
        companyIds: [activeCompany.id],
      });
      setCode("");
    } catch {
      /* Provider displays persistence errors. */
    } finally {
      setSaving(false);
    }
  }
  async function remove(code: string) {
    const confirmed = await modal.showConfirm({
      title: "Remove currency?",
      message: `Remove currency ${code} — ${currencyName(code)} from company ${activeCompany.name}?`,
      tone: "error",
      confirmText: "Remove",
      cancelText: "Cancel",
    });
    if (!confirmed) return;
    setSaving(true);
    try {
      await deleteCurrency(code);
    } catch {
      /* Provider displays persistence errors. */
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageTitle
        title="Company currencies"
        description={`Select one or more currencies used by ${activeCompany.name}. Symbols and exchange rates are automatic.`}
      />
      <Panel title="Add currency">
        <form onSubmit={add} className="flex flex-wrap items-end gap-3 p-4">
          <label className="space-y-2 text-sm">
            Currency
            <select
              aria-label="Currency"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="block rounded border border-line bg-white p-2"
            >
              <option value="">Select a currency</option>
              {available.map((value) => (
                <option key={value} value={value}>
                  {value} — {currencyName(value)}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!code || saving}
            className="rounded bg-ink px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Add currency
          </button>
        </form>
      </Panel>
      <Panel title={`Currencies in use (${currencies.length})`}>
        <Table>
          <thead>
            <tr>
              <Th>Currency</Th>
              <Th>Automatic symbol</Th>
              <Th>Exchange rate in USD</Th>
              <Th>Exchange rate date</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {currencies.map((currency) => {
              const quote = rates.isError ? undefined : rates.data?.[currency.code];
              return (
                <tr key={currency.code}>
                  <Td>
                    {currency.code} — {currencyName(currency.code)}
                  </Td>
                  <Td>{currencySymbol(currency.code)}</Td>
                  <Td>
                    {currency.code === "USD"
                      ? "1.000000"
                      : quote
                        ? quote.rate.toLocaleString("en-US", {
                            minimumFractionDigits: 6,
                            maximumFractionDigits: 6,
                          })
                        : rates.isPending
                          ? "Loading…"
                          : "Unavailable"}
                  </Td>
                  <Td>
                    {currency.code === "USD"
                      ? "Reference currency"
                      : quote
                        ? new Date(quote.date).toLocaleString("en-US")
                        : "—"}
                  </Td>
                  <Td>
                    <button
                      disabled={saving}
                      onClick={() => void remove(currency.code)}
                      className="text-down disabled:opacity-50"
                    >
                      Remove currency
                    </button>
                  </Td>
                </tr>
              );
            })}
            {!currencies.length && (
              <tr>
                <Td colSpan={5}>Select the currencies used by this company.</Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Panel>
      <div className="space-y-2 text-sm text-ink3">
        <p>
          Source: AwesomeAPI. Rates refresh automatically every 2 minutes. The date shown is the
          latest available quote, including weekends and holidays. Symbols and rates are not stored
          in the database.
        </p>
        {rates.isError && <p role="alert">Unable to load exchange rates. Please try again.</p>}
        <button
          disabled={rates.isFetching}
          onClick={() => void rates.refetch()}
          className="rounded border border-line px-3 py-2 disabled:opacity-50"
        >
          {rates.isFetching ? "Loading…" : "Refresh exchange rates"}
        </button>
      </div>
    </div>
  );
}
