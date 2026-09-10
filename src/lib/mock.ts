export type Client = {
  id: string;
  initials: string;
  name: string;
  ein: string;
  entity: "LLC" | "C-Corp" | "S-Corp";
  basis: "Accrual" | "Cash";
  state: string;
  factor: number;
};

export const clients: Client[] = [
  {
    id: "harbor-ridge",
    initials: "HR",
    name: "Harbor Ridge LLC",
    ein: "84-2201987",
    entity: "LLC",
    basis: "Accrual",
    state: "FL",
    factor: 1,
  },
  {
    id: "meridian-labs",
    initials: "ML",
    name: "Meridian Labs Inc.",
    ein: "88-4410233",
    entity: "C-Corp",
    basis: "Accrual",
    state: "TX",
    factor: 1.84,
  },
  {
    id: "cedar-vine",
    initials: "CV",
    name: "Cedar & Vine LLC",
    ein: "82-7719045",
    entity: "S-Corp",
    basis: "Cash",
    state: "CA",
    factor: 0.42,
  },
];

export const period = { label: "Dec 2026", code: "2026-12", base: "USD" };

const s = (n: number, f: number) => Math.round(n * f * 100) / 100;

export type Book = ReturnType<typeof getBook>;

export function getClient(id: string) {
  return clients.find((c) => c.id === id) ?? clients[0];
}

