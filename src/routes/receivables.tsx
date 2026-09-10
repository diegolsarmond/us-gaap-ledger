import { createFileRoute } from "@tanstack/react-router";
import { useBook } from "@/components/book-context";
import { Badge, Kpi, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/receivables")({
  head: () =>
    pageHead(
      "Contas a receber · LedgerX",
      "Accounts receivable com aging de 30, 60 e 60+ dias e total em aberto por cliente.",
    ),
  component: Receivables,
});

function Receivables() {
  const { book } = useBook();
  const total = book.receivables.reduce((a, r) => a + r.amount, 0);
  const late = book.receivables
    .filter((r) => r.aging !== "Current")
    .reduce((a, r) => a + r.amount, 0);

  return (
    <div className="space-y-3">
      <PageTitle
        title="Accounts Receivable"
        description="Faturas em aberto por cliente e faixa de atraso."
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
        <Kpi label="Total a receber" value={usd(total)} hint={`${book.receivables.length} títulos`} />
        <Kpi label="Em atraso" value={usd(late)} tone="down" hint="Acima de 15 dias" />
        <Kpi label="Maior exposição" value={usd(book.receivables[0].amount)} hint="Meridian Labs Inc." />
      </section>
      <Panel title="Títulos a receber" subtitle={book.client.name}>
        <Table>
          <thead>
            <tr className="border-b border-line/60">
              <Th>Cliente</Th>
              <Th>Invoice</Th>
              <Th>Vencimento</Th>
              <Th>Aging</Th>
              <Th align="right">Valor</Th>
            </tr>
          </thead>
          <tbody>
            {book.receivables.map((r) => (
              <tr key={r.ref} className="border-b border-line/50 last:border-0">
                <Td className="font-medium">{r.client}</Td>
                <Td className="font-mono text-[12px] text-ink2">{r.ref}</Td>
                <Td className="text-ink3">{r.due}</Td>
                <Td>
                  <Badge tone={r.aging === "Current" ? "neutral" : "down"}>{r.aging}</Badge>
                </Td>
                <Td align="right" className="font-medium">
                  {usd(r.amount)}
                </Td>
              </tr>
            ))}
            <tr className="bg-ink/[0.03] font-semibold">
              <Td>Total</Td>
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
