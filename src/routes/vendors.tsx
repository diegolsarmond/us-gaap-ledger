import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccounting } from "@/lib/accounting-store";
import {
  vendorSchema,
  MAX_VENDOR_ATTACHMENT_BYTES,
  type VendorInput,
  type Vendor,
} from "@/lib/vendor-model";
import {
  listVendorAttachments,
  uploadVendorAttachment,
  downloadVendorAttachment,
  removeVendorAttachment,
} from "@/lib/vendor-attachments";

export const Route = createFileRoute("/vendors")({ component: VendorsPage });
const groups: { title: string; fields: [keyof VendorInput, string][] }[] = [
  {
    title: "1. Dados principais e contato",
    fields: [
      ["displayName", "Nome de exibição / Vendor Display Name *"],
      ["title", "Tratamento / Title"],
      ["firstName", "Nome / First Name"],
      ["middleName", "Nome do meio / Middle Name"],
      ["lastName", "Sobrenome / Last Name"],
      ["suffix", "Sufixo / Suffix"],
      ["companyName", "Empresa / Company Name"],
      ["printOnCheckAs", "Nome no cheque / Print on check as"],
      ["email", "E-mail"],
      ["phone", "Telefone principal / Phone"],
      ["mobile", "Celular / Mobile"],
      ["fax", "Fax"],
      ["website", "Website (https://)"],
    ],
  },
  {
    title: "2. Endereço / Address",
    fields: [
      ["streetAddress", "Logradouro e número / Street Address"],
      ["city", "Cidade / City"],
      ["stateProvince", "Estado ou província / State / Province"],
      ["zipCode", "CEP / ZIP Code"],
      ["country", "País / Country"],
    ],
  },
  {
    title: "3. Termos de pagamento e contabilidade",
    fields: [["accountNumber", "Número da conta no fornecedor / Account No."]],
  },
  {
    title: "4. Informações fiscais / Tax Information",
    fields: [["taxId", "Identificação fiscal / SSN / EIN / CNPJ / RFC"]],
  },
  {
    title: "5. Dados bancários / Payments",
    fields: [
      ["bankName", "Nome do banco / Bank Name"],
      ["routingNumber", "Roteamento / Routing Number / ABA"],
      ["bankAccountNumber", "Número da conta bancária / Account Number"],
    ],
  },
];
const inputClass = "w-full rounded-md border border-line bg-white p-2 text-sm";
function VendorsPage() {
  const {
    activeCompany,
    vendors,
    addVendor,
    updateVendor,
    accounts,
    currencies,
    paymentTerms,
    userPersona,
  } = useAccounting();
  const [draft, setDraft] = useState<VendorInput | null>(null);
  const [editingId, setEditingId] = useState<string>();
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const writable = userPersona.canCreateJournals;
  function open(vendor?: Vendor) {
    setDraft(
      vendor
        ? vendorSchema.parse(vendor)
        : { ...vendorSchema.parse({ displayName: "Novo" }), displayName: "" },
    );
    setEditingId(vendor?.id);
    setError("");
    setSaved("");
  }
  function change(key: keyof VendorInput, value: string | boolean) {
    setDraft((prev) => prev && { ...prev, [key]: value });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const parsed = vendorSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    try {
      if (editingId) await updateVendor(editingId, parsed.data);
      else setEditingId(await addVendor(parsed.data));
      setSaved("Fornecedor salvo. Você pode gerenciar os anexos abaixo.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }
  function select(
    key: "paymentTermId" | "currency" | "defaultExpenseAccountCode" | "bankAccountType",
    label: string,
    options: { value: string; label: string }[],
  ) {
    const value = String(draft?.[key] ?? "");
    return (
      <label className="space-y-1 text-sm">
        {label}
        <select className={inputClass} value={value} onChange={(e) => change(key, e.target.value)}>
          <option value="">Não informado</option>
          {value && !options.some((o) => o.value === value) && (
            <option value={value}>{value} (atual)</option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Vendors / Fornecedores</h1>
          <p className="text-sm text-ink3">
            {activeCompany.name} · Apenas o nome de exibição é obrigatório.
          </p>
        </div>
        {writable && (
          <button
            className="rounded bg-brand px-4 py-2 text-white"
            onClick={() => {
              setDraft({ ...vendorSchema.parse({ displayName: "Novo" }), displayName: "" });
              setEditingId(undefined);
              setError("");
              setSaved("");
            }}
          >
            Novo fornecedor
          </button>
        )}
      </div>
      {draft ? (
        <>
          <button className="text-brand underline" onClick={() => setDraft(null)}>
            Voltar à lista
          </button>
          <form onSubmit={save} className="space-y-4">
            <fieldset disabled={!writable} className="space-y-4">
              {groups.map((group, index) => (
                <section key={group.title} className="rounded-lg border border-line bg-white p-4">
                  <h2 className="mb-4 font-semibold">{group.title}</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {group.fields.map(([key, label]) => (
                      <label key={key} className="space-y-1 text-sm" htmlFor={key}>
                        {label}
                        <input
                          id={key}
                          className={inputClass}
                          required={key === "displayName"}
                          maxLength={
                            key === "displayName"
                              ? 120
                              : key === "website"
                                ? 500
                                : key === "email"
                                  ? 254
                                  : 300
                          }
                          type={
                            key === "email"
                              ? "email"
                              : key === "website"
                                ? "url"
                                : key === "phone" || key === "mobile" || key === "fax"
                                  ? "tel"
                                  : "text"
                          }
                          value={String(draft[key])}
                          onChange={(e) => change(key, e.target.value)}
                          autoComplete="off"
                        />
                      </label>
                    ))}
                    {index === 2 && (
                      <>
                        {select(
                          "paymentTermId",
                          "Termos / Terms",
                          paymentTerms
                            .filter((t) => t.status === "Active")
                            .map((t) => ({
                              value: t.id,
                              label: t.name + " (" + t.days + " dias)",
                            })),
                        )}
                        {select(
                          "currency",
                          "Moeda / Currency",
                          currencies
                            .filter((c) => c.status === "Active")
                            .map((c) => ({ value: c.code, label: c.code + " · " + c.name })),
                        )}
                        {select(
                          "defaultExpenseAccountCode",
                          "Conta de despesa padrão / Default Expense Account",
                          accounts
                            .filter((a) =>
                              ["COGS", "Operating Expense", "Other Expense"].includes(a.type),
                            )
                            .map((a) => ({ value: a.code, label: a.code + " · " + a.name })),
                        )}
                      </>
                    )}
                    {index === 3 && (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.track1099}
                          onChange={(e) => change("track1099", e.target.checked)}
                        />
                        Track 1099 / Prestador independente (EUA)
                      </label>
                    )}
                    {index === 4 && (
                      <>
                        {select("bankAccountType", "Tipo de conta / Account Type", [
                          { value: "Checking", label: "Checking / Corrente" },
                          { value: "Savings", label: "Savings / Poupança" },
                        ])}
                        <p className="text-xs text-ink3">
                          Dados para referência da equipe. Pagamento automático depende de
                          integração com um provedor de pagamentos.
                        </p>
                      </>
                    )}
                  </div>
                </section>
              ))}
              <section className="rounded-lg border border-line bg-white p-4">
                <h2 className="mb-3 font-semibold">6. Observações e anexos</h2>
                <label className="text-sm" htmlFor="notes">
                  Notas internas / Notes
                </label>
                <textarea
                  id="notes"
                  className={inputClass}
                  rows={4}
                  maxLength={10000}
                  value={draft.notes}
                  onChange={(e) => change("notes", e.target.value)}
                />
              </section>
              {writable && (
                <button className="rounded bg-brand px-4 py-2 text-white" type="submit">
                  Salvar fornecedor
                </button>
              )}
            </fieldset>
            {error && (
              <p role="alert" className="text-down">
                {error}
              </p>
            )}
            {saved && <p role="status">{saved}</p>}
          </form>
          {editingId ? (
            <Attachments companyId={activeCompany.id} vendorId={editingId} writable={writable} />
          ) : (
            <p className="text-sm text-ink3">
              Salve o fornecedor para adicionar anexos de até 20 MB cada.
            </p>
          )}
        </>
      ) : (
        <>
          <label className="block text-sm">
            Buscar fornecedor
            <input
              className={inputClass}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, empresa, e-mail ou identificação fiscal"
            />
          </label>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {["Nome de exibição", "Empresa", "Contato", "Moeda", "Ação"].map((h) => (
                    <th className="p-3" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vendors
                  .filter((v) =>
                    [v.displayName, v.companyName, v.email, v.taxId]
                      .join(" ")
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((v) => (
                    <tr key={v.id} className="border-t border-line">
                      <td className="p-3">{v.displayName}</td>
                      <td className="p-3">{v.companyName || "—"}</td>
                      <td className="p-3">{v.email || v.phone || "—"}</td>
                      <td className="p-3">{v.currency || "—"}</td>
                      <td className="p-3">
                        <button className="text-brand underline" onClick={() => open(v)}>
                          {writable ? "Editar" : "Ver cadastro"}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!vendors.length && (
              <p className="p-4 text-sm text-ink3">Nenhum fornecedor cadastrado nesta empresa.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
function Attachments({
  companyId,
  vendorId,
  writable,
}: {
  companyId: string;
  vendorId: string;
  writable: boolean;
}) {
  const client = useQueryClient();
  const key = ["vendor-attachments", companyId, vendorId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => listVendorAttachments({ data: { companyId, vendorId } }),
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await client.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao processar anexo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-lg border border-line bg-white p-4">
      <h2 className="font-semibold">Anexos / Attachments</h2>
      <p className="text-sm text-ink3">
        W-9, W-8BEN, contratos e tabelas de preços. Até 20 MB por arquivo.
      </p>
      {writable && (
        <label className="block text-sm">
          Adicionar arquivo
          <input
            className="block"
            type="file"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void action(async () => {
                if (!file.size || file.size > MAX_VENDOR_ATTACHMENT_BYTES)
                  throw new Error("Selecione um arquivo de até 20 MB, não vazio.");
                const content = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result).split(",")[1]!);
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                });
                await uploadVendorAttachment({
                  data: { companyId, vendorId, name: file.name, content },
                });
              });
            }}
          />
        </label>
      )}
      {query.isPending && <p role="status">Carregando anexos…</p>}
      {query.isError && (
        <p role="alert">
          Não foi possível carregar os anexos.{" "}
          <button onClick={() => void query.refetch()}>Tentar novamente</button>
        </p>
      )}
      {query.data?.map((file) => (
        <div key={file.id} className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
          </span>
          <button
            disabled={busy}
            className="text-brand underline"
            onClick={() =>
              void action(async () => {
                const result = await downloadVendorAttachment({
                  data: { companyId, vendorId, id: file.id },
                });
                const bytes = Uint8Array.from(atob(result.content), (c) => c.charCodeAt(0));
                const url = URL.createObjectURL(
                  new Blob([bytes], { type: "application/octet-stream" }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = result.name;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              })
            }
          >
            Baixar
          </button>
          {writable && (
            <button
              disabled={busy}
              className="text-down underline"
              onClick={() => {
                if (window.confirm("Excluir este anexo?"))
                  void action(() =>
                    removeVendorAttachment({ data: { companyId, vendorId, id: file.id } }),
                  );
              }}
            >
              Excluir
            </button>
          )}
        </div>
      ))}
      {busy && <p role="status">Processando anexo…</p>}
      {error && (
        <p role="alert" className="text-down">
          {error}
        </p>
      )}
    </section>
  );
}
