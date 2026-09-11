import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAccounting, type AccountType } from "@/lib/accounting-store";
import { Badge, Note, PageTitle, Panel, Table, Td, Th } from "@/components/ui-kit";
import { usd, dash, exportToCsv } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { useModal } from "@/components/modal-provider";
import { ArrowLeft, Plus, Search } from "lucide-react";

export const Route = createFileRoute("/accounts")({
  head: () =>
    pageHead(
      "Chart of Accounts · LedgerX",
      "US GAAP standardized Chart of Accounts covering Assets, Liabilities, Equity, Revenue, COGS, and Expenses.",
    ),
  component: AccountsPage,
});

function AccountsPage() {
  const modal = useModal();
  const { activeCompany, accounts, accountBalances, addAccount, userPersona } = useAccounting();

  // Screen View Mode: "list" | "create"
  const [view, setView] = useState<"list" | "create">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  // New Account Form State
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<AccountType>("Operating Expense");
  const [newBalanceType, setNewBalanceType] = useState<"Debit" | "Credit">("Debit");
  const [newDescription, setNewDescription] = useState("");

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode || !newName) return;

    // Check duplicate
    if (accounts.some((a) => a.code.trim() === newCode.trim())) {
      await modal.showAlert({
        title: "Código de Conta Duplicado",
        message: `Já existe uma conta contábil registrada com o código "${newCode}". Por favor, utilize um código único no plano de contas.`,
        tone: "warning",
      });
      return;
    }

    addAccount({
      code: newCode.trim(),
      name: newName.trim(),
      type: newType,
      balanceType: newBalanceType,
      description: newDescription.trim(),
    });

    const createdCode = newCode;
    const createdName = newName;

    setNewCode("");
    setNewName("");
    setNewDescription("");
    setView("list");

    await modal.showAlert({
      title: "Conta Adicionada com Sucesso",
      message: `A conta contábil "${createdCode} — ${createdName}" foi integrada ao Plano de Contas da empresa ${activeCompany.name}.`,
      tone: "success",
    });
  };

  const handleExportCsv = () => {
    const headers = [
      "Account Code",
      "Account Name",
      "Category / Type",
      "Normal Balance",
      "Description",
      "Current Net Balance ($)",
    ];
    const rows = accounts.map((a) => [
      a.code,
      a.name,
      a.type,
      a.balanceType,
      a.description,
      accountBalances[a.code]?.net || 0,
    ]);
    exportToCsv(`${activeCompany.id}_chart_of_accounts`, headers, rows);
  };

  const categories = ["ALL", "Asset", "Liability", "Equity", "Revenue", "COGS", "Operating Expense", "Other Expense"];

  const filteredAccounts = accounts.filter((a) => {
    const matchesSearch =
      a.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "ALL" || a.type === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-4">
      {view === "list" ? (
        /* ================= TELA DE LISTAGEM ================= */
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line/60 pb-3">
            <PageTitle
              title="Chart of Accounts (COA)"
              description={`General ledger master structure for ${activeCompany.name} · US GAAP Standard`}
            />
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={handleExportCsv}
                className="rounded-md bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-line hover:bg-white shadow-2xs transition-colors cursor-pointer"
              >
                Export COA (CSV)
              </button>
              {userPersona.canCreateJournals && (
                <button
                  type="button"
                  onClick={() => setView("create")}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-brand/90 shadow-2xs transition-colors cursor-pointer"
                >
                  <Plus className="size-4" />
                  Nova Conta Contábil
                </button>
              )}
            </div>
          </div>

          {/* Search and Category Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-ink3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por código ou nome da conta..."
                className="w-full rounded-md border border-line bg-white/90 py-1.5 pl-8 pr-3 text-[12px] text-ink outline-none ring-1 ring-transparent focus:border-brand focus:ring-brand/20 transition-all"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                    selectedCategory === cat
                      ? "bg-brand text-white"
                      : "bg-surface text-ink2 hover:bg-muted ring-1 ring-line"
                  }`}
                >
                  {cat === "ALL" ? "Todas as Contas" : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Master Table Full Width */}
          <Panel
            title="Master Chart of Accounts"
            subtitle={`${filteredAccounts.length} de ${accounts.length} contas listadas`}
          >
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr className="border-b border-line/60">
                    <Th>Code</Th>
                    <Th>Account Name</Th>
                    <Th>Classification</Th>
                    <Th>Normal Bal</Th>
                    <Th>Accounting Scope</Th>
                    <Th align="right">Current Net Balance</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.length === 0 ? (
                    <tr>
                      <Td colSpan={6} className="py-8 text-center text-[12px] text-ink3">
                        Nenhuma conta encontrada para o filtro selecionado.
                      </Td>
                    </tr>
                  ) : (
                    filteredAccounts.map((a) => {
                      const net = accountBalances[a.code]?.net || 0;
                      return (
                        <tr
                          key={a.code}
                          className="border-b border-line/40 last:border-0 hover:bg-black/[0.01] transition-colors"
                        >
                          <Td className="font-mono text-[11.5px] font-semibold text-brand">
                            {a.code}
                          </Td>
                          <Td className="font-medium text-ink text-[12px]">{a.name}</Td>
                          <Td>
                            <Badge
                              tone={
                                a.type === "Asset"
                                  ? "up"
                                  : a.type === "Liability"
                                    ? "neutral"
                                    : a.type === "Equity"
                                      ? "brand"
                                      : a.type === "Revenue"
                                        ? "up"
                                        : "down"
                              }
                            >
                              {a.type}
                            </Badge>
                          </Td>
                          <Td className="text-[11.5px] text-ink3">{a.balanceType}</Td>
                          <Td className="text-ink3 text-[11.5px] max-w-[280px] truncate">
                            {a.description}
                          </Td>
                          <Td align="right" className="font-mono text-[12px] font-medium text-ink">
                            {usd(net)}
                          </Td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </div>
            <div className="p-4 border-t border-line/50">
              <Note tone="brand">
                US GAAP Classification Standard: 1000s = Assets, 2000s = Liabilities, 3000s = Equity,
                4000s = Revenue, 5000s = Cost of Goods Sold, 6000s = Operating & Administrative
                Expenses. Sub-accounts inherit the normal balance polarity of their master group.
              </Note>
            </div>
          </Panel>
        </div>
      ) : (
        /* ================= TELA DE CADASTRO ================= */
        <div className="space-y-4 max-w-4xl mx-auto">
          {/* Top Bar with Back Button */}
          <div className="flex items-center justify-between border-b border-line/60 pb-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setView("list")}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink2 hover:bg-muted transition-colors cursor-pointer shadow-2xs"
              >
                <ArrowLeft className="size-3.5" />
                Voltar para a Listagem
              </button>
              <div>
                <h1 className="text-[16px] font-semibold text-ink">Cadastrar Conta Contábil</h1>
                <p className="text-[12px] text-ink3">
                  Configuração de nova conta contábil no Razão da empresa {activeCompany.name}
                </p>
              </div>
            </div>
          </div>

          <Panel
            title="Dados da Conta Contábil"
            subtitle="Preencha os dados normatizados conforme a estrutura US GAAP"
          >
            <form onSubmit={handleCreateAccount} className="p-6 space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Código da Conta (Account Code) *
                  </label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="Ex: 6250 ou 1050"
                    required
                    className="w-full rounded-md bg-canvas px-3 py-2 font-mono text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                  />
                  <p className="mt-1 text-[10.5px] text-ink3">
                    Recomendado: 1000s (Ativo), 2000s (Passivo), 3000s (Patrimônio), 4000s (Receita), 5000s (CPV), 6000s (Despesas).
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                    Natureza do Saldo Normal (Normal Balance) *
                  </label>
                  <select
                    value={newBalanceType}
                    onChange={(e) => setNewBalanceType(e.target.value as "Debit" | "Credit")}
                    className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  >
                    <option value="Debit">Debit (Dr) — Aumenta a Débito</option>
                    <option value="Credit">Credit (Cr) — Aumenta a Crédito</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                  Nome da Conta (Account Legal Name) *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Software & Cloud Subscriptions, Seguro Empresarial..."
                  required
                  className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                  Classificação US GAAP (Classification Type) *
                </label>
                <select
                  value={newType}
                  onChange={(e) => {
                    const t = e.target.value as AccountType;
                    setNewType(t);
                    if (["Asset", "COGS", "Operating Expense", "Other Expense"].includes(t)) {
                      setNewBalanceType("Debit");
                    } else {
                      setNewBalanceType("Credit");
                    }
                  }}
                  className="w-full rounded-md bg-canvas px-3 py-2 text-[13px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                >
                  <option value="Asset">Asset — Ativo Circulante / Não Circulante (1000s)</option>
                  <option value="Liability">Liability — Passivo Circulante / Não Circulante (2000s)</option>
                  <option value="Equity">Equity — Patrimônio Líquido e Capital Social (3000s)</option>
                  <option value="Revenue">Revenue — Receita Operacional / Vendas (4000s)</option>
                  <option value="COGS">COGS — Custo das Mercadorias / Serviços Vendidos (5000s)</option>
                  <option value="Operating Expense">Operating Expense — Despesas Operacionais / SG&A (6000s)</option>
                  <option value="Other Expense">Other Expense — Outras Despesas e Tributos (6300s)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink3 mb-1">
                  Descrição e Escopo Contábil (Accounting Description)
                </label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Defina o propósito das transações destinadas a esta conta contábil..."
                  className="w-full rounded-md bg-canvas p-3 text-[12.5px] border border-line outline-none focus:border-brand focus:ring-1 focus:ring-brand shadow-inner"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-line/60">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className="rounded-md border border-line bg-surface px-4 py-2 text-[12.5px] font-medium text-ink2 hover:bg-muted transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-brand px-5 py-2 text-[12.5px] font-semibold text-white hover:bg-brand/90 transition-colors cursor-pointer shadow-2xs"
                >
                  Salvar Conta Contábil
                </button>
              </div>
            </form>
          </Panel>
        </div>
      )}
    </div>
  );
}
