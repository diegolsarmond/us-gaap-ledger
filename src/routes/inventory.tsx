import { createFileRoute } from "@tanstack/react-router";
import { useBook } from "@/components/book-context";
import { Kpi, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/inventory")({
  head: () =>
    pageHead(
      "Estoque e custo de mercadoria · LedgerX",
      "Controle de estoque por SKU com custo unitário, método de valoração e integração com o CMV.",
    ),
  component: Inventory,
});

function Inventory() {
  const { book } = useBook();
  const value = book.inventory.reduce((a, i) => a + i.value, 0);
  const units = book.inventory.reduce((a, i) => a + i.qty, 0);

  return (
    <div className="space-y-3">
      <PageTitle
        title="Inventory"
        description="Estoque que alimenta as invoices de produto e o Cost of Goods Sold."
      />
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Valor do estoque" value={usd(value)} hint="Conta 1300" />
        <Kpi
          label="Unidades"
          value={units.toLocaleString("en-US")}
          hint={`${book.inventory.length} SKUs`}
        />
        <Kpi
          label="CMV do mês"
          value={usd(book.dre[2]?.debit ?? 0)}
          hint="Conta 5000"
          tone="down"
        />
      </section>
      <Panel title="Itens em estoque" subtitle={book.client.name}>
        <Table>
          <thead>
            <tr className="border-b border-line/60">
              <Th>SKU</Th>
              <Th>Item</Th>
              <Th>Valoração</Th>
              <Th align="right">Qtd.</Th>
              <Th align="right">Custo unit.</Th>
              <Th align="right">Valor total</Th>
            </tr>
          </thead>
          <tbody>
            {book.inventory.map((i) => (
              <tr key={i.sku} className="border-b border-line/50 last:border-0">
                <Td className="font-mono font-medium">{i.sku}</Td>
                <Td className="text-ink2">{i.item}</Td>
                <Td className="text-ink2">{i.method}</Td>
                <Td align="right">{i.qty.toLocaleString("en-US")}</Td>
                <Td align="right">{usd(i.cost)}</Td>
                <Td align="right" className="font-medium">
                  {usd(i.value)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="p-4">
          <Note tone="brand">
            Cada venda de produto baixa o estoque e credita 1300, debitando 5000 · Cost of Goods
            Sold.
          </Note>
        </div>
      </Panel>
    </div>
  );
}
