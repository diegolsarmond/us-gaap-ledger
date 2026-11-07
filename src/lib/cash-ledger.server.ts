import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { CompanyState } from "./accounting-engine";
import { bankSourceAccount } from "./bank-feed-model";
import type { CashAccount, CashTransaction } from "./cash-flow-model";
import { postedLedgerLines } from "./posted-ledger.server";

type CashLine = {
  id: string;
  sequence: number;
  account_code: string;
  date: string;
  description: string;
  opening: boolean;
  source_type: string;
  currency: string;
  base: number;
  native: number;
  legacy_currency: string | null;
  payment_currency: string | null;
  payment_amount: number | null;
};

// An account discovered in the ledger can be selected in reports before it has a
// Cash Flow configuration. Its identifier is stable across reads.
function ledgerAccountId(companyId: string, code: string, currency: string) {
  const hash = createHash("sha256").update(JSON.stringify([companyId, code, currency])).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function cashAmount(line: CashLine, currency: string) {
  if (currency === "USD") return line.base;
  if (line.legacy_currency === null && line.currency === currency) return line.native;
  if (line.payment_currency === currency && line.payment_amount !== null)
    return Math.sign(line.base) * line.payment_amount;
  return 0;
}

export async function cashFromLedger(
  client: Pick<PoolClient, "query">,
  companyId: string,
  chart: CompanyState["accounts"],
  configured: CashAccount[],
  manual: CashTransaction[],
) {
  const codes = new Set(configured.flatMap((a) => (a.gl_account_code ? [a.gl_account_code] : [])));
  for (const account of chart)
    if (account.type === "Asset" && bankSourceAccount(account, chart)) codes.add(account.code);

  const [postings, statementCurrencies] = await Promise.all([
    client.query<CashLine>(
      `WITH posted AS (${postedLedgerLines})
       SELECT p.id,sequence,account_code,p.date::text,coalesce(nullif(line_description,''),description) AS description,
              opening,source_type,currency,(debit-credit)::float8 AS base,
              (original_debit-original_credit)::float8 AS native,legacy_currency,
              payment.transaction_currency AS payment_currency,payment.amount::float8 AS payment_amount
       FROM posted p
       LEFT JOIN LATERAL (
         SELECT transaction_currency, transaction_amount-coalesce(discount_amount,0) AS amount
         FROM (
           SELECT company_id,journal_id,transaction_currency,transaction_amount,discount_amount,cash_functional_amount,functional_amount
           FROM ledger_invoices_payments WHERE company_id=$1 AND journal_id=p.journal_id
           UNION ALL
           SELECT company_id,journal_id,transaction_currency,transaction_amount,discount_amount,cash_functional_amount,functional_amount
           FROM ledger_bills_payments WHERE company_id=$1 AND journal_id=p.journal_id
         ) payments
         WHERE p.legacy_currency IS NOT NULL AND p.source_type='Payment'
           AND coalesce(cash_functional_amount,functional_amount)=abs(p.debit-p.credit)
         LIMIT 1
       ) payment ON true
       WHERE p.account_code=ANY($2::text[])
       ORDER BY p.date,p.id,p.sequence`,
      [companyId, [...codes]],
    ),
    client.query<{ account: string; currency: string }>(
      "SELECT DISTINCT account_code AS account, feed_currency AS currency FROM ledger_statements WHERE company_id=$1",
      [companyId],
    ),
  ]);
  const bankCurrencies = new Map(statementCurrencies.rows.map((row) => [row.account, row.currency]));
  const linesByAccount = new Map<string, CashLine[]>();
  for (const line of postings.rows) {
    const lines = linesByAccount.get(line.account_code) ?? [];
    lines.push(line);
    linesByAccount.set(line.account_code, lines);
  }
  const accounts = configured.map((a) => ({ ...a }));
  const active = new Map<string, CashAccount>();
  for (const item of chart) {
    if (!codes.has(item.code) || item.type !== "Asset") continue;
    const links = accounts.filter((a) => a.gl_account_code === item.code);
    const currency =
      item.sourceAccount?.currency ?? bankCurrencies.get(item.code) ?? links[0]?.currency ?? "USD";
    const matching = links.filter((a) => a.currency === currency);
    const first = linesByAccount.get(item.code)?.find((line) => cashAmount(line, currency) !== 0);
    if (!first) continue;
    // A journal line cannot be allocated across several management accounts without an explicit split.
    const account: CashAccount =
      matching.length === 1
        ? matching[0]!
        : {
            id: ledgerAccountId(companyId, item.code, currency),
            name: item.name,
            currency,
            opening_date: first.date,
            opening_balance: 0,
            gl_account_code: item.code,
            ledger_only: true,
          };
    if (account.ledger_only) accounts.push(account);
    for (const linked of [...matching, account])
      linked.ledger_opening_date = first.date < linked.opening_date ? first.date : linked.opening_date;
    active.set(item.code, account);
  }

  const actuals: CashTransaction[] = [];
  const journalCash = new Map<string, CashTransaction[]>();
  for (const line of postings.rows) {
    const account = active.get(line.account_code);
    if (!account) continue;
    const amount = cashAmount(line, account.currency);
    if (!amount) continue;
    const adjustment =
      line.opening || line.source_type === "FXRevaluation" || line.source_type === "FXReversal";
    const entry: CashTransaction = {
      id: `ledger:${line.id}:${line.sequence}`,
      account_id: account.id,
      description: line.description,
      category: adjustment ? "Ledger balance adjustment" : "General Ledger",
      direction: amount > 0 ? "in" : "out",
      amount: Math.abs(amount),
      due_date: line.date,
      paid_date: line.date,
      status: "paid",
      cash_flow_line: "unclassified",
      variance_note: "",
      gl_account_code: account.gl_account_code,
      transfer_account_id: null,
      ledger_posted: true,
      ...(adjustment ? { balance_adjustment: true } : {}),
    };
    actuals.push(entry);
    if (!adjustment) {
      const legs = journalCash.get(line.id) ?? [];
      legs.push(entry);
      journalCash.set(line.id, legs);
    }
  }
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  for (const legs of journalCash.values()) {
    const [a, b] = legs;
    if (
      legs.length !== 2 || !a || !b || a.account_id === b.account_id ||
      a.direction === b.direction || a.amount !== b.amount ||
      accountById.get(a.account_id)?.currency !== accountById.get(b.account_id)?.currency
    ) continue;
    a.cash_flow_line = b.cash_flow_line = "internal_transfer";
    a.transfer_account_id = b.account_id;
    b.transfer_account_id = a.account_id;
  }

  // Keep manual records and their forecast baseline, while using one source for actuals.
  const transactions = manual.map((t): CashTransaction => {
    const account = accountById.get(t.account_id);
    const ledgerAccount = account?.gl_account_code && active.get(account.gl_account_code);
    return t.status === "paid" && ledgerAccount && ledgerAccount.currency === account?.currency
      ? { ...t, reference_only: true }
      : t;
  });
  return {
    accounts,
    transactions: [...transactions, ...actuals].sort((a, b) => b.due_date.localeCompare(a.due_date)),
  };
}
