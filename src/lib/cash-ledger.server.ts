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
import { externalAccount, quickBooksSourceStatus } from "./statement-csv";

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
          ...(line.opening ? { opening: true as const } : {}),
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
  const history = await cashFromQuickBooks(
    client,
    companyId,
    accounts,
    chart,
    (counterpart, direction, rowId, posting) => {
      const override = overrideByKey.get(`${quickBooksMovementId(rowId)}|0|${counterpart ?? ""}`);
      if (override) return { line: override.cash_flow_line, by: "override" as const };
      if (counterpart)
        return classifyCashMovement(
          direction,
          chartByCode.get(counterpart),
          mappingByCode.get(counterpart),
        );
      return { line: quickBooksTypeLine(posting, direction), by: "default" as const };
    },
  );
  return { accounts, ...withQuickBooksHistory(transactions, history) };
}

/** Movement id that overrides of a QuickBooks history line use as journal_id (sequence 0). */
export const quickBooksMovementId = (rowId: string) => `qb:${rowId}`;

/**
 * Bank Feed lines already posted in QuickBooks, on any account ($1 is the company). A line
 * sent to the ledger from the Bank Feed, or returned to Pending there, is left out: the ledger
 * or the Pending tab owns it.
 */
export const quickBooksHistoryLines = `
  SELECT r.id, f.account_code AS account, r.date::text, r.description, r.amount::float8,
         f.feed_source_format AS format, r.feed_external_posting AS posting,
         r.feed_source_status AS "reportedStatus"
  FROM ledger_stagingrows r
  JOIN ledger_statements f ON (f.company_id,f.id)=(r.company_id,r.file_id)
  WHERE r.company_id=$1 AND r.status='Pending' AND r.feed_exclusion IS NULL
    AND (r.feed_source_status='Posted' OR
         (r.feed_source_status IS NULL AND r.feed_external_posting<>''))
    AND NOT EXISTS (SELECT 1 FROM bank_feed_attempts a WHERE (a.company_id,a.row_id)=(r.company_id,r.id)
                    AND a.state IN ('pending','posted'))
    AND NOT EXISTS (SELECT 1 FROM system_audit_events e
                    WHERE e.company_id=r.company_id AND e.entity='BankFeed' AND e.target_id=r.id
                      AND e.action IN ('BANK_FEED_UNDO_SOURCE','BANK_FEED_UNDO','BANK_FEED_UNMATCH'))`;

type HistoryRow = {
  id: string;
  account: string;
  date: string;
  description: string;
  amount: number;
  format: Parameters<typeof quickBooksSourceStatus>[0];
  reportedStatus: Parameters<typeof quickBooksSourceStatus>[2];
  posting: string;
};

/** The GL account a QuickBooks posting label names, through Bank Feed mappings or the COA. */
function quickBooksCounterpart(
  posting: string,
  chart: CompanyState["accounts"],
  feedMappings: Map<string, string>,
) {
  const number = externalAccount(posting);
  if (!number) return null;
  const mapped = feedMappings.get(number);
  if (mapped) return mapped;
  const bySource = chart.filter((a) => a.sourceAccount?.number === number);
  if (bySource.length === 1) return bySource[0]!.code;
  return chart.some((a) => a.code === number) ? number : null;
}

/**
 * Line for a QuickBooks posting that names no account (split or multiple transactions), from
 * its transaction type when the type settles it; otherwise it stays unclassified for review.
 */
function quickBooksTypeLine(posting: string, direction: "in" | "out"): CashFlowLine {
  const type = /^(?:Added|Matched) to:\s*([^:]+):/i.exec(posting)?.[1]?.trim().toLowerCase();
  if (direction === "out" && type === "bill payment") return "suppliers";
  if (direction === "in" && (type === "payment" || type === "sales receipt")) return "customers";
  return "unclassified";
}

/**
 * Cash history migrated from QuickBooks: Bank Feed lines on a cash account that QuickBooks had
 * already posted. They are not posted here because their result is the QuickBooks opening
 * balance, so they are reported as actual cash, read only, up to the opening of their account.
 */
