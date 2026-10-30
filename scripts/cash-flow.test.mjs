import test from "node:test";
import assert from "node:assert/strict";
import {
  summarize,
  statement,
  weeklyComparison,
  dateSchema,
  transactionSchema,
  overduePlanned,
} from "../src/lib/cash-flow-model.ts";
const account = {
  id: "a",
  name: "Conta",
  currency: "USD",
  opening_date: "2026-10-01",
  opening_balance: 100,
};
const entry = (overrides = {}) => ({
  id: "t",
  account_id: "a",
  description: "Recebimento",
  category: "Vendas",
  direction: "in",
  amount: 10.1,
  due_date: "2026-10-02",
  paid_date: "2026-10-03",
  status: "paid",
  ...overrides,
});

test("classificação US GAAP separa juros, dividendos, CapEx e principal sem compensar valores brutos", () => {
  const entries = [
    entry({ cash_flow_line: "customers", amount: 1000 }),
    entry({ cash_flow_line: "interest_received", amount: 10 }),
    entry({ cash_flow_line: "interest_paid", direction: "out", amount: 20 }),
    entry({ cash_flow_line: "dividends_received", amount: 30 }),
    entry({ cash_flow_line: "capex", direction: "out", amount: 100 }),
    entry({ cash_flow_line: "borrowings", amount: 500 }),
    entry({ cash_flow_line: "debt_principal", direction: "out", amount: 50 }),
    entry({ cash_flow_line: "dividends_paid", direction: "out", amount: 40 }),
  ];
  const report = statement([account], entries, "2026-10-01", "2026-10-31", false);
  assert.equal(report.operating, 1020);
  assert.equal(report.investing, -100);
  assert.equal(report.financing, 410);
  assert.equal(report.operating - report.capex, 920);
  assert.equal(
    report.lines.reduce((s, l) => s + l.net, 0),
    summarize([account], entries, "2026-10-01", "2026-10-31", "monthly", false).periods[0].net,
  );
  assert.equal(
    statement(
      [account],
      [entry(), entry({ account_id: "other" })],
      "2026-10-01",
      "2026-10-31",
      false,
    ).unclassifiedCount,
    1,
  );
});

test("comparativo preserva plano, inclui cancelamento e mostra atraso em semanas diferentes", () => {
  const entries = [
    entry({
      id: "late",
      forecast_amount: 100,
      forecast_date: "2026-10-02",
      forecast_direction: "in",
      amount: 80,
      paid_date: "2026-10-12",
      variance_note: "Customer delay",
    }),
    entry({
      id: "cancel",
      forecast_amount: 20,
      forecast_date: "2026-10-02",
      forecast_direction: "out",
      direction: "out",
      status: "cancelled",
      paid_date: null,
      amount: 20,
    }),
    entry({ id: "unplanned", amount: 10, paid_date: "2026-10-12" }),
  ];
  const rows = weeklyComparison([account], entries, "2026-10-01", "2026-10-31", "2026-10-26");
  assert.equal(rows[0].forecastNet, 80);
  assert.equal(rows[0].actualNet, 0);
  assert.equal(rows[0].variance, -80);
  assert.equal(rows[0].partial, true);
  assert.equal(rows[0].state, "Closed");
  assert.equal(rows[2].actualNet, 90);
  assert.equal(rows[2].forecastNet, 0);
  assert.equal(rows[2].variance, 90);
  assert.match(rows[0].notes[0], /Customer delay/);
  assert.match(rows[2].notes[0], /Customer delay/);
  assert.equal(rows.at(-1).state, "In progress");
});

test("validação impede direção incompatível e classificação desconhecida", () => {
  const valid = entry({
    id: "bbda1c08-3d13-44c0-920b-f1c67f1423ca",
    account_id: "bbda1c08-3d13-44c0-920b-f1c67f1423ca",
  });
  assert.equal(
    transactionSchema.safeParse({ ...valid, cash_flow_line: "interest_paid" }).success,
    false,
  );
  assert.equal(transactionSchema.safeParse({ ...valid, cash_flow_line: "invalid" }).success, false);
  assert.equal(
    transactionSchema.safeParse({ ...valid, cash_flow_line: "interest_received" }).success,
    true,
  );
});

