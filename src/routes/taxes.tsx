import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useBook } from "@/components/book-context";
import { Badge, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/taxes")({
  head: () =>
    pageHead(
      "Impostos e comprovantes · LedgerX",
      "Apuração manual de sales tax por estado, imposto federal estimado e guarda dos comprovantes de pagamento.",
    ),
  component: Taxes,
});

function Taxes() {
  const { book } = useBook();
  const [base, setBase] = useState("52480.00");
  const [state, setState] = useState("4");
  const [federal, setFederal] = useState("3");
  const stateTax = (Number(base || 0) * Number(state || 0)) / 100;
  const fedTax = (Number(base || 0) * Number(federal || 0)) / 100;

  return (
    <div className="space-y-3">
      <PageTitle
        title="Tax Filing"
        description="Apuração informada manualmente — nenhuma integração governamental nesta etapa."
      />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Apurações e comprovantes" subtitle={book.client.name}>
          <Table>
            <thead>
              <tr className="border-b border-line/60">
                <Th>Jurisdição</Th>
                <Th>Período</Th>
                <Th align="right">Base</Th>
                <Th>Alíquota</Th>
                <Th align="right">A pagar</Th>
                <Th>Comprovante</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {book.taxes.map((t) => (
                <tr key={`${t.jurisdiction}-${t.period}`} className="border-b border-line/50 last:border-0">
                  <Td className="font-medium">{t.jurisdiction}</Td>
                  <Td className="text-ink3">{t.period}</Td>
                  <Td align="right">{usd(t.base)}</Td>
                  <Td className="text-ink2">{t.rate}</Td>
                  <Td align="right" className="font-medium">
                    {usd(t.due)}
                  </Td>
                  <Td className="font-mono text-[11px] text-ink2">{t.receipt}</Td>
                  <Td align="right">
                    <Badge tone={t.status === "Pago" ? "up" : "brand"}>{t.status}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="p-4">
            <Note tone="brand">
              O pagamento é feito no site do estado ou do governo federal; aqui você registra o
              valor e anexa o comprovante em PDF.
            </Note>
          </div>
        </Panel>

        <Panel title="Calculadora de sales tax" subtitle="Estado + federal, entrada manual">
          <div className="space-y-3 p-4">
            <label className="block">
              <span className="col-head">Base faturada</span>
              <input
                value={base}
                onChange={(e) => setBase(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-md bg-white/80 px-2.5 py-2 text-right font-mono text-[12px] tabular-nums ring-1 ring-line outline-none focus:ring-brand"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="col-head">Estado %</span>
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-md bg-white/80 px-2.5 py-2 text-right font-mono text-[12px] tabular-nums ring-1 ring-line outline-none focus:ring-brand"
                />
              </label>
              <label className="block">
                <span className="col-head">Municipal/condado %</span>
                <input
                  value={federal}
                  onChange={(e) => setFederal(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-md bg-white/80 px-2.5 py-2 text-right font-mono text-[12px] tabular-nums ring-1 ring-line outline-none focus:ring-brand"
                />
              </label>
            </div>
            <div className="space-y-1 border-t border-line/70 pt-3 text-[12px] tabular-nums">
              <div className="flex justify-between">
                <span className="text-ink3">Estado</span>
                <span>{usd(stateTax)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink3">Municipal/condado</span>
                <span>{usd(fedTax)}</span>
              </div>
              <div className="flex justify-between text-[13px] font-semibold">
                <span>Total a declarar</span>
                <span>{usd(stateTax + fedTax)}</span>
              </div>
            </div>
            <button
              type="button"
              className="w-full rounded-md bg-brand px-3 py-2 text-[13px] font-semibold text-primary-foreground"
            >
              Registrar apuração
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
