import { createFileRoute } from "@tanstack/react-router";
import { useBook } from "@/components/book-context";
import { Badge, Kpi, Note, Panel, Table, Td, Th } from "@/components/ui-kit";
import { acct, dash, pct, usd } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { period } from "@/lib/mock";

export const Route = createFileRoute("/")({
  head: () =>
    pageHead(
      "Dashboard financeiro · LedgerX",
      "Caixa, receita, despesa e resultado do período, com lançamento casado e variação cambial automática.",
    ),
  component: Dashboard,
});

function Dashboard() {
  const { book } = useBook();
  const k = book.kpis;
  const je = book.journalEntry;
  const debits = je.lines.reduce((a, l) => a + l.debit, 0);
  const credits = je.lines.reduce((a, l) => a + l.credit, 0);
  const delta = debits - credits;

  return (
    <div className="space-y-3">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Cash on Hand"
          value={usd(k.cash)}
          hint={`▲ ${usd(k.cashDelta)} vs Nov`}
          tone="up"
        />
        <Kpi
          label="Revenue"
          value={usd(k.revenue)}
          hint={`▲ ${pct(k.revenueDelta)} MoM`}
          tone="up"
        />
        <Kpi
          label="Expenses"
          value={usd(k.expenses)}
          hint={`▲ ${pct(k.expensesDelta)} MoM`}
          tone="down"
        />
        <Kpi label="Net Income" value={usd(k.netIncome)} hint={`${pct(k.margin)} margin`} />
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Journal Entry"
          subtitle={`${je.id} · ${je.date}`}
          aside={
            <Badge tone={delta === 0 ? "up" : "down"}>
              {delta === 0 ? "Balanced · Δ $0.00" : `Δ ${acct(delta)}`}
            </Badge>
          }
        >
          <div className="p-4">
            <Table>
              <thead>
                <tr className="border-b border-line/70">
                  <Th>Date</Th>
                  <Th>Account</Th>
                  <Th align="right">Debit</Th>
                  <Th align="right">Credit</Th>
                </tr>
              </thead>
              <tbody>
                {je.lines.map((l, i) => (
                  <tr key={i}>
                    <Td className="text-ink3">{l.date}</Td>
                    <Td>{l.account}</Td>
                    <Td align="right" className={l.debit ? "font-medium" : "text-ink3"}>
                      {dash(l.debit)}
                    </Td>
                    <Td align="right" className={l.credit ? "font-medium" : "text-ink3"}>
                      {dash(l.credit)}
                    </Td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line font-semibold">
                  <Td className="col-head" align="left">
                    Totals
                  </Td>
                  <Td>{je.memo}</Td>
                  <Td align="right">{usd(debits)}</Td>
                  <Td align="right">{usd(credits)}</Td>
                </tr>
              </tbody>
            </Table>
            <div className="mt-3">
              <Note>Lançamento casado — débitos iguais aos créditos. Pronto para postar.</Note>
            </div>
          </div>
        </Panel>

        <Panel title="FX Variance" aside={<Badge>Auto</Badge>}>
          <div className="p-4">
            <p className="text-[11px] text-ink3">Postado automaticamente em {book.fx.account}</p>
            <div className="mt-3 flex flex-col gap-1.5 text-[12px] tabular-nums">
              {book.fx.lines.map((l) => (
                <div key={l.currency} className="flex items-center justify-between">
                  <span className="text-ink2">
                    {l.currency} · {l.txns} txns
                    <span className="ml-2 font-mono text-[10px] text-ink3">{l.rate}</span>
                  </span>
                  <span className={`font-medium ${l.amount >= 0 ? "text-up" : "text-down"}`}>
                    {acct(l.amount)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-line/70 pt-3 text-[13px] font-semibold tabular-nums">
              <span className="text-ink2">Net variance</span>
              <span className={book.fx.net >= 0 ? "text-up" : "text-down"}>
                {acct(book.fx.net)}
              </span>
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Invoices"
        subtitle={`${period.label} · sales tax informado manualmente`}
        aside={<span className="text-[11px] text-ink3">{book.invoices.length} de 28</span>}
      >
        <Table>
          <thead>
            <tr className="border-b border-line/60">
              <Th>Invoice</Th>
              <Th>Client</Th>
              <Th>Tipo</Th>
              <Th>Sales Tax</Th>
              <Th align="right">Amount</Th>
              <Th align="right">Status</Th>
            </tr>
          </thead>
          <tbody>
            {book.invoices.map((i) => (
              <tr key={i.id} className="border-b border-line/50 last:border-0">
                <Td className="font-mono font-medium">{i.id}</Td>
                <Td className="text-ink2">{i.client}</Td>
                <Td className="text-ink2">{i.kind}</Td>
                <Td>{i.tax}</Td>
                <Td align="right" className="font-medium">
                  {usd(i.amount)}
                </Td>
                <Td align="right">
                  <Badge
                    tone={
                      i.status === "Open" ? "brand" : i.status === "Overdue" ? "down" : "neutral"
                    }
                  >
                    {i.status}
                  </Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <Panel
        title="Statement of Operations · DRE"
        subtitle={`${period.label} · ${book.client.basis} basis`}
      >
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
              <Td align="right">{usd(book.dreTotals.expenses)}</Td>
              <Td align="right" className="text-ink3">
                —
              </Td>
            </tr>
            <tr className="bg-ink/[0.03] font-semibold">
              <Td className="pl-5">Net Income</Td>
              <Td align="right" className="text-up">
                {usd(book.dreTotals.netIncome)}
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
