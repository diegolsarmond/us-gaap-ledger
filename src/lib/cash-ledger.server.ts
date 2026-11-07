import type { PoolClient } from "pg";
import type { CompanyState } from "./accounting-engine";
import { bankSourceAccount } from "./bank-feed-model";
import { classifyCashMovement } from "./cash-flow-classification";
import type {
  CashAccount,
  CashFlowLine,
  CashFlowMapping,
  CashTransaction,
} from "./cash-flow-model";
import { postedLedgerLines } from "./posted-ledger.server";

type LedgerLine = {
  id: string;
  number: string | null;
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
export type CashOverride = {
  journal_id: string;
  line_sequence: number;
  counterpart_code: string;
  cash_flow_line: CashFlowLine;
};

/** The bank and cash accounts of the Chart of Accounts, the only accounts Cash Flow reports. */
export function cashGlAccounts(chart: CompanyState["accounts"]) {
  return chart.filter((a) => a.type === "Asset" && bankSourceAccount(a, chart));
}

/** Cash accounts with their currency: the bank setup, else the single statement currency. */
export async function readCashAccounts(
  client: Pick<PoolClient, "query">,
  companyId: string,
  chart: CompanyState["accounts"],
): Promise<CashAccount[]> {
  const statementCurrencies = await client.query<{ account: string; currency: string }>(
    `SELECT account_code AS account, min(feed_currency) AS currency
     FROM ledger_statements WHERE company_id=$1 GROUP BY account_code
     HAVING count(DISTINCT feed_currency)=1`,
    [companyId],
  );
  const feedCurrency = new Map(statementCurrencies.rows.map((r) => [r.account, r.currency]));
  return cashGlAccounts(chart).map((a) => ({
    id: a.code,
    name: a.name,
    currency: a.sourceAccount?.currency ?? feedCurrency.get(a.code) ?? "USD",
    first_posting: null,
  }));
}

function cashAmount(line: LedgerLine, currency: string) {
  if (currency === "USD") return line.base;
  if (line.legacy_currency === null && line.currency === currency) return line.native;
  if (line.payment_currency === currency && line.payment_amount !== null)
    return Math.sign(line.base) * line.payment_amount;
  return 0;
}

/** Splits `total` cents across weights; the last share takes the rounding remainder. */
function allocate(total: number, weights: number[]) {
  const sum = weights.reduce((s, w) => s + w, 0);
  let left = total;
  return weights.map((weight, i) => {
    if (i === weights.length - 1) return left;
    const share = Math.round((total * weight) / sum);
    left -= share;
    return share;
  });
}

/**
 * Actual cash read from the General Ledger.
 *
 * Every posted line on a bank or cash account is a cash movement. Its counterparts are the
 * other lines of the journal moving the opposite way (or all other lines when none does);
 * the cash amount is split across them in proportion to their amounts, so a journal paying
 * several expenses yields one classified movement per expense. A counterpart that is another
 * cash account makes the movement an internal transfer. Opening journals and FX remeasurement
 * change the balance without being cash flows.
 */
export async function cashFromLedger(
  client: Pick<PoolClient, "query">,
  companyId: string,
  chart: CompanyState["accounts"],
  mappings: CashFlowMapping[],
  overrides: CashOverride[],
) {
  const accounts = await readCashAccounts(client, companyId, chart);
  const codes = accounts.map((a) => a.id);
  const [postings] = await Promise.all([
    client.query<LedgerLine>(
      `WITH posted AS (${postedLedgerLines}),
       cash_journals AS (SELECT DISTINCT id FROM posted WHERE account_code=ANY($2::text[]))
       SELECT p.id,p.number::text AS number,sequence,account_code,p.date::text,
              coalesce(nullif(line_description,''),description) AS description,
              opening,source_type,currency,(debit-credit)::float8 AS base,
              (original_debit-original_credit)::float8 AS native,legacy_currency,
              payment.transaction_currency AS payment_currency,payment.amount::float8 AS payment_amount
       FROM posted p
       LEFT JOIN LATERAL (
         SELECT transaction_currency, transaction_amount-coalesce(discount_amount,0) AS amount
         FROM (
           SELECT transaction_currency,transaction_amount,discount_amount,cash_functional_amount,functional_amount
           FROM ledger_invoices_payments WHERE company_id=$1 AND journal_id=p.journal_id
           UNION ALL
           SELECT transaction_currency,transaction_amount,discount_amount,cash_functional_amount,functional_amount
           FROM ledger_bills_payments WHERE company_id=$1 AND journal_id=p.journal_id
         ) payments
         WHERE p.legacy_currency IS NOT NULL AND p.source_type='Payment'
           AND coalesce(cash_functional_amount,functional_amount)=abs(p.debit-p.credit)
         LIMIT 1
       ) payment ON true
       WHERE p.id IN (SELECT id FROM cash_journals)
       ORDER BY p.date,p.id,p.sequence`,
      [companyId, codes],
    ),
  ]);
  const accountByCode = new Map(accounts.map((a) => [a.id, a]));
  const chartByCode = new Map(chart.map((a) => [a.code, a]));
  const mappingByCode = new Map(mappings.map((m) => [m.account_code, m]));
  const overrideByKey = new Map(
    overrides.map((o) => [`${o.journal_id}|${o.line_sequence}|${o.counterpart_code}`, o]),
  );

  const journals = new Map<string, LedgerLine[]>();
  for (const line of postings.rows) journals.set(line.id, [...(journals.get(line.id) ?? []), line]);

  const transactions: CashTransaction[] = [];
  for (const lines of journals.values())
    for (const line of lines) {
      const account = accountByCode.get(line.account_code);
      if (!account) continue;
      const amount = cashAmount(line, account.currency);
      if (!amount) continue;
      if (!account.first_posting || line.date < account.first_posting)
        account.first_posting = line.date;
      const direction = amount > 0 ? "in" : "out";
      const base = {
        source: "ledger" as const,
        account_id: account.id,
        description: line.description,
        direction,
        due_date: line.date,
        paid_date: line.date,
        status: "paid" as const,
        variance_note: "",
        journal: { id: line.id, number: line.number, sequence: line.sequence },
      } satisfies Partial<CashTransaction>;
      const adjustment =
        line.opening || line.source_type === "FXRevaluation" || line.source_type === "FXReversal";
      // Counterpart weights by account: lines moving the opposite way, else every other line.
      const others = lines.filter((l) => l !== line && l.base !== 0);
      const opposite = others.filter((l) => Math.sign(l.base) !== Math.sign(line.base));
      const weights = new Map<string, number>();
      for (const l of opposite.length ? opposite : others)
        weights.set(l.account_code, (weights.get(l.account_code) ?? 0) + Math.abs(l.base));
      if (adjustment || !weights.size) {
        transactions.push({
          ...base,
          id: `ledger:${line.id}:${line.sequence}`,
          counterpart_code: null,
          amount: Math.abs(amount),
          cash_flow_line: "unclassified",
          classified_by: "default",
          transfer_account_id: null,
          ...(adjustment ? { balance_adjustment: true as const } : {}),
        });
        continue;
      }
      const counterparts = [...weights.keys()];
      const shares = allocate(
        Math.round(Math.abs(amount) * 100),
        counterparts.map((c) => weights.get(c)!),
      );
      counterparts.forEach((counterpart, i) => {
        if (!shares[i]) return;
        const transfer = accountByCode.has(counterpart);
        const override = overrideByKey.get(`${line.id}|${line.sequence}|${counterpart}`);
        const classified = transfer
          ? { line: "internal_transfer" as const, by: "default" as const }
          : classifyCashMovement(
              direction,
              chartByCode.get(counterpart),
              mappingByCode.get(counterpart),
            );
        transactions.push({
          ...base,
          id: `ledger:${line.id}:${line.sequence}:${counterpart}`,
          counterpart_code: counterpart,
          amount: shares[i]! / 100,
          cash_flow_line: override && !transfer ? override.cash_flow_line : classified.line,
          classified_by: override && !transfer ? "override" : classified.by,
          transfer_account_id: transfer ? counterpart : null,
        });
      });
    }
  return { accounts, transactions };
}
