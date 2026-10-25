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
      "Moedas da empresa · LedgerX",
      "Selecione as moedas utilizadas pela empresa e consulte as cotações automaticamente.",
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
      title: "Remover moeda?",
      message: `Deseja remover a moeda ${code} — ${currencyName(code)} da empresa ${activeCompany.name}?`,
      tone: "error",
      confirmText: "Remover",
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
        title="Moedas da empresa"
        description={`Selecione uma ou mais moedas utilizadas por ${activeCompany.name}. Símbolos e cotações são automáticos.`}
      />
      <Panel title="Vincular moeda">
        <form onSubmit={add} className="flex flex-wrap items-end gap-3 p-4">
          <label className="space-y-2 text-sm">
            Moeda
            <select
              aria-label="Moeda"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="block rounded border border-line bg-white p-2"
            >
              <option value="">Selecione uma moeda</option>
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
            Adicionar moeda
          </button>
        </form>
      </Panel>
      <Panel title={`Moedas utilizadas (${currencies.length})`}>
        <Table>
          <thead>
            <tr>
              <Th>Moeda</Th>
              <Th>Símbolo automático</Th>
              <Th>Cotação em USD</Th>
              <Th>Data da cotação</Th>
              <Th>Ações</Th>
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
                      ? "1,000000"
                      : quote
                        ? quote.rate.toLocaleString("pt-BR", {
                            minimumFractionDigits: 6,
                            maximumFractionDigits: 6,
                          })
                        : rates.isPending
                          ? "Consultando…"
                          : "Indisponível"}
                  </Td>
                  <Td>
                    {currency.code === "USD"
                      ? "Moeda de referência"
                      : quote
                        ? new Date(quote.date).toLocaleString("pt-BR")
                        : "—"}
                  </Td>
                  <Td>
                    <button
                      disabled={saving}
                      onClick={() => void remove(currency.code)}
                      className="text-down disabled:opacity-50"
                    >
                      Remover vínculo
                    </button>
                  </Td>
                </tr>
              );
            })}
            {!currencies.length && (
              <tr>
                <Td colSpan={5}>Selecione as moedas que esta empresa utiliza.</Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Panel>
      <div className="space-y-2 text-sm text-ink3">
        <p>
          Fonte: AwesomeAPI. Consulta automática a cada 2 minutos. A data exibida corresponde à
          última cotação disponível, inclusive em fins de semana e feriados. Símbolos e taxas não
          são armazenados no banco.
        </p>
        {rates.isError && (
          <p role="alert">Não foi possível consultar as cotações. Tente novamente.</p>
        )}
        <button
          disabled={rates.isFetching}
          onClick={() => void rates.refetch()}
          className="rounded border border-line px-3 py-2 disabled:opacity-50"
        >
          {rates.isFetching ? "Consultando…" : "Atualizar cotações"}
        </button>
      </div>
    </div>
  );
}
