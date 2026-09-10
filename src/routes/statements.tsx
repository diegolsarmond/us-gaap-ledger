import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useBook } from "@/components/book-context";
import { Badge, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { acct, usd } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/statements")({
  head: () =>
    pageHead(
      "Extratos bancários e importação · LedgerX",
      "Upload de extratos em CSV, OFX e PDF, com classificação sugerida por conta contábil.",
    ),
  component: Statements,
});

function Statements() {
  const { book } = useBook();
  const [classified, setClassified] = useState<string[]>([]);

  const toggle = (memo: string) =>
    setClassified((c) => (c.includes(memo) ? c.filter((m) => m !== memo) : [...c, memo]));

  return (
    <div className="space-y-3">
      <PageTitle
        title="Extratos e importação"
        description="O cliente envia CSV, OFX ou PDF; a classificação contábil é feita internamente."
      />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Arquivos recebidos" subtitle={book.client.name}>
          <Table>
            <thead>
              <tr className="border-b border-line/60">
                <Th>Arquivo</Th>
                <Th>Conta</Th>
                <Th align="right">Linhas</Th>
                <Th>Enviado</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {book.statements.map((s) => (
                <tr key={s.file} className="border-b border-line/50 last:border-0">
                  <Td className="font-mono text-[12px] font-medium">{s.file}</Td>
                  <Td className="text-ink2">{s.account}</Td>
                  <Td align="right">{s.rows}</Td>
                  <Td className="text-ink3">{s.uploaded}</Td>
                  <Td align="right">
                    <Badge tone={s.status === "Conciliado" ? "up" : "brand"}>{s.status}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>

        <Panel title="Enviar extrato" subtitle="CSV · OFX · PDF">
          <div className="space-y-3 p-4">
            <div className="grid place-items-center rounded-lg border border-dashed border-line bg-white/50 px-4 py-8 text-center">
              <p className="text-[12px] font-medium">Arraste o arquivo aqui</p>
              <p className="mt-1 text-[11px] text-ink3">
                Extratos bancários e de cartão de crédito, até 20 MB
              </p>
              <button
                type="button"
                className="mt-3 rounded-md bg-brand px-3 py-1.5 text-[12px] font-semibold text-primary-foreground"
              >
                Selecionar arquivo
              </button>
            </div>
            <Note tone="brand">
              Integração direta com bancos por API fica para uma etapa futura; o PDF continua sendo
              guardado por exigência contábil.
            </Note>
          </div>
        </Panel>
      </div>

      <Panel
        title="Linhas a classificar"
        subtitle="Sugestão automática por histórico do extrato"
        aside={
          <span className="text-[11px] text-ink3">
            {classified.length} de {book.unclassified.length} confirmadas
          </span>
        }
      >
        <Table>
          <thead>
            <tr className="border-b border-line/60">
              <Th>Data</Th>
              <Th>Histórico do banco</Th>
              <Th align="right">Valor</Th>
              <Th>Conta sugerida</Th>
              <Th align="right">Ação</Th>
            </tr>
          </thead>
          <tbody>
            {book.unclassified.map((u) => {
              const done = classified.includes(u.memo);
              return (
                <tr key={u.memo} className="border-b border-line/50 last:border-0">
                  <Td className="text-ink3">{u.date}</Td>
                  <Td className="font-mono text-[12px]">{u.memo}</Td>
                  <Td align="right" className={u.amount < 0 ? "text-down" : "text-up"}>
                    {u.amount < 0 ? acct(u.amount) : usd(u.amount)}
                  </Td>
                  <Td className="text-ink2">{u.suggestion}</Td>
                  <Td align="right">
                    <button
                      type="button"
                      onClick={() => toggle(u.memo)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-medium ring-1 transition-colors ${
                        done
                          ? "bg-up/10 text-up ring-up/20"
                          : "bg-white/80 text-ink2 ring-line hover:text-ink"
                      }`}
                    >
                      {done ? "Classificada" : "Confirmar"}
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
