import { createFileRoute } from "@tanstack/react-router";
import { useBook } from "@/components/book-context";
import { Badge, Kpi, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/payables")({
  head: () =>
    pageHead(
      "Contas a pagar · LedgerX",
      "Accounts payable multimoeda com aging por vencimento e impressão da posição do período.",
    ),
  component: Payables,
});

function Payables() {
  const { book } = useBook();
  const total = book.payables.reduce((a, p) => a + p.amount, 0);
  const late = book.payables.filter((p) => p.aging !== "Current").reduce((a, p) => a + p.amount, 0);

  return (
    <div className="space-y-3">
      <PageTitle
        title="Accounts Payable"
        description="Obrigações em aberto por fornecedor, com moeda de origem."
        actions={
          <button
            type="button"
            className="rounded-md bg-white/80 px-3 py-1.5 text-[12px] font-medium ring-1 ring-line"
          >
            Imprimir posição
          </button>
        }
      />
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Total em aberto" value={usd(total)} hint={`${book.payables.length} títulos`} />
        <Kpi label="Em atraso" value={usd(late)} tone="down" hint="Acima de 15 dias" />
        <Kpi
          label="A vencer em 7 dias"
          value={usd(book.payables[1]?.amount ?? 0)}
          hint="Atlas Logistics"
        />
      </section>
      <Panel title="Títulos a pagar" subtitle={book.client.name}>
        <Table>
          <thead>
            <tr className="border-b border-line/60">
              <Th>Fornecedor</Th>
              <Th>Referência</Th>
              <Th>Moeda</Th>
              <Th>Vencimento</Th>
              <Th>Aging</Th>
              <Th align="right">Valor (USD)</Th>
            </tr>
          </thead>
          <tbody>
            {book.payables.map((p) => (
              <tr key={p.ref} className="border-b border-line/50 last:border-0">
                <Td className="font-medium">{p.vendor}</Td>
                <Td className="font-mono text-[12px] text-ink2">{p.ref}</Td>
                <Td className="font-mono text-[12px]">{p.currency}</Td>
                <Td className="text-ink3">{p.due}</Td>
                <Td>
                  <Badge tone={p.aging === "Current" ? "neutral" : "down"}>{p.aging}</Badge>
                </Td>
                <Td align="right" className="font-medium">
                  {usd(p.amount)}
                </Td>
              </tr>
            ))}
            <tr className="bg-ink/[0.03] font-semibold">
              <Td>Total</Td>
              <Td>{""}</Td>
              <Td>{""}</Td>
              <Td>{""}</Td>
              <Td>{""}</Td>
              <Td align="right">{usd(total)}</Td>
            </tr>
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
