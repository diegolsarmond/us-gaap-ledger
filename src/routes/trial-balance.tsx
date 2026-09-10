import { createFileRoute } from "@tanstack/react-router";
import { useBook } from "@/components/book-context";
import { Badge, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { dash, usd } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { period } from "@/lib/mock";

export const Route = createFileRoute("/trial-balance")({
  head: () =>
    pageHead(
      "Balancete · Trial Balance · LedgerX",
      "Balancete de verificação com totais de débito e crédito e prova de fechamento em zero.",
    ),
  component: TrialBalance,
});

function TrialBalance() {
  const { book } = useBook();
  const debits = book.accounts.reduce((a, x) => a + x.debit, 0);
  const credits = book.accounts.reduce((a, x) => a + x.credit, 0);
  const delta = Math.round((debits - credits) * 100) / 100;

  return (
    <div>
      <PageTitle
        title="Trial Balance"
        description={`Balancete de verificação · ${period.label} · ${book.client.basis} basis`}
        actions={
          <button
            type="button"
            className="rounded-md bg-white/80 px-3 py-1.5 text-[12px] font-medium ring-1 ring-line"
          >
            Exportar PDF
          </button>
        }
      />
      <Panel
        title="Balancete"
        subtitle={book.client.name}
        aside={
          <Badge tone={delta === 0 ? "up" : "down"}>
            {delta === 0 ? "Fecha · Δ $0.00" : `Δ ${usd(delta)}`}
          </Badge>
        }
      >
        <Table>
          <thead>
            <tr className="border-b border-line/60">
              <Th>Conta</Th>
              <Th>Descrição</Th>
              <Th>Tipo</Th>
              <Th align="right">Débito</Th>
              <Th align="right">Crédito</Th>
            </tr>
          </thead>
          <tbody>
            {book.accounts.map((a) => (
              <tr key={a.code} className="border-b border-line/50">
                <Td className="font-mono font-medium">{a.code}</Td>
                <Td className="text-ink2">{a.name}</Td>
                <Td className="text-ink3">{a.type}</Td>
                <Td align="right" className={a.debit ? "" : "text-ink3"}>
                  {dash(a.debit)}
                </Td>
                <Td align="right" className={a.credit ? "" : "text-ink3"}>
                  {dash(a.credit)}
                </Td>
              </tr>
            ))}
            <tr className="bg-ink/[0.03] font-semibold">
              <Td>Totais</Td>
              <Td>{""}</Td>
              <Td>{""}</Td>
              <Td align="right">{usd(debits)}</Td>
              <Td align="right">{usd(credits)}</Td>
            </tr>
          </tbody>
        </Table>
        <div className="p-4">
          <Note>Débitos e créditos conferem — balancete pronto para fechamento do período.</Note>
        </div>
      </Panel>
    </div>
  );
}
