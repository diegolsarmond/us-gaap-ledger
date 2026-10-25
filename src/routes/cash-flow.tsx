import { useCompanies } from "@/components/company-context";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  loadCashData,
  saveCashAccount,
  saveCashTransaction,
  deleteCashTransaction,
} from "@/lib/cash-flow";
import {
  summarize,
  type CashAccount,
  type CashTransaction,
  type Interval,
} from "@/lib/cash-flow-model";
import { PageTitle, Panel, Kpi, Table, Th, Td } from "@/components/ui-kit";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { exportToCsv } from "@/lib/format";
export const Route = createFileRoute("/cash-flow")({
  head: () => ({ meta: [{ title: "Fluxo de caixa · World Business" }] }),
  component: CashFlowPage,
});
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const control = "w-full rounded-md border border-line bg-white px-3 py-2 text-sm";
const button = "rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const statusLabels = { planned: "Previsto", paid: "Realizado", cancelled: "Cancelado" };
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-xs text-ink2">
      <span>{label}</span>
      {children}
    </label>
  );
}
function EntryFormContainer({
  modal,
  title,
  companyName,
  onClose,
  children,
}: {
  modal: boolean;
  title: string;
  companyName: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!modal) return <Panel title={title}>{children}</Panel>;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="rounded-md border border-brand/20 bg-brand/5 px-3 py-2">
            <span className="block text-xs font-medium text-ink2">Empresa</span>
            <span className="block text-lg font-bold text-brand">{companyName}</span>
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
function CashFlowPage() {
  const { activeCompany } = useCompanies();
  const companyId = activeCompany!.id;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["cash-flow", companyId],
    queryFn: () => loadCashData({ data: { companyId } }),
  });
  const [start, setStart] = useState(() => today().slice(0, 7) + "-01");
  const [end, setEnd] = useState(today);
  const [interval, setInterval] = useState<Interval>("daily");
  const [projected, setProjected] = useState(true);
  const [currency, setCurrency] = useState("USD");
  const [accountId, setAccountId] = useState("");
  const [form, setForm] = useState<"account" | "transaction" | null>(null);
  const [keepOpen, setKeepOpen] = useState(false);
  const entryFormRef = useRef<HTMLFormElement>(null);
  const continueEntryRef = useRef(false);
  const focusEntryRef = useRef(false);
  const [editing, setEditing] = useState<CashTransaction | null>(null);
  const [editingAccount, setEditingAccount] = useState<CashAccount | null>(null);
  const [status, setStatus] = useState<CashTransaction["status"]>("planned");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const accounts = query.data?.accounts ?? [];
  const transactions = query.data?.transactions ?? [];
  const filteredAccounts = accounts.filter(
    (a) => a.currency === currency && (!accountId || a.id === accountId),
  );
  const ids = new Set(filteredAccounts.map((a) => a.id));
  const filteredTransactions = transactions.filter((t) => ids.has(t.account_id));
  const validRange =
    !!start &&
    !!end &&
    start <= end &&
    new Date(end).getTime() - new Date(start).getTime() <= 366 * 5 * 86400000;
  const report = summarize(
    filteredAccounts,
    filteredTransactions,
    validRange ? start : today(),
    validRange ? end : today(),
    interval,
    projected,
  );
  const money = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(n);
  const totalIn = report.periods.reduce((s, p) => s + p.inflows, 0);
  const totalOut = report.periods.reduce((s, p) => s + p.outflows, 0);
  const listed = filteredTransactions.filter((t) => {
    const date = t.paid_date ?? t.due_date;
    return date >= start && date <= end;
  });
  const plannedOutflows =
    listed
      .filter((t) => t.status === "planned" && t.direction === "out")
      .reduce((sum, t) => sum + Math.round(t.amount * 100), 0) / 100;
  async function mutate(action: () => Promise<unknown>, message: string) {
    if (pending) return;
    continueEntryRef.current = form === "transaction" && !editing && keepOpen;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["cash-flow"] });
      if (continueEntryRef.current) {
        const entryForm = entryFormRef.current;
        entryForm?.reset();
        setStatus("planned");
        focusEntryRef.current = true;
      } else {
        setForm(null);
        setEditing(null);
        setEditingAccount(null);
      }
      setDeleteId(null);
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setPending(false);
      if (focusEntryRef.current) {
        focusEntryRef.current = false;
        requestAnimationFrame(() =>
          entryFormRef.current?.querySelector<HTMLInputElement>('[name="description"]')?.focus(),
        );
      }
    }
  }
  function submitAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void mutate(
      () =>
        saveCashAccount({
          data: {
            companyId,
            ...(editingAccount ? { id: editingAccount.id } : {}),
            name: String(f.get("name")),
            currency: String(f.get("currency")) as "USD" | "BRL" | "EUR",
            opening_date: String(f.get("opening_date")),
            opening_balance: Number(f.get("opening_balance")),
          },
        }),
      editingAccount ? "Conta atualizada." : "Conta criada.",
    );
  }
  function submitTransaction(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void mutate(
      () =>
        saveCashTransaction({
          data: {
            companyId,
            ...(editing ? { id: editing.id } : {}),
            account_id: String(f.get("account_id")),
            description: String(f.get("description")),
            category: String(f.get("category")),
            direction: String(f.get("direction")) as "in" | "out",
            amount: Number(f.get("amount")),
            due_date: String(f.get("due_date")),
            paid_date: status === "paid" ? String(f.get("paid_date")) : null,
            status,
          },
        }),
      "Lançamento salvo.",
    );
  }
  function exportReport() {
    exportToCsv(
      "fluxo_caixa_" + currency + "_" + start + "_" + end,
      [
        "Período",
        "Saldo anterior",
        "Entradas",
        "Saídas",
        "Saldos iniciais cadastrados",
        "Movimentação líquida",
        "Saldo final",
        "Moeda",
        "Visão",
      ],
      report.periods.map((p) => [
        p.label,
        p.openingBalance,
        p.inflows,
        p.outflows,
        p.adjustments,
        p.net,
        p.balance,
        currency,
        projected ? "Previsto + realizado" : "Realizado",
      ]),
    );
  }
  return (
    <div className="space-y-5">
      <PageTitle
        title="Fluxo de caixa"
        description="Acompanhe entradas, saídas e saldos por dia, semana, mês, trimestre ou ano."
        actions={
          <>
            <button
              className={button}
              disabled={!query.isSuccess || pending}
              onClick={() => {
                setEditingAccount(null);
                setForm("account");
                setError("");
              }}
            >
              Nova conta
            </button>
            <button
              className={button}
              disabled={!accounts.length || pending}
              onClick={() => {
                setEditing(null);
                setStatus("planned");
                setForm("transaction");
                setError("");
              }}
            >
              Novo lançamento
            </button>
          </>
        }
      />
      {query.isPending && <p role="status">Carregando dados do banco…</p>}
      {query.isError && (
        <div
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          Não foi possível carregar o fluxo de caixa. Verifique a conexão e se o script
          database/002_cash_flow.sql foi executado.
          <button className="ml-3 underline" onClick={() => void query.refetch()}>
            Tentar novamente
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded bg-green-50 p-3 text-sm text-green-800">
          {notice}
        </p>
      )}
      {query.isSuccess && (
        <>
          {form && (
            <EntryFormContainer
              modal={form === "transaction"}
              companyName={activeCompany!.name}
              onClose={() => {
                if (!pending) {
                  setForm(null);
                  setError("");
                }
              }}
              title={
                form === "account"
                  ? editingAccount
                    ? "Editar conta de caixa / banco"
                    : "Cadastrar conta de caixa / banco"
                  : editing
                    ? "Editar lançamento"
                    : "Cadastrar lançamento"
              }
            >
              <form
                key={
                  form +
                  (form === "account" ? (editingAccount?.id ?? "new") : (editing?.id ?? "new"))
                }
                ref={entryFormRef}
                onSubmit={form === "account" ? submitAccount : submitTransaction}
                className="p-4"
              >
                {form === "transaction" && error && (
                  <p role="alert" className="mb-3 text-sm text-red-800">
                    {error}
                  </p>
                )}
                {form === "transaction" && notice && (
                  <p role="status" className="mb-3 text-sm text-green-800">
                    {notice}
                  </p>
                )}
                <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {form === "account" ? (
                    <>
                      <Field label="Nome da conta">
                        <input
                          name="name"
                          defaultValue={editingAccount?.name}
                          required
                          maxLength={120}
                          className={control}
                        />
                      </Field>
                      <Field label="Moeda">
                        <select
                          name="currency"
                          defaultValue={editingAccount?.currency ?? currency}
                          className={control}
                        >
                          <option>USD</option>
                          <option>BRL</option>
                          <option>EUR</option>
                        </select>
                      </Field>
                      <Field label="Data do saldo inicial">
                        <input
                          name="opening_date"
                          type="date"
                          defaultValue={editingAccount?.opening_date ?? today()}
                          required
                          className={control}
                        />
                      </Field>
                      <Field label="Saldo inicial (pode ser negativo)">
                        <input
                          name="opening_balance"
                          type="number"
                          step="0.01"
                          min="-999999999999.99"
                          max="999999999999.99"
                          defaultValue={editingAccount?.opening_balance ?? 0}
                          required
                          className={control}
                        />
                      </Field>
                      <p className="text-xs text-ink3">
                        O saldo inicial é a posição no início dessa data, antes dos lançamentos do
                        dia.
                        {editingAccount &&
                          " Alterar o saldo inicial recalcula os saldos do fluxo. A moeda só pode ser alterada se não houver lançamentos."}
                      </p>
                    </>
                  ) : (
                    <>
                      <Field label="Conta">
                        <select
                          autoFocus
                          name="account_id"
                          defaultValue={
                            editing?.account_id ?? filteredAccounts[0]?.id ?? accounts[0]?.id
                          }
                          required
                          className={control}
                        >
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} · {a.currency}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Descrição">
                        <input
                          name="description"
                          defaultValue={editing?.description}
                          required
                          maxLength={240}
                          className={control}
                        />
                      </Field>
                      <Field label="Categoria">
                        <input
                          name="category"
                          defaultValue={editing?.category}
                          required
                          maxLength={100}
                          placeholder="Ex.: Vendas, aluguel, folha"
                          className={control}
                        />
                      </Field>
                      <Field label="Tipo">
                        <select
                          name="direction"
                          defaultValue={editing?.direction ?? "in"}
                          className={control}
                        >
                          <option value="in">Entrada</option>
                          <option value="out">Saída</option>
                        </select>
                      </Field>
                      <Field label="Valor na moeda da conta">
                        <input
                          name="amount"
                          type="number"
                          min="0.01"
                          max="999999999999.99"
                          step="0.01"
                          defaultValue={editing?.amount}
                          required
                          className={control}
                        />
                      </Field>
                      <Field label="Vencimento">
                        <input
                          name="due_date"
                          type="date"
                          defaultValue={editing?.due_date ?? today()}
                          required
                          className={control}
                        />
                      </Field>
                      <Field label="Situação">
                        <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value as typeof status)}
                          className={control}
                        >
                          {Object.entries(statusLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {status === "paid" && (
                        <Field label="Data de recebimento / pagamento">
                          <input
                            name="paid_date"
                            type="date"
                            defaultValue={editing?.paid_date ?? today()}
                            required
                            className={control}
                          />
                        </Field>
                      )}
                    </>
                  )}
                  {form === "transaction" && !editing && (
                    <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
                      <input
                        type="checkbox"
                        checked={keepOpen}
                        onChange={(e) => setKeepOpen(e.target.checked)}
                        className="h-4 w-4 accent-brand"
                      />
                      Continuar lançando (manter a janela aberta após salvar)
                    </label>
                  )}
                  <div className="flex items-end gap-3">
                    <button className={button}>{pending ? "Salvando…" : "Salvar"}</button>
                    <button
                      type="button"
                      className="text-sm underline"
                      onClick={() => {
                        setForm(null);
                        setError("");
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </fieldset>
              </form>
            </EntryFormContainer>
          )}
          {!accounts.length && (
            <Panel title="Comece cadastrando sua primeira conta">
              <p className="p-4 text-sm text-ink3">
                Nenhum dado de demonstração é utilizado. Cadastre o saldo inicial de uma conta e
                registre seus recebimentos e pagamentos.
              </p>
            </Panel>
          )}
          <Panel title="Período e visão">
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
              <Field label="De">
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className={control}
                />
              </Field>
              <Field label="Até">
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className={control}
                />
              </Field>
              <Field label="Agrupamento">
                <select
                  value={interval}
                  onChange={(e) => setInterval(e.target.value as Interval)}
                  className={control}
                >
                  {[
                    ["daily", "Diário"],
                    ["weekly", "Semanal"],
                    ["monthly", "Mensal"],
                    ["quarterly", "Trimestral"],
                    ["yearly", "Anual"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Moeda">
                <select
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value);
                    setAccountId("");
                  }}
                  className={control}
                >
                  <option>USD</option>
                  <option>BRL</option>
                  <option>EUR</option>
                </select>
              </Field>
              <Field label="Conta">
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className={control}
                >
                  <option value="">Todas nesta moeda</option>
                  {accounts
                    .filter((a) => a.currency === currency)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Visão">
                <select
                  value={projected ? "projected" : "actual"}
                  onChange={(e) => setProjected(e.target.value === "projected")}
                  className={control}
                >
                  <option value="actual">Realizado</option>
                  <option value="projected">Realizado + previsto</option>
                </select>
              </Field>
            </div>
            <p className="px-4 pb-4 text-xs text-ink3">
              Semanas começam na segunda-feira. Realizados usam a data de pagamento; previstos usam
              o vencimento. Valores são separados por moeda, sem conversão cambial. Cancelados não
              afetam os saldos.
            </p>
          </Panel>
          {!validRange ? (
            <p role="alert" className="text-red-700">
              Informe um período válido de até cinco anos.
            </p>
          ) : (
            <>
              {!projected && plannedOutflows > 0 && (
                <p
                  role="status"
                  className="rounded border border-line bg-white p-3 text-sm text-ink2"
                >
                  Há {money(plannedOutflows)} em despesas previstas neste período. Elas entram no
                  saldo projetado; a visão Realizado considera apenas pagamentos efetivados.{" "}
                  <button className="text-brand underline" onClick={() => setProjected(true)}>
                    Incluir previstos
                  </button>
                </p>
              )}
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="Saldo anterior ao período" value={money(report.opening)} />
                <Kpi label="Entradas no período" value={money(totalIn)} tone="up" />
                <Kpi label="Saídas no período" value={money(totalOut)} tone="down" />
                <Kpi
                  label={projected ? "Saldo final projetado" : "Saldo final realizado"}
                  value={money(report.periods.at(-1)?.balance ?? report.opening)}
                />
              </section>
              <Panel
                title="Evolução do caixa"
                subtitle={
                  projected
                    ? "Projeção baseada somente nos lançamentos cadastrados, sem estimativas automáticas."
                    : "Movimentações efetivamente recebidas ou pagas."
                }
                aside={
                  <button onClick={exportReport} className={button}>
                    Exportar CSV
                  </button>
                }
              >
                <p className="px-4 py-3 text-xs text-ink3">
                  Saldo final = saldo anterior + saldos iniciais cadastrados + entradas − saídas.
                  Saldos iniciais cadastrados são incorporados na data de abertura de cada conta. A
                  movimentação líquida corresponde às entradas menos as saídas.
                </p>
                <Table>
                  <thead>
                    <tr>
                      <Th>Período</Th>
                      <Th align="right">Saldo anterior</Th>
                      <Th align="right">Entradas</Th>
                      <Th align="right">Saídas</Th>
                      <Th align="right">Saldos iniciais cadastrados</Th>
                      <Th align="right">Movimentação líquida</Th>
                      <Th align="right">Saldo final</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.periods.map((p) => (
                      <tr key={p.label} className="border-t border-line">
                        <Td>
                          {interval === "weekly" ? "Semana de " : ""}
                          {p.label}
                        </Td>
                        <Td align="right">{money(p.openingBalance)}</Td>
                        <Td align="right">{money(p.inflows)}</Td>
                        <Td align="right">{money(p.outflows)}</Td>
                        <Td align="right">{money(p.adjustments)}</Td>
                        <Td align="right">{money(p.net)}</Td>
                        <Td align="right">{money(p.balance)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Panel>
              <Panel
                title="Lançamentos do período"
                subtitle={
                  projected
                    ? "Previstos e realizados afetam os totais. Cancelados não afetam os saldos."
                    : "Somente realizados afetam os totais. Previstos e cancelados são exibidos para consulta."
                }
              >
                <Table>
                  <thead>
                    <tr>
                      <Th>Vencimento / realização</Th>
                      <Th>Descrição / categoria</Th>
                      <Th>Conta</Th>
                      <Th>Situação</Th>
                      <Th align="right">Valor</Th>
                      <Th>Ações</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {!listed.length && (
                      <tr>
                        <Td colSpan={6}>Nenhum lançamento neste período.</Td>
                      </tr>
                    )}
                    {listed.map((t) => (
                      <tr key={t.id} className="border-t border-line">
                        <Td>
                          {t.due_date}
                          <br />
                          {t.paid_date}
                        </Td>
                        <Td>
                          {t.description}
                          <br />
                          <span className="text-xs text-ink3">{t.category}</span>
                        </Td>
                        <Td>{accounts.find((a) => a.id === t.account_id)?.name}</Td>
                        <Td>{statusLabels[t.status]}</Td>
                        <Td
                          align="right"
                          className={`font-medium ${t.direction === "out" ? "text-red-700" : "text-blue-700"}`}
                        >
                          {t.direction === "out" ? "−" : "+"}
                          {money(t.amount)}
                        </Td>
                        <Td>
                          <div className="flex gap-3">
                            <button
                              disabled={pending}
                              className="text-brand underline"
                              onClick={() => {
                                setEditing(t);
                                setStatus(t.status);
                                setForm("transaction");
                                setError("");
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                            >
                              Editar
                            </button>
                            <button
                              disabled={pending}
                              className="text-red-700 underline"
                              onClick={() => setDeleteId(t.id)}
                            >
                              Excluir
                            </button>
                          </div>
                          {deleteId === t.id && (
                            <div className="mt-2 text-xs">
                              Excluir definitivamente este lançamento?
                              <div className="mt-2 flex gap-3">
                                <button
                                  disabled={pending}
                                  className="text-red-700 underline"
                                  onClick={() =>
                                    void mutate(
                                      () =>
                                        deleteCashTransaction({ data: { id: t.id, companyId } }),
                                      "Lançamento excluído.",
                                    )
                                  }
                                >
                                  Confirmar exclusão
                                </button>
                                <button disabled={pending} onClick={() => setDeleteId(null)}>
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Panel>
            </>
          )}
          <Panel title="Contas cadastradas">
            <Table>
              <thead>
                <tr>
                  <Th>Conta</Th>
                  <Th>Moeda</Th>
                  <Th>Data inicial</Th>
                  <Th align="right">Saldo inicial</Th>
                  <Th>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <Td>{a.name}</Td>
                    <Td>{a.currency}</Td>
                    <Td>{a.opening_date}</Td>
                    <Td align="right">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: a.currency,
                      }).format(a.opening_balance)}
                    </Td>
                    <Td>
                      <button
                        type="button"
                        disabled={pending}
                        className="text-brand underline"
                        onClick={() => {
                          setEditingAccount(a);
                          setForm("account");
                          setError("");
                          setNotice("");
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Editar
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>
        </>
      )}
    </div>
  );
}
