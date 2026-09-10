import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useBook } from "@/components/book-context";
import { Badge, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { acct, dash, usd } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/journals")({
  head: () =>
    pageHead(
      "Lançamentos contábeis · LedgerX",
      "Lançamento casado débito e crédito com validação de balanceamento e diário do período.",
    ),
  component: Journals,
});

function Journals() {
  const { book } = useBook();
  const [debit, setDebit] = useState("1000 · Cash — Operating");
  const [credit, setCredit] = useState("4000 · Service Revenue");
  const [debitValue, setDebitValue] = useState("12480.00");
  const [creditValue, setCreditValue] = useState("12480.00");

  const delta = useMemo(
    () => Number(debitValue || 0) - Number(creditValue || 0),
    [debitValue, creditValue],
  );
  const balanced = Math.abs(delta) < 0.005;
  const accountOptions = book.accounts.map((a) => `${a.code} · ${a.name}`);

  return (
    <div>
      <PageTitle
        title="Lançamentos"
        description="Lançamento casado no padrão US GAAP: um débito, um crédito, saldo zero."
      />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Diário do período" subtitle="Dec 2026">
          <Table>
            <thead>
              <tr className="border-b border-line/60">
                <Th>Entry</Th>
                <Th>Data</Th>
                <Th>Histórico</Th>
                <Th>Moeda</Th>
                <Th align="right">Valor</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {book.journals.map((j) => (
                <tr key={j.id} className="border-b border-line/50 last:border-0">
                  <Td className="font-mono font-medium">{j.id}</Td>
                  <Td className="text-ink3">{j.date}</Td>
                  <Td className="text-ink2">{j.memo}</Td>
                  <Td className="font-mono text-[12px]">{j.currency}</Td>
                  <Td align="right" className="font-medium">
                    {usd(j.amount)}
                  </Td>
                  <Td align="right">
                    <Badge
                      tone={j.status === "Posted" ? "up" : j.status === "Auto" ? "brand" : "neutral"}
                    >
                      {j.status}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>

        <Panel
          title="Novo lançamento"
          subtitle="Débito e crédito casados"
          aside={
            <Badge tone={balanced ? "up" : "down"}>
              {balanced ? "Balanced · Δ $0.00" : `Δ ${acct(delta)}`}
            </Badge>
          }
        >
          <div className="space-y-3 p-4">
            <label className="block">
              <span className="col-head">Débito</span>
              <select
                value={debit}
                onChange={(e) => setDebit(e.target.value)}
                className="mt-1 w-full rounded-md bg-white/80 px-2.5 py-2 text-[12px] ring-1 ring-line outline-none focus:ring-brand"
              >
                {accountOptions.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <input
                value={debitValue}
                onChange={(e) => setDebitValue(e.target.value)}
                inputMode="decimal"
                className="mt-1.5 w-full rounded-md bg-white/80 px-2.5 py-2 text-right font-mono text-[12px] tabular-nums ring-1 ring-line outline-none focus:ring-brand"
              />
            </label>
            <label className="block">
              <span className="col-head">Crédito</span>
              <select
                value={credit}
                onChange={(e) => setCredit(e.target.value)}
                className="mt-1 w-full rounded-md bg-white/80 px-2.5 py-2 text-[12px] ring-1 ring-line outline-none focus:ring-brand"
              >
                {accountOptions.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <input
                value={creditValue}
                onChange={(e) => setCreditValue(e.target.value)}
                inputMode="decimal"
                className="mt-1.5 w-full rounded-md bg-white/80 px-2.5 py-2 text-right font-mono text-[12px] tabular-nums ring-1 ring-line outline-none focus:ring-brand"
              />
            </label>

            <div className="border-t border-line/70 pt-3">
              <div className="flex items-center justify-between text-[12px] tabular-nums">
                <span className="text-ink3">Total débito</span>
                <span className="font-medium">{dash(Number(debitValue || 0))}</span>
              </div>
              <div className="flex items-center justify-between text-[12px] tabular-nums">
                <span className="text-ink3">Total crédito</span>
                <span className="font-medium">{dash(Number(creditValue || 0))}</span>
              </div>
            </div>

            {balanced ? (
              <Note>Pronto para postar — débitos iguais aos créditos.</Note>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-down/[0.06] px-3 py-2 text-[12px] text-down ring-1 ring-down/15">
                <span className="size-1.5 rounded-full bg-down" />
                Lançamento não fecha: diferença de {acct(delta)}.
              </div>
            )}

            <button
              type="button"
              disabled={!balanced}
              className="w-full rounded-md bg-brand px-3 py-2 text-[13px] font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
            >
              Postar lançamento
            </button>
            <p className="text-[11px] text-ink3">
              Demonstração: nada é gravado ainda, os dados são fictícios.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
