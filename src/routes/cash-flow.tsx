import { createFileRoute } from "@tanstack/react-router";
import { useBook } from "@/components/book-context";
import { Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { acct, usd } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { period } from "@/lib/mock";

export const Route = createFileRoute("/cash-flow")({
  head: () =>
    pageHead(
      "Fluxo de caixa · LedgerX",
      "Fluxo de caixa do período com entradas, saídas, variação cambial realizada e saldo final.",
    ),
  component: CashFlow,
});

function CashFlow() {
  const { book } = useBook();

  return (
    <div className="space-y-3">
      <PageTitle
        title="Cash Flow"
        description={`Movimentação de caixa · ${period.label}`}
        actions={
          <button
            type="button"
            className="rounded-md bg-white/80 px-3 py-1.5 text-[12px] font-medium ring-1 ring-line"
          >
            Exportar PDF
          </button>
        }
      />
      <Panel title="Fluxo de caixa" subtitle={book.client.name}>
        <Table>
          <thead>
            <tr className="border-b border-line/60">
              <Th>Movimento</Th>
              <Th align="right">Valor</Th>
            </tr>
          </thead>
          <tbody>
            {book.cashFlow.map((c) => (
              <tr
                key={c.line}
                className={`border-b border-line/50 last:border-0 ${
                  c.kind === "closing" ? "bg-ink/[0.03] font-semibold" : ""
                }`}
              >
                <Td
                  className={
                    c.kind === "in" || c.kind === "out" ? "pl-8 text-ink2" : "pl-5 font-medium"
                  }
                >
                  {c.line}
                </Td>
                <Td
                  align="right"
                  className={c.amount < 0 ? "text-down" : c.kind === "in" ? "text-up" : ""}
                >
                  {c.amount < 0 ? acct(c.amount) : usd(c.amount)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="p-4">
          <Note tone="brand">
            A variação cambial realizada é lançada na conta {book.fx.account}, mantendo o saldo
            bancário conciliado.
          </Note>
        </div>
      </Panel>
    </div>
  );
}