async function cashFromQuickBooks(
  client: Pick<PoolClient, "query">,
  companyId: string,
  accounts: CashAccount[],
  chart: CompanyState["accounts"],
  classify: (
    counterpart: string | null,
    direction: "in" | "out",
    rowId: string,
    posting: string,
  ) => { line: CashFlowLine; by: CashTransaction["classified_by"] },
) {
  const accountByCode = new Map(accounts.map((a) => [a.id, a]));
  // One connection runs one query at a time.
  const rows = await client.query<HistoryRow>(
    `${quickBooksHistoryLines} AND f.account_code=ANY($2::text[]) ORDER BY r.date, r.position`,
    [companyId, accounts.map((a) => a.id)],
  );
  const rules = await client.query<{ pattern: string; account: string }>(
    "SELECT pattern,account_code AS account FROM bank_feed_rules WHERE company_id=$1 AND kind='mapping'",
    [companyId],
  );
  const feedMappings = new Map(rules.rows.map((r) => [r.pattern, r.account]));
  const transactions: CashTransaction[] = [];
  for (const row of rows.rows) {
    const account = accountByCode.get(row.account);
    if (
      !account ||
      !row.amount ||
      quickBooksSourceStatus(row.format, row.posting, row.reportedStatus) !== "Posted"
    )
      continue;
    const direction = row.amount > 0 ? "in" : "out";
    const counterpart = quickBooksCounterpart(row.posting, chart, feedMappings);
    const transfer = counterpart !== null && accountByCode.has(counterpart);
    const classified = transfer
      ? { line: "internal_transfer" as const, by: "default" as const }
      : classify(counterpart, direction, row.id, row.posting);
    transactions.push({
      id: `quickbooks:${row.id}`,
      source: "quickbooks",
      account_id: account.id,
      description: row.description,
      counterpart_code: counterpart,
      direction,
      amount: Math.abs(row.amount),
      due_date: row.date,
      paid_date: row.date,
      status: "paid",
      cash_flow_line: classified.line,
      classified_by: classified.by,
      variance_note: "",
      transfer_account_id: transfer ? counterpart : null,
      journal: { id: quickBooksMovementId(row.id), number: null, sequence: 0 },
    });
  }
  return transactions;
}

const dayBefore = (date: string) => {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
const cents = (t: CashTransaction) => Math.round(t.amount * 100) * (t.direction === "in" ? 1 : -1);

/**
 * Adds the QuickBooks history of each account up to its opening date. The opening balance
 * already contains that history, so the opening adjustment becomes the balance before the first
 * history line (opening minus history): the running balance then reaches the QuickBooks
 * balance on the opening date, and a gap in the imported history shows as that starting
 * adjustment. Without a posted opening, all history is reported and the balance starts at zero.
 * Lines dated after the opening are not in it nor in the ledger: they are returned as
 * `unposted`, to be posted from the Bank Feed.
 */
function withQuickBooksHistory(ledger: CashTransaction[], history: CashTransaction[]) {
  const result = [...ledger];
  const unposted: CashTransaction[] = [];
  const byAccount = new Map<string, CashTransaction[]>();
  for (const t of history) byAccount.set(t.account_id, [...(byAccount.get(t.account_id) ?? []), t]);
  for (const [accountId, lines] of byAccount) {
    const openings = result.filter((t) => t.account_id === accountId && t.opening);
    const openingDate = openings.map((t) => t.paid_date!).sort()[0];
    const included = openingDate ? lines.filter((t) => t.paid_date! <= openingDate) : lines;
    unposted.push(...lines.filter((t) => !included.includes(t)));
    if (!included.length) continue;
    result.push(...included);
    if (!openingDate) continue;
    const before =
      openings.reduce((s, t) => s + cents(t), 0) - included.reduce((s, t) => s + cents(t), 0);
    for (const t of openings) result.splice(result.indexOf(t), 1);
    const date = dayBefore(included[0]!.paid_date!);
    if (before)
      result.push({
        ...openings[0]!,
        id: `quickbooks-opening:${accountId}`,
        description: "QuickBooks balance before the imported history",
        direction: before > 0 ? "in" : "out",
        amount: Math.abs(before) / 100,
        due_date: date,
        paid_date: date,
      });
  }
  return { transactions: result, unposted };
}