test("despesas previstas entram nas saídas e reduzem o saldo projetado sem duplicar pagamentos", () => {
  const entries = [
    entry({ id: "p1", direction: "out", status: "planned", paid_date: null, amount: 100.1 }),
    entry({ id: "p2", direction: "out", status: "planned", paid_date: null, amount: 254.79 }),
    entry({ id: "paid", direction: "out", amount: 123 }),
    entry({ id: "cancelled", direction: "out", status: "cancelled", paid_date: null, amount: 999 }),
  ];
  for (const interval of ["daily", "weekly", "monthly", "quarterly", "yearly"]) {
    const projected = summarize([account], entries, "2026-10-01", "2026-10-31", interval, true);
    assert.equal(
      Math.round(projected.periods.reduce((sum, p) => sum + p.outflows, 0) * 100),
      47789,
    );
    assert.equal(projected.periods.at(-1).balance, -377.89);
    const actual = summarize([account], entries, "2026-10-01", "2026-10-31", interval, false);
    assert.equal(actual.periods.at(-1).balance, -23);
  }
  const paid = entries.map((t) =>
    t.id === "p1" ? { ...t, status: "paid", paid_date: "2026-10-04" } : t,
  );
  assert.equal(
    summarize([account], paid, "2026-10-01", "2026-10-31", "monthly", true).periods[0].outflows,
    477.89,
  );
});
test("realizado utiliza pagamento, previsto utiliza vencimento e cancelados não afetam saldo", () => {
  const entries = [
    entry(),
    entry({ id: "p", status: "planned", paid_date: null, amount: 20 }),
    entry({ id: "c", status: "cancelled", paid_date: null, amount: 999 }),
  ];
  const actual = summarize([account], entries, "2026-10-02", "2026-10-03", "daily", false);
  assert.equal(actual.opening, 100);
  assert.equal(actual.periods[0].inflows, 0);
  assert.equal(actual.periods[1].balance, 110.1);
  const forecast = summarize([account], entries, "2026-10-02", "2026-10-03", "daily", true);
  assert.equal(forecast.periods[0].inflows, 20);
  assert.equal(forecast.periods[1].balance, 130.1);
});
test("saldo inicial durante período e centavos exatos, inclusive saldo negativo", () => {
  const report = summarize(
    [{ ...account, opening_balance: -50 }],
    [entry({ amount: 0.1 }), entry({ amount: 0.2 }), entry({ direction: "out", amount: 1 })],
    "2026-10-01",
    "2026-10-31",
    "monthly",
    false,
  );
  assert.equal(report.opening, 0);
  assert.equal(report.periods[0].adjustments, -50);
  assert.equal(report.periods[0].balance, -50.7);
});
test("saldo anterior inclui todo histórico anterior ao filtro", () => {
  const report = summarize([account], [entry()], "2026-10-10", "2026-10-10", "daily", false);
  assert.equal(report.opening, 110.1);
  assert.equal(report.periods[0].balance, 110.1);
});
test("agrupamentos preservam totais e segunda-feira define semana", () => {
  const entries = [
    entry(),
    entry({ due_date: "2026-11-01", paid_date: "2026-11-01", direction: "out", amount: 5 }),
  ];
  for (const interval of ["daily", "weekly", "monthly", "quarterly", "yearly"]) {
    const report = summarize([account], entries, "2026-10-01", "2026-12-31", interval, false);
    assert.equal(report.periods.at(-1).balance, 105.1);
    assert.equal(
      report.periods.reduce((s, p) => s + p.inflows, 0),
      10.1,
    );
  }
  assert.equal(
    summarize([account], entries, "2026-10-03", "2026-10-04", "weekly", false).periods[0].label,
    "2026-09-28",
  );
});
test("período vazio e contas futuras não fabricam saldo", () => {
  assert.equal(summarize([], [], "2026-10-01", "2026-10-01", "daily", true).periods[0].balance, 0);
  assert.equal(
    summarize(
      [{ ...account, opening_date: "2027-01-01" }],
      [],
      "2026-10-01",
      "2026-10-31",
      "monthly",
      false,
    ).periods[0].balance,
    0,
  );
});
test("validação rejeita datas inexistentes, valor inválido e pagamento inconsistente", () => {
  assert.equal(dateSchema.safeParse("2026-02-30").success, false);
  const valid = entry({
    id: "bbda1c08-3d13-44c0-920b-f1c67f1423ca",
    account_id: "bbda1c08-3d13-44c0-920b-f1c67f1423ca",
  });
  assert.equal(transactionSchema.safeParse(valid).success, true);
  for (const changes of [
    { amount: 0 },
    { amount: 1.111 },
    { status: "paid", paid_date: null },
    { status: "planned", paid_date: "2026-10-03" },
  ])
    assert.equal(transactionSchema.safeParse({ ...valid, ...changes }).success, false);
});

