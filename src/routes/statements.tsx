import { parseStatementCsv } from "@/lib/statement-csv";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting } from "@/lib/accounting-store";
import { Badge, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, formatDate } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";

export const Route = createFileRoute("/statements")({
  head: () =>
    pageHead(
      "Bank Statements & Staging Feed · LedgerX",
      "Upload bank and credit card statements in CSV, OFX, and PDF formats with accountant staging and classification workflows.",
    ),
  component: StatementsPage,
});

function StatementsPage() {
  const modal = useModal();
  const {
    activeCompany,
    statements,
    stagingRows,
    accounts,
    importStatement,
    classifyStagingRow,
    userPersona,
  } = useAccounting();

  const [selectedFile, setSelectedFile] = useState<string>("");
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [fileType, setFileType] = useState<"CSV" | "OFX" | "PDF">("CSV");
  const [customFileName, setCustomFileName] = useState("");
  const [content,setContent]=useState("");
  const [preview,setPreview]=useState<ReturnType<typeof parseStatementCsv>>([]);
  const [error,setError]=useState("");
  const [classifiedTargetAccount, setClassifiedTargetAccount] = useState<Record<string, string>>(
    {},
  );

  const handleSimulateUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await importStatement({name:customFileName,type:"CSV",accountCode:selectedAccount,content});setContent("");setPreview([]);setCustomFileName("");setError("");await modal.showAlert({title:"Extrato importado",message:"Transações disponíveis para classificação.",tone:"success"}); } catch(e){setError(e instanceof Error?e.message:"Falha ao importar.");}
  };

  const handleClassify = (rowId: string, defaultAccount: string) => {
    const targetAcct = classifiedTargetAccount[rowId] || defaultAccount;
    if(!targetAcct){setError("Selecione a conta de classificação.");return;}
    void classifyStagingRow(rowId,targetAcct).catch(e=>setError(e.message));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line/60 pb-3">
        <PageTitle
          title="Bank Statements & Transaction Staging"
          description={`Bank statement source file archive and double-entry transaction classification for ${activeCompany.name}`}
        />
        <div className="self-start sm:self-auto">
          <Badge tone="brand">
            {stagingRows.filter((r) => r.status === "Pending").length} Unclassified Staged Rows
          </Badge>
        </div>
      </div>

      {/* Grid: Statements Archive & Upload Tool */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Source Statement Archive */}
        <div className="lg:col-span-7 space-y-3">
          <Panel
            title="Archived Bank & Card Files"
            subtitle="Original source document retention under US GAAP compliance"
          >
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr className="border-b border-line/60">
                    <Th>Document / File</Th>
                    <Th>Account</Th>
                    <Th>Format</Th>
                    <Th align="right">Rows</Th>
                    <Th>Uploaded</Th>
                    <Th align="right">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {statements.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-line/40 last:border-0 hover:bg-black/[0.01]"
                    >
                      <Td className="font-mono text-[11.5px] font-semibold text-ink">
                        {s.fileName}
                      </Td>
                      <Td className="text-ink2 text-[12px]">Account {s.accountCode}</Td>
                      <Td>
                        <span className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[10px] ring-1 ring-line">
                          {s.fileType}
                        </span>
                      </Td>
                      <Td align="right" className="font-mono text-[11.5px] text-ink3">
                        {s.rowsCount}
                      </Td>
                      <Td className="text-ink3 text-[11.5px]">{s.uploadedAt}</Td>
                      <Td align="right">
                        <Badge tone={s.status === "Reconciled" ? "up" : "brand"}>{s.status}</Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="p-3 border-t border-line/50 text-[11.5px] text-ink3">
              O conteúdo CSV original é armazenado com as transações importadas.
            </div>
          </Panel>
        </div>

        {/* Upload Tool */}
        <div className="lg:col-span-5">
          <Panel
            title="Upload Bank / Credit Card File"
            subtitle="Client Portal & Internal Accountant Feed"
          >
            <form onSubmit={handleSimulateUpload} className="p-4 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                  Target Financial Institution Account
                </label>
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  className="mt-1 w-full rounded bg-white px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none"
                >
                  <option value="">Selecione uma conta cadastrada</option>{accounts.filter(a=>a.type==="Asset"||a.type==="Liability").map(a=><option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                    Format
                  </label>
                  <select
                    value={fileType}
                    onChange={(e) => setFileType(e.target.value as "CSV" | "OFX" | "PDF")}
                    className="mt-1 w-full rounded bg-white px-2.5 py-1.5 text-[12px] ring-1 ring-line outline-none"
                  >
                    <option disabled value="OFX">OFX / QFX (Open Financial)</option>
                    <option value="CSV">CSV (Tabular Transactions)</option>
                    <option disabled value="PDF">PDF (Original e-Statement)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3">
                    File Label / Period
                  </label>
                  <input
                    type="text"
                    value={customFileName}
                    onChange={(e) => setCustomFileName(e.target.value)}
                    placeholder="Nome do arquivo CSV"
                    className="mt-1 w-full rounded bg-white px-2.5 py-1.5 text-[11.5px] ring-1 ring-line outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2 text-sm"><p>CSV de até 2 MB, cabeçalho: date,description,amount. Datas YYYY-MM-DD; valores negativos para saídas. OFX e PDF indisponíveis.</p><input aria-label="Arquivo CSV" type="file" accept=".csv,text/csv" onChange={async e=>{try{const file=e.target.files?.[0];setContent("");setPreview([]);if(!file)return;if(file.size>2000000)throw new Error("Limite de 2 MB.");const text=await file.text();const rows=parseStatementCsv(text);setContent(text);setPreview(rows);setCustomFileName(file.name);setError("");}catch(e){setError(e instanceof Error?e.message:"CSV inválido.");}}}/>{error&&<p role="alert" className="text-down">{error}</p>}{preview.length>0&&<div><p>Prévia: {preview.length} transações</p>{preview.slice(0,5).map((r,i)=><p key={i}>{r.date} · {r.description} · {r.amount}</p>)}</div>}</div>

              <button
                type="submit"
                disabled={!content||!selectedAccount||userPersona.allowedReportsOnly}
                className="w-full rounded-md bg-brand py-2 text-[12px] font-semibold text-primary-foreground hover:opacity-95 shadow-2xs"
              >
                Upload & Load Staging Feed
              </button>

              <Note tone="brand">
                In the MVP boundary, bank statement uploads can be performed by Client Portal users
                or Staff. Raw rows are staged for internal classification.
              </Note>
            </form>
          </Panel>
        </div>
      </div>

      {/* Staging Feed & Classification Table */}
      <Panel
        title="Transaction Staging Feed & Classification"
        subtitle="Match imported statement rows to Chart of Accounts to generate General Ledger entries"
        aside={
          <span className="text-[11.5px] text-ink3">
            {stagingRows.filter((r) => r.status === "Classified").length} of {stagingRows.length}{" "}
            classified
          </span>
        }
      >
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr className="border-b border-line/60">
                <Th>Date</Th>
                <Th>Statement Description</Th>
                <Th align="right">Amount</Th>
                <Th>Target Chart of Account</Th>
                <Th align="right">Status</Th>
                <Th align="center">Action</Th>
              </tr>
            </thead>
            <tbody>
              {stagingRows.map((row) => {
                const currentSelection = classifiedTargetAccount[row.id] || row.suggestedAccount;
                return (
                  <tr
                    key={row.id}
                    className="border-b border-line/40 last:border-0 hover:bg-black/[0.01]"
                  >
                    <Td className="text-ink3 text-[11.5px] font-mono">{formatDate(row.date)}</Td>
                    <Td className="font-medium text-ink text-[12px] max-w-[260px] truncate">
                      {row.description}
                    </Td>
                    <Td
                      align="right"
                      className={`font-mono text-[12px] font-semibold ${row.amount < 0 ? "text-down" : "text-up"}`}
                    >
                      {usd(row.amount)}
                    </Td>
                    <Td>
                      {row.status === "Pending" && !userPersona.allowedReportsOnly ? (
                        <select
                          value={currentSelection}
                          onChange={(e) =>
                            setClassifiedTargetAccount({
                              ...classifiedTargetAccount,
                              [row.id]: e.target.value,
                            })
                          }
                          className="rounded bg-white px-2 py-1 text-[11.5px] ring-1 ring-line outline-none w-full max-w-[240px]"
                        >
                          {accounts.map((a) => (
                            <option key={a.code} value={a.code}>
                              {a.code} · {a.name} ({a.type})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[12px] font-mono text-ink2">
                          Account {row.classifiedAccount || row.suggestedAccount}
                        </span>
                      )}
                    </Td>
                    <Td align="right">
                      <Badge tone={row.status === "Classified" ? "up" : "brand"}>
                        {row.status}
                      </Badge>
                    </Td>
                    <Td align="center">
                      {row.status === "Pending" && !userPersona.allowedReportsOnly ? (
                        <button
                          type="button"
                          onClick={() => handleClassify(row.id, row.suggestedAccount)}
                          className="rounded bg-brand px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:opacity-90 shadow-2xs"
                        >
                          Classify & Post
                        </button>
                      ) : (
                        <span className="text-ink3 text-[11px]">Posted</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
