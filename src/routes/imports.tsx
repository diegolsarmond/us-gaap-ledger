import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanies } from "@/components/company-context";
import { Panel } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { importCatalog, parseImportRows, type ImportDomain } from "@/lib/bulk-import";
import { downloadImportTemplate, readImportWorkbook } from "@/lib/import-workbook";
import { importSpreadsheet, loadAccounting } from "@/lib/accounting";

export const Route = createFileRoute("/imports")({ component: ImportPage });
function ImportPage() {
  const { activeCompany } = useCompanies();
  const [domain, setDomain] = useState<ImportDomain>(activeCompany ? "customers" : "companies");
  const [destination, setDestination] = useState("");
  return (
    <CompanyImports
      key={activeCompany?.id ?? "no-company"}
      companyId={activeCompany?.id ?? ""}
      name={activeCompany?.name ?? "Nenhuma empresa selecionada"}
      domain={domain}
      onDomainChange={(value) => {
        setDomain(value);
        setDestination("");
      }}
      destination={destination}
      onDestinationChange={setDestination}
    />
  );
}
function CompanyImports({
  companyId,
  name,
  domain,
  onDomainChange,
  destination,
  onDestinationChange,
}: {
  companyId: string;
  name: string;
  domain: ImportDomain;
  onDomainChange: (value: ImportDomain) => void;
  destination: string;
  onDestinationChange: (value: string) => void;
}) {
  const { permissions, companies, selectCompany } = useCompanies();
  const client = useQueryClient();
  const query = useQuery({
    enabled: Boolean(companyId) && domain !== "companies",
    queryKey: ["accounting", companyId],
    queryFn: () => loadAccounting({ data: { companyId } }),
  });
  const [rows, setRows] = useState<Record<string, string | number | boolean | null>[]>([]);
  const [revision, setRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const destinationReady =
    domain === "companies" ||
    (Boolean(companyId) && (domain === "customers" || destination === companyId));
  const allowed =
    domain === "companies"
      ? permissions.manage_companies
      : domain === "fiscalPeriods"
        ? permissions.close_periods
        : permissions.write_accounting;
  async function read(file?: File) {
    setRows([]);
    setRevision(null);
    setMessage("");
    if (!file || !destinationReady || !allowed) return;
    setBusy(true);
    try {
      const records = await readImportWorkbook(file, domain);
      parseImportRows(domain, records);
      const fresh =
        domain === "companies" ? { data: { revision: 0 }, error: null } : await query.refetch();
      if (!fresh.data || fresh.error)
        throw new Error("Não foi possível atualizar os dados da empresa.");
      await importSpreadsheet({
        data: {
          ...(companyId ? { companyId } : {}),
          domain,
          rows: records,
          revision: fresh.data.revision,
          preview: true,
        },
      });
      setRows(records);
      setRevision(fresh.data.revision);
      setMessage(
        `${records.length} registros validados. Confira a prévia e confirme a importação.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao ler planilha.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (revision === null || busy || !destinationReady || !allowed) return;
    setBusy(true);
    try {
      await importSpreadsheet({
        data: { ...(companyId ? { companyId } : {}), domain, rows, revision, preview: false },
      });
      setRows([]);
      setRevision(null);
      setMessage(
        domain === "companies"
          ? `${rows.length} empresas importadas com sucesso.`
          : `${rows.length} registros importados com sucesso em ${name}.`,
      );
      if (domain === "companies") await client.invalidateQueries({ queryKey: ["companies"] });
      await Promise.all(
        ["accounting", "parameters", "cash-flow", "cash-flow-links"].map((key) =>
          client.invalidateQueries({ queryKey: [key, companyId] }),
        ),
      );
    } catch (e) {
      setRevision(null);
      setMessage(e instanceof Error ? e.message : "Falha ao importar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Importação em massa</h1>
        <p className="text-sm text-ink2">Modelos e importação de cadastros · {name}</p>
      </div>
      <Panel title="Como importar">
        <ol className="list-decimal space-y-2 p-4 pl-9 text-sm">
          <li>
            Escolha o cadastro. Para os demais cadastros, exceto Clientes e Empresas, selecione o
            cliente de destino (empresa).
          </li>
          <li>
            Baixe o modelo, substitua ou remova a linha de exemplo e preencha seus dados sem alterar
            os cabeçalhos.
          </li>
          <li>
            Envie a planilha para validar. Se houver erros, corrija as linhas indicadas e envie
            novamente.
          </li>
          <li>
            Confira o destino e a prévia, confirme a importação e aguarde a mensagem de sucesso.
          </li>
        </ol>
      </Panel>
      <Panel
        title="1. Escolher cadastro e destino"
        subtitle="Escolha o cadastro. Cada modelo contém uma aba de dados e instruções de preenchimento."
      >
        <div className="space-y-3 p-4">
          <label className="block text-sm">
            Cadastro
            <select
              disabled={busy}
              value={domain}
              onChange={(e) => {
                onDomainChange(e.target.value as ImportDomain);
                setRows([]);
                setRevision(null);
                setMessage("");
              }}
              className="ml-3 rounded border border-line bg-white p-2"
            >
              {Object.entries(importCatalog).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {domain !== "customers" && domain !== "companies" ? (
            <label className="block text-sm">
              Cliente de destino (empresa) <span className="text-down">*</span>
              <select
                aria-required="true"
                disabled={busy}
                value={destination === companyId ? destination : ""}
                onChange={(e) => {
                  const id = e.target.value;
                  onDestinationChange(id);
                  setRows([]);
                  setRevision(null);
                  setMessage("");
                  if (id) selectCompany(id);
                }}
                className="ml-3 rounded border border-line bg-white p-2"
              >
                <option value="">Selecione o cliente para importar</option>
                {companies
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.ein ? " · " + c.ein : ""}
                    </option>
                  ))}
              </select>
            </label>
          ) : domain === "companies" ? (
            <p className="text-sm">
              Importação de novas empresas: não exige cliente de destino. As empresas serão
              incluídas na lista de empresas acessíveis ao seu perfil.
            </p>
          ) : (
            <p className="text-sm">
              Cadastro de clientes: não exige selecionar um cliente de destino. Os registros serão
              criados na empresa ativa: <strong>{name}</strong>.
            </p>
          )}
          <p className="text-sm text-ink2">{importCatalog[domain].dependency}</p>
        </div>
      </Panel>
      <Panel
        title="2. Baixar e preencher o modelo"
        subtitle="A primeira linha de dados contém exemplos. Substitua ou remova essa linha antes de importar."
      >
        <div className="space-y-3 p-4">
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await downloadImportTemplate(domain);
              } catch {
                setMessage("Não foi possível gerar o modelo.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Baixar modelo .xlsx
          </Button>
        </div>
      </Panel>
      <Panel
        title="3. Enviar e validar a planilha"
        subtitle="Até 1.000 registros e 5 MB por arquivo. A importação inclui novos registros e rejeita duplicidades."
      >
        <div className="space-y-4 p-4">
          <p className="text-sm">
            O lote será validado integralmente. Se houver erro, nenhum registro será gravado.
          </p>
          {!destinationReady && (
            <p role="status">Selecione o cliente de destino no passo 1 para habilitar o envio.</p>
          )}
          {destinationReady && domain !== "companies" && (
            <p className="text-sm">
              Destino da importação: <strong>{name}</strong> · Cadastro:{" "}
              <strong>{importCatalog[domain].label}</strong>
            </p>
          )}
          {!allowed && <p role="status">Seu perfil não permite importar este cadastro.</p>}
          <label className="block text-sm">
            Planilha preenchida
            <input
              key={domain}
              type="file"
              accept=".xlsx"
              disabled={
                busy || !allowed || (domain !== "companies" && !query.data) || !destinationReady
              }
              className="mt-2 block"
              onChange={(e) => {
                void read(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <p role="status" aria-live="polite" className="text-sm whitespace-pre-wrap">
            {busy ? "Processando…" : message}
          </p>
          {rows.length > 0 && (
            <>
              <p className="text-sm">
                Prévia dos primeiros {Math.min(rows.length, 10)} de {rows.length} registros
              </p>
              <div className="overflow-auto max-h-80">
                <table className="text-xs">
                  <thead>
                    <tr>
                      {Object.keys(rows[0]!).map((key) => (
                        <th className="border border-line p-2" key={key}>
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((row, i) => (
                      <tr key={i}>
                        {Object.entries(row).map(([key, value]) => (
                          <td className="border border-line p-2" key={key}>
                            {String(value ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <h2 className="font-semibold">4. Conferir e confirmar a importação</h2>
          <p className="text-sm">
            Confira o cadastro, o destino e os registros da prévia.{" "}
            {domain === "companies"
              ? "Ao confirmar, as novas empresas serão cadastradas."
              : `Ao confirmar, todos os registros serão incluídos em ${name}.`}
          </p>
          <Button
            disabled={busy || !allowed || !destinationReady || revision === null}
            onClick={() => void save()}
          >
            Confirmar importação{rows.length ? ` de ${rows.length} registros` : ""}
          </Button>
        </div>
      </Panel>
      <Panel title="Mapa dos dados">
        <div className="p-4 space-y-3 text-sm">
          {Object.entries(importCatalog).map(([key, item]) => (
            <p key={key}>
              <strong>{item.label}:</strong> disponível · {item.dependency}.
            </p>
          ))}
          <p>
            <strong>Fluxos específicos:</strong> lançamentos contábeis, movimentações de caixa e
            extratos precisam de validações de partidas, conciliação e referências. Faturas, contas
            a pagar, estoque e projetos estão em módulos ainda indisponíveis. Usuários e perfis
            permanecem nos cadastros administrativos; anexos, auditoria, saldos e relatórios não são
            importados por este módulo.
          </p>
        </div>
      </Panel>
    </div>
  );
}