test("cada linha reconcilia saldo anterior, abertura de contas e movimentações", () => {
  const accounts = [
    account,
    { ...account, id: "b", opening_date: "2026-10-05", opening_balance: 50 },
  ];
  const entries = [
    entry(),
    entry({ account_id: "b", paid_date: "2026-10-06", direction: "out", amount: 20 }),
  ];
  for (const interval of ["daily", "weekly", "monthly", "quarterly", "yearly"]) {
    const report = summarize(accounts, entries, "2026-10-02", "2026-11-01", interval, false);
    let previous = report.opening;
    for (const row of report.periods) {
      assert.equal(row.openingBalance, previous);
      assert.equal(
        Math.round(row.balance * 100),
        Math.round(row.openingBalance * 100) +
          Math.round(row.adjustments * 100) +
          Math.round(row.inflows * 100) -
          Math.round(row.outflows * 100),
      );
      previous = row.balance;
    }
    assert.equal(previous, 140.1);
  }
});

test("lançamentos de contas fora da seleção ou anteriores à abertura não afetam saldos", () => {
  const report = summarize(
    [account],
    [entry({ account_id: "other" }), entry({ paid_date: "2026-09-30" })],
    "2026-10-01",
    "2026-10-31",
    "monthly",
    false,
  );
  assert.equal(report.opening, 0);
  assert.equal(report.periods[0].inflows, 0);
  assert.equal(report.periods[0].balance, 100);
});

test("previstos vencidos não entram no saldo-base do forecast e aparecem como pendências", () => {
  const entries = [
    entry({ id: "late", status: "planned", paid_date: null, due_date: "2026-10-05", amount: 500 }),
    entry({ id: "next", status: "planned", paid_date: null, due_date: "2026-10-20", amount: 40 }),
    entry({ id: "paid", paid_date: "2026-10-03" }),
  ];
  const forecast = summarize(
    [account],
    entries,
    "2026-10-15",
    "2026-10-31",
    "monthly",
    true,
    "2026-10-15",
  );
  assert.equal(forecast.opening, 110.1);
  assert.equal(forecast.periods[0].inflows, 40);
  assert.equal(forecast.periods.at(-1).balance, 150.1);
  const pending = overduePlanned([account], entries, "2026-10-15");
  assert.deepEqual(
    pending.map((t) => t.id),
    ["late"],
  );
  // A future period starts from actual cash plus plans expected between as-of and the start.
  const future = summarize(
    [account],
    entries,
    "2026-11-01",
    "2026-11-30",
    "monthly",
    true,
    "2026-10-15",
  );
  assert.equal(future.opening, 150.1);
  const direct = statement([account], entries, "2026-10-01", "2026-10-31", true, "2026-10-15");
  assert.equal(direct.lines.find((l) => l.key === "unclassified").inflows, 50.1);
});

test("transferência interna não infla entradas/saídas no escopo com ambas as contas", () => {
  const other = { ...account, id: "b", opening_balance: 0 };
  const legs = [
    entry({
      id: "t1",
      direction: "out",
      amount: 60,
      cash_flow_line: "internal_transfer",
      transfer_account_id: "b",
    }),
    entry({
      id: "t2",
      account_id: "b",
      amount: 60,
      cash_flow_line: "internal_transfer",
      transfer_account_id: "a",
    }),
  ];
  const both = summarize([account, other], legs, "2026-10-01", "2026-10-31", "monthly", false);
  assert.equal(both.periods[0].inflows, 0);
  assert.equal(both.periods[0].outflows, 0);
  assert.equal(both.periods[0].balance, 100);
  const joint = statement([account, other], legs, "2026-10-01", "2026-10-31", false);
  assert.equal(joint.transfers, 0);
  assert.equal(joint.lines.find((l) => l.key === "internal_transfer").count, 0);
  // A single account keeps its own movement, outside operating/investing/financing.
  const single = summarize([account], legs, "2026-10-01", "2026-10-31", "monthly", false);
  assert.equal(single.periods[0].outflows, 60);
  assert.equal(single.periods[0].balance, 40);
  const own = statement([account], legs, "2026-10-01", "2026-10-31", false);
  assert.equal(own.transfers, -60);
  assert.equal(own.operating + own.investing + own.financing, 0);
});

test("validação exige conta de contrapartida distinta apenas para transferências", () => {
  const id = "bbda1c08-3d13-44c0-920b-f1c67f1423ca";
  const other = "0f4c7f3e-6a3a-4c1e-9d55-2f1f0f6c9a11";
  const valid = entry({ id, account_id: id });
  const transfer = { ...valid, cash_flow_line: "internal_transfer" };
  assert.equal(
    transactionSchema.safeParse({ ...transfer, transfer_account_id: other }).success,
    true,
  );
  assert.equal(transactionSchema.safeParse(transfer).success, false);
  assert.equal(
    transactionSchema.safeParse({ ...transfer, transfer_account_id: id }).success,
    false,
  );
  assert.equal(
    transactionSchema.safeParse({ ...valid, transfer_account_id: other }).success,
    false,
  );
});
