import { createFileRoute } from "@tanstack/react-router";
import { useBook } from "@/components/book-context";
import { Kpi, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { acct, dash, pct, usd } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { period } from "@/lib/mock";

export const Route = createFileRoute("/dre")({
  head: () =>
    pageHead(
      "DRE · Statement of Operations · LedgerX",
      "Demonstração de resultado no padrão US GAAP com receita, CMV, despesas e variação cambial.",
    ),
  component: Dre,
});

function Dre() {
  const { book } = useBook();
  const t = book.dreTotals;

  return (
    <div className="space-y-3">
      <PageTitle
        title="DRE · Statement of Operations"
        description={`${period.label} · ${book.client.basis} basis · base ${period.base}`}
        actions={
          <button
            type="button"
            className="rounded-md bg-white/80 px-3 py-1.5 text-[12px] font-medium ring-1 ring-line"
          >
            Exportar PDF
          </button>
        }
      />
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Receita total" value={usd(t.revenue)} />
        <Kpi label="Despesas totais" value={usd(t.expenses)} tone="down" />
        <Kpi
          label="Resultado líquido"
          value={usd(t.netIncome)}
          hint={`${pct((t.netIncome / t.revenue) * 100)} margem`}
          tone="up"
        />
      </section>
      <Panel title="Demonstração de resultado" subtitle={book.client.name}>
        <Table>
          <thead>
            <tr className="border-b border-line/60">
              <Th>Line</Th>
              <Th align="right">Debit</Th>
              <Th align="right">Credit</Th>
            </tr>
          </thead>
          <tbody>
            {book.dre.map((l) => (
              <tr key={l.line} className="border-b border-line/50">
                <Td className={l.level === 1 ? "pl-5 font-medium" : "pl-8 text-ink2"}>{l.line}</Td>
                <Td align="right" className={l.debit ? "" : "text-ink3"}>
                  {dash(l.debit)}
                </Td>
                <Td align="right" className={l.credit ? "" : "text-ink3"}>
                  {dash(l.credit)}
                </Td>
              </tr>
            ))}
            <tr className="border-b border-line/50 font-semibold">
              <Td className="pl-5">Total Expenses</Td>
              <Td align="right">{usd(t.expenses)}</Td>
              <Td align="right" className="text-ink3">
                —
              </Td>
            </tr>
            <tr className="bg-ink/[0.03] font-semibold">
              <Td className="pl-5">Net Income</Td>
              <Td align="right" className="text-up">
                {acct(t.netIncome)}
              </Td>
              <Td align="right" className="text-ink3">
                —
              </Td>
            </tr>
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
