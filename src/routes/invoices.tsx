import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useBook } from "@/components/book-context";
import { Badge, Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/invoices")({
  head: () =>
    pageHead(
      "Invoices de serviço e produto · LedgerX",
      "Emissão de invoices com sales tax informado manualmente, cliente tax-exempt e baixa contábil automática.",
    ),
  component: Invoices;
});

function Invoices() {
  const { book } = useBook();
  const [amount, setAmount] = useState("8400.00");
  const [rate, setRate] = useState("8");
  const [exempt, setExempt] = useState(false);
  const base = Number(amount || 0);
  const tax = exempt ? 0 : (base * Number(rate || 0)) / 100;

  const open = book.invoices.filter((i) => i.status === "Open").reduce((a, i) => a + i.amount, 0);
  const overdue = book.invoices
    .filter((i) => i.status === "Overdue")
    .reduce((a, i) => a + i.amount, 0);
  const paid = book.invoices.filter((i) => i.status === "Paid").reduce((a, i) => a + i.amount, 0);

  return (
    <div className="space-y-3">
      <PageTitle
        title="Invoices"
        description="Faturas de serviço e produto. O imposto é informado manualmente por estado."
      />
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Em aberto" value={usd(open)} hint="Vencimento futuro" />
        <Kpi label="Vencidas" value={usd(overdue)} hint="Cobrança pendente" tone="down" />
        <Kpi label="Recebidas no mês" value={usd(paid)} hint="Baixa contábil postada" tone="up" />
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Faturas emitidas" subtitle="Dec 2026">
          <Table>
            <thead>
              <tr className="border-b border-line/60">
                <Th>Invoice</Th>
                <Th>Client</Th>
                <Th>Tipo</Th>
                <Th>Sales Tax</Th>
                <Th>Vencimento</Th>
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
                  <Td className="text-ink3">{i.due}</Td>
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

        <Panel title="Nova invoice" subtitle="Imposto manual por estado">
          <div className="space-y-3 p-4">
            <label className="block">
              <span className="col-head">Valor do serviço/produto</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-md bg-white/80 px-2.5 py-2 text-right font-mono text-[12px] tabular-nums ring-1 ring-line outline-none focus:ring-brand"
              />
            </label>
            <label className="block">
              <span className="col-head">Sales tax (%)</span>
              <input
                value={rate}
                disabled={exempt}
                onChange={(e) => setRate(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-md bg-white/80 px-2.5 py-2 text-right font-mono text-[12px] tabular-nums ring-1 ring-line outline-none focus:ring-brand disabled:opacity-40"
              />
            </label>
            <label className="flex items-center gap-2 text-[12px] text-ink2">
              <input
                type="checkbox"
                checked={exempt}
                onChange={(e) => setExempt(e.target.checked)}
                className="size-3.5 accent-[oklch(0.545_0.19_258)]"
              />
              Cliente tax-exempt
            </label>
            <div className="space-y-1 border-t border-line/70 pt-3 text-[12px] tabular-nums">
              <div className="flex justify-between">
                <span className="text-ink3">Subtotal</span>
                <span>{usd(base)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink3">Sales tax</span>
                <span>{usd(tax)}</span>
              </div>
              <div className="flex justify-between text-[13px] font-semibold">
                <span>Total</span>
                <span>{usd(base + tax)}</span>
              </div>
            </div>
            <Note tone="brand">
              Ao emitir, o sistema debita Accounts Receivable e credita receita + Sales Tax Payable.
            </Note>
            <button
              type="button"
              className="w-full rounded-md bg-brand px-3 py-2 text-[13px] font-semibold text-primary-foreground"
            >
              Emitir invoice
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
