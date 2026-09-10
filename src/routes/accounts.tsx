import { createFileRoute } from "@tanstack/react-router";
import { useBook } from "@/components/book-context";
import { Badge, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { dash } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/accounts")({
  head: () =>
    pageHead(
      "Plano de contas · LedgerX",
      "Chart of accounts US GAAP com ativos, passivos, patrimônio, receitas e despesas.",
    ),
  component: Accounts,
});

function Accounts() {
  const { book } = useBook();
  return (
    <div>
      <PageTitle
        title="Plano de contas"
        description="Chart of accounts do cliente ativo, com conta dedicada de variação cambial."
      />
      <Panel title="Chart of Accounts" subtitle={book.client.name}>
        <Table>
          <thead>
            <tr className="border-b border-line/60">
              <Th>Código</Th>
              <Th>Conta</Th>
              <Th>Tipo</Th>
              <Th align="right">Débito</Th>
              <Th align="right">Crédito</Th>
            </tr>
          </thead>
          <tbody>
            {book.accounts.map((a) => (
              <tr key={a.code} className="border-b border-line/50 last:border-0">
                <Td className="font-mono font-medium">{a.code}</Td>
                <Td className="text-ink2">{a.name}</Td>
                <Td>
                  <Badge tone={a.code === "6300" ? "brand" : "neutral"}>{a.type}</Badge>
                </Td>
                <Td align="right" className={a.debit ? "" : "text-ink3"}>
                  {dash(a.debit)}
                </Td>
                <Td align="right" className={a.credit ? "" : "text-ink3"}>
                  {dash(a.credit)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