export function getBook(clientId: string) {
  const c = getClient(clientId);
  const f = c.factor;

  const revenue = s(128740, f);
  const cogs = s(41220, f);
  const selling = s(18440, f);
  const admin = s(31548.75, f);
  const fxGain = s(35.04, f);
  const expenses = cogs + selling + admin;
  const netIncome = Math.round((revenue - expenses + fxGain) * 100) / 100;

  return {
    client: c,
    kpis: {
      cash: s(84312.5, f),
      cashDelta: s(6204.18, f),
      revenue,
      revenueDelta: 8.4,
      expenses,
      expensesDelta: 3.1,
      netIncome,
      margin: (netIncome / revenue) * 100,
    },
    journalEntry: {
      id: "JE-2026-0482",
      date: "2026-12-18",
      memo: "Faturamento de serviços — Northgate Supply Co.",
      lines: [
        { date: "12-18", account: "Accounts Receivable · 1100", debit: s(12480, f), credit: 0 },
        { date: "12-18", account: "Service Revenue · 4000", debit: 0, credit: s(12480, f) },
      ],
    },
    journals: [
      {
        id: "JE-2026-0482",
        date: "2026-12-18",
        memo: "Faturamento INV-1048",
        currency: "USD",
        amount: s(12480, f),
        status: "Posted" as const,
      },
      {
        id: "JE-2026-0481",
        date: "2026-12-17",
        memo: "Pagamento fornecedor MXN — Baja Components",
        currency: "MXN",
        amount: s(8420.55, f),
        status: "Posted" as const,
      },
      {
        id: "JE-2026-0480",
        date: "2026-12-15",
        memo: "Folha de pagamento quinzenal",
        currency: "USD",
        amount: s(18200, f),
        status: "Posted" as const,
      },
      {
        id: "JE-2026-0479",
        date: "2026-12-14",
        memo: "Variação cambial automática · 6300",
        currency: "USD",
        amount: s(35.04, f),
        status: "Auto" as const,
      },
      {
        id: "JE-2026-0478",
        date: "2026-12-12",
        memo: "Aluguel de escritório",
        currency: "USD",
        amount: s(4500, f),
        status: "Posted" as const,
      },
      {
        id: "JE-2026-0477",
        date: "2026-12-10",
        memo: "Compra de estoque — Pemberton Freight",
        currency: "GBP",
        amount: s(9180, f),
        status: "Draft" as const,
      },
    ],
    accounts: [
      { code: "1000", name: "Cash — Operating", type: "Asset", debit: s(84312.5, f), credit: 0 },
      { code: "1100", name: "Accounts Receivable", type: "Asset", debit: s(61200, f), credit: 0 },
      { code: "1300", name: "Inventory", type: "Asset", debit: s(38940, f), credit: 0 },
      { code: "2000", name: "Accounts Payable", type: "Liability", debit: 0, credit: s(29480, f) },
      { code: "2200", name: "Sales Tax Payable", type: "Liability", debit: 0, credit: s(4128.6, f) },
      { code: "3000", name: "Owner's Equity", type: "Equity", debit: 0, credit: s(83513.65, f) },
      { code: "4000", name: "Service Revenue", type: "Revenue", debit: 0, credit: s(96540, f) },
      { code: "4100", name: "Product Revenue", type: "Revenue", debit: 0, credit: s(32200, f) },
      { code: "5000", name: "Cost of Goods Sold", type: "Expense", debit: cogs, credit: 0 },
      { code: "6100", name: "Selling & Marketing", type: "Expense", debit: selling, credit: 0 },
      { code: "6200", name: "General & Administrative", type: "Expense", debit: admin, credit: 0 },
      { code: "6300", name: "Foreign Exchange Gain/Loss", type: "Expense", debit: 0, credit: fxGain },
    ],
    fx: {
      account: "6300 · Foreign Exchange Gain/Loss",
      lines: [
        { currency: "CAD", txns: 4, amount: s(142.66, f), rate: 1.3612 },
        { currency: "MXN", txns: 11, amount: s(-388.2, f), rate: 17.184 },
        { currency: "GBP", txns: 3, amount: s(210.5, f), rate: 0.7902 },
        { currency: "EUR", txns: 2, amount: s(70.08, f), rate: 0.9214 },
      ],
      net: fxGain,
    },
    invoices: [
      {
        id: "INV-1048",
        client: "Northgate Supply Co.",
        kind: "Serviço",
        tax: "6.5%",
        amount: s(18240, f),
        due: "2026-12-05",
        status: "Paid" as const,
      },
      {
        id: "INV-1049",
        client: "Meridian Labs Inc.",
        kind: "Produto",
        tax: "Tax exempt",
        amount: s(42000, f),
        due: "2027-01-10",
        status: "Open" as const,
      },
      {
        id: "INV-1050",
        client: "Cedar & Vine LLC",
        kind: "Serviço",
        tax: "8.25%",
        amount: s(3760.4, f),
        due: "2026-12-12",
        status: "Paid" as const,
      },
      {
        id: "INV-1051",
        client: "Pemberton Freight",
        kind: "Produto",
        tax: "4.0%",
        amount: s(9180, f),
        due: "2026-11-28",
        status: "Overdue" as const,
      },
      {
        id: "INV-1052",
        client: "Solano Retail Group",
        kind: "Produto",
        tax: "8.0%",
        amount: s(6420, f),
        due: "2027-01-18",
        status: "Draft" as const,
      },
    ],
    payables: [
      {
        vendor: "Baja Components S.A.",
        ref: "BILL-3391",
        currency: "MXN",
        amount: s(8420.55, f),
        due: "2026-12-28",
        aging: "Current",
      },
      {
        vendor: "Atlas Logistics",
        ref: "BILL-3384",
        currency: "USD",
        amount: s(5120, f),
        due: "2026-12-20",
        aging: "Current",
      },
      {
        vendor: "Rowan Legal LLP",
        ref: "BILL-3370",
        currency: "USD",
        amount: s(3800, f),
        due: "2026-12-02",
        aging: "16-30 dias",
      },
      {
        vendor: "Sterling Print Co.",
        ref: "BILL-3362",
        currency: "GBP",
        amount: s(2140, f),
        due: "2026-11-20",
        aging: "31-60 dias",
      },
      {
        vendor: "Cloudline Hosting",
        ref: "BILL-3355",
        currency: "USD",
        amount: s(9999.45, f),
        due: "2026-12-30",
        aging: "Current",
      },
    ],
    receivables: [
      {
        client: "Meridian Labs Inc.",
        ref: "INV-1049",
        amount: s(42000, f),
        due: "2027-01-10",
        aging: "Current",
      },
      {
        client: "Pemberton Freight",
        ref: "INV-1051",
        amount: s(9180, f),
        due: "2026-11-28",
        aging: "16-30 dias",
      },
      {
        client: "Harbor Foods LLC",
        ref: "INV-1044",
        amount: s(6420, f),
        due: "2026-11-02",
        aging: "31-60 dias",
      },
      {
        client: "Solano Retail Group",
        ref: "INV-1041",
        amount: s(3600, f),
        due: "2026-10-14",
        aging: "60+ dias",
      },
    ],
    inventory: [
      {
        sku: "HR-1001",
        item: "Marine hardware kit",
        qty: 148,
        cost: 62.4,
        method: "FIFO",
        value: s(9235.2, f),
      },
      {
        sku: "HR-1044",
        item: "Composite deck panel",
        qty: 92,
        cost: 128.5,
        method: "FIFO",
        value: s(11822, f),
      },
      {
        sku: "HR-2010",
        item: "Stainless fastener set",
        qty: 610,
        cost: 8.9,
        method: "Média ponderada",
        value: s(5429, f),
      },
      {
        sku: "HR-3300",
        item: "Teak trim (linear ft)",
        qty: 1240,
        cost: 10.05,
        method: "Média ponderada",
        value: s(12462, f),
      },
    ],
    dre: [
      { line: "Service Revenue", level: 1, debit: 0, credit: s(96540, f) },
      { line: "Product Revenue", level: 1, debit: 0, credit: s(32200, f) },
      { line: "Cost of Goods Sold", level: 2, debit: cogs, credit: 0 },
      { line: "Selling & Marketing", level: 2, debit: selling, credit: 0 },
      { line: "General & Administrative", level: 2, debit: admin, credit: 0 },
      { line: "Foreign Exchange Gain", level: 2, debit: 0, credit: fxGain },
    ],
    dreTotals: { revenue, expenses, netIncome },
    cashFlow: [
      { line: "Caixa inicial", amount: s(78108.32, f), kind: "opening" as const },
      { line: "Recebimentos de clientes", amount: s(121300, f), kind: "in" as const },
      { line: "Pagamentos a fornecedores", amount: s(-58420, f), kind: "out" as const },
      { line: "Folha de pagamento", amount: s(-36400, f), kind: "out" as const },
      { line: "Despesas administrativas", amount: s(-20240.86, f), kind: "out" as const },
      { line: "Variação cambial realizada", amount: s(-34.96, f), kind: "out" as const },
      { line: "Caixa final", amount: s(84312.5, f), kind: "closing" as const },
    ],
    taxes: [
      {
        jurisdiction: "Florida DOR · Sales Tax",
        period: "Nov 2026",
        base: s(48200, f),
        rate: "6.0% + 1.0%",
        due: s(3374, f),
        status: "Pago" as const,
        receipt: "receipt-fl-nov26.pdf",
      },
      {
        jurisdiction: "Florida DOR · Sales Tax",
        period: "Dec 2026",
        base: s(52480, f),
        rate: "6.0% + 1.0%",
        due: s(3673.6, f),
        status: "A pagar" as const,
        receipt: "—",
      },
      {
        jurisdiction: "IRS · Federal Estimated",
        period: "Q4 2026",
        base: s(37531.25, f),
        rate: "21.0%",
        due: s(7881.56, f),
        status: "A pagar" as const,
        receipt: "—",
      },
    ],
    statements: [
      {
        file: "chase-operating-2026-11.ofx",
        account: "Chase · Operating ••4471",
        rows: 84,
        uploaded: "2026-12-02",
        status: "Conciliado" as const,
      },
      {
        file: "chase-operating-2026-12.csv",
        account: "Chase · Operating ••4471",
        rows: 61,
        uploaded: "2026-12-19",
        status: "Aguardando classificação" as const,
      },
      {
        file: "amex-business-2026-12.pdf",
        account: "Amex · Business ••2019",
        rows: 37,
        uploaded: "2026-12-19",
        status: "Aguardando classificação" as const,
      },
    ],
    unclassified: [
      { date: "2026-12-02", memo: "BAJA COMPONENTS MXN WIRE", amount: s(-8420.55, f), suggestion: "5000 · Cost of Goods Sold" },
      { date: "2026-12-08", memo: "STRIPE PAYOUT 8842", amount: s(14210, f), suggestion: "4000 · Service Revenue" },
      { date: "2026-12-12", memo: "HARBOR PROPERTY MGMT", amount: s(-4500, f), suggestion: "6200 · General & Administrative" },
      { date: "2026-12-15", memo: "GUSTO PAYROLL", amount: s(-18200, f), suggestion: "6200 · General & Administrative" },
    ],
  };
}

export const roles = [
  {
    name: "Administrador",
    scope: "Interno",
    members: 1,
    modules: ["Lançamentos", "Faturas", "Estoque", "A pagar", "A receber", "Relatórios", "Impostos", "Acessos"],
  },
  {
    name: "Contador assistente",
    scope: "Interno",
    members: 2,
    modules: ["Lançamentos", "Faturas", "A pagar", "A receber", "Relatórios"],
  },
  {
    name: "Cliente (portal)",
    scope: "Externo",
    members: 4,
    modules: ["Relatórios", "Envio de extratos"],
  },
];

export const users = [
  { name: "Carlos A.", email: "carlos@ledgerx.us", role: "Administrador", client: "Todos", active: true },
  { name: "Renata M.", email: "renata@ledgerx.us", role: "Contador assistente", client: "Todos", active: true },
  { name: "Dan Whitfield", email: "dan@harborridge.com", role: "Cliente (portal)", client: "Harbor Ridge LLC", active: true },
  { name: "Aiko Tanaka", email: "aiko@meridianlabs.com", role: "Cliente (portal)", client: "Meridian Labs Inc.", active: false },
];
