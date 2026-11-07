import type { PoolClient } from "pg";
import { db } from "./db.server";
import { authorizeCompany } from "./companies.server";
import { readLedger } from "./ledger-storage.server";
import { postedLedgerLines } from "./posted-ledger.server";
import type { CompanyState } from "./accounting-engine";
import { quickBooksSourceStatus } from "./statement-csv";
import {
  cashFromLedger,
  cashGlAccounts,
  readCashAccounts,
  type CashOverride,
} from "./cash-ledger.server";
import { defaultCashFlowLines } from "./cash-flow-classification";
import {
  summarize,
  type CashData,
  type CashFlowLine,
  type CashFlowMapping,
  type CashForecast,
  type CashReconciliation,
  type CashTransaction,
  type GlCashCheck,
} from "./cash-flow-model";

/**
 * Records dated in a closed fiscal period are frozen. Locked periods must be reopened in
 * Fiscal Periods (close_periods permission); soft-closed periods accept changes only from users
 * holding that permission.
 */
async function assertOpenPeriods(
  client: Pick<PoolClient, "query">,
  companyId: string,
  dates: (string | null | undefined)[],
  canClosePeriods: boolean,
) {
  const list = [...new Set(dates.filter((d): d is string => !!d))];
  if (!list.length) return;
  const closed = await client.query(
    `SELECT period_code AS code, status FROM ledger_fiscalperiods
    WHERE company_id=$1 AND status IN ('Locked','Soft-Close')
    AND EXISTS (SELECT 1 FROM unnest($2::date[]) d WHERE d BETWEEN start_date AND end_date)
    ORDER BY start_date`,
    [companyId, list],
  );
  for (const period of closed.rows) {
    if (period.status === "Locked")
      throw new Error(
        `Fiscal period ${period.code} is locked. Reopen it in Fiscal Periods before changing cash records dated in it.`,
      );
    if (!canClosePeriods)
      throw new Error(
        `Fiscal period ${period.code} is soft-closed. Only users allowed to close periods can change cash records dated in it.`,
      );
  }
}

type ForecastRow = {
  id: string;
  account_code: string;
  counterpart_code: string;
  description: string;
  direction: "in" | "out";
  amount: number;
  expected_date: string;
  status: "planned" | "realized" | "cancelled";
  cash_flow_line: CashFlowLine;
  variance_note: string;
  forecast_amount: number;
  forecast_date: string;
  forecast_direction: "in" | "out";
  transfer_id: string | null;
  transfer_account_code: string | null;
};
const forecastColumns = `id,account_code,counterpart_code,description,direction,amount::float8,
  expected_date::text,status,cash_flow_line,variance_note,forecast_amount::float8,
  forecast_date::text,forecast_direction,transfer_id,transfer_account_code`;

const forecastTransaction = (f: ForecastRow): CashTransaction => ({
  id: f.id,
  source: "forecast",
  account_id: f.account_code,
  description: f.description,
  counterpart_code: f.counterpart_code,
  direction: f.direction,
  amount: f.amount,
  due_date: f.expected_date,
  paid_date: null,
  status: f.status,
  cash_flow_line: f.cash_flow_line,
  classified_by: "forecast",
  variance_note: f.variance_note,
  transfer_account_id: f.transfer_account_code,
  transfer_id: f.transfer_id,
  forecast_amount: f.forecast_amount,
  forecast_date: f.forecast_date,
  forecast_direction: f.forecast_direction,
});

const readChart = (client: Pick<PoolClient, "query">, companyId: string) =>
  readLedger(client as PoolClient, companyId, "accounts") as unknown as Promise<
    CompanyState["accounts"]
  >;

async function readCashData(client: PoolClient, companyId: string): Promise<CashData> {
  const [chart, mappings, overrides, forecasts, statementPending] = await Promise.all([
    readChart(client, companyId),
    client.query<CashFlowMapping>(
      "SELECT account_code,inflow_line,outflow_line FROM cash_flow_account_lines WHERE company_id=$1",
      [companyId],
    ),
    client.query<CashOverride>(
      "SELECT journal_id,line_sequence,counterpart_code,cash_flow_line FROM cash_flow_line_overrides WHERE company_id=$1",
      [companyId],
    ),
    client.query<ForecastRow>(
      `SELECT ${forecastColumns} FROM cash_forecasts WHERE company_id=$1 ORDER BY expected_date DESC, created_at DESC`,
      [companyId],
    ),
    pendingStatementLines(client, companyId),
  ]);
  const ledger = await cashFromLedger(client, companyId, chart, mappings.rows, overrides.rows);
  const cashCodes = new Set(cashGlAccounts(chart).map((a) => a.code));
  return {
    accounts: ledger.accounts,
    transactions: [...forecasts.rows.map(forecastTransaction), ...ledger.transactions].sort(
      (a, b) => (b.paid_date ?? b.due_date).localeCompare(a.paid_date ?? a.due_date),
    ),
    mappings: mappings.rows,
    glAccounts: chart.map((account) => ({
      code: account.code,
      name: account.name,
      type: account.type,
      balanceType: account.balanceType,
      cash: cashCodes.has(account.code),
      defaultLines: defaultCashFlowLines(account),
    })),
    statementPending,
  };
}

/**
 * Bank Feed lines still in the Pending tab, per bank account. Mirrors the Bank Feed rule:
 * a QuickBooks line already posted at the source is not pending unless it was returned.
 */
async function pendingStatementLines(client: Pick<PoolClient, "query">, companyId: string) {
  const rows = await client.query<{
    account: string;
    date: string;
    format: Parameters<typeof quickBooksSourceStatus>[0];
    posting: string;
    attempted: boolean;
    returned: boolean;
  }>(
    `SELECT f.account_code AS account, r.date::text, f.feed_source_format AS format,
       r.feed_external_posting AS posting, a.id IS NOT NULL AS attempted,
       (r.feed_external_posting<>'' AND EXISTS (
         SELECT 1 FROM system_audit_events e
         WHERE e.company_id=r.company_id AND e.entity='BankFeed' AND e.target_id=r.id
           AND e.action IN ('BANK_FEED_UNDO_SOURCE','BANK_FEED_UNDO','BANK_FEED_UNMATCH')
       )) AS returned
     FROM ledger_stagingrows r
     JOIN ledger_statements f ON (f.company_id,f.id)=(r.company_id,r.file_id)
     LEFT JOIN bank_feed_attempts a ON (a.company_id,a.row_id)=(r.company_id,r.id) AND a.state IN ('pending','posted')
     WHERE r.company_id=$1 AND r.status='Pending'`,
    [companyId],
  );
  const pending = new Map<string, { account: string; count: number; oldest: string }>();
  for (const row of rows.rows) {
    const sourcePosted =
      !row.attempted &&
      !row.returned &&
      quickBooksSourceStatus(row.format, row.posting) === "Posted";
    if (sourcePosted) continue;
    const item = pending.get(row.account) ?? { account: row.account, count: 0, oldest: row.date };
    item.count += 1;
    if (row.date < item.oldest) item.oldest = row.date;
    pending.set(row.account, item);
  }
  return [...pending.values()];
}

export async function load(companyId: string): Promise<CashData> {
  const client = await db().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await authorizeCompany(companyId, undefined, client);
    return await readCashData(client, companyId);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}

/** Runs a cash write in one transaction with the actor recorded for the audit trail. */
async function write<T>(
  companyId: string,
  work: (client: PoolClient, auth: Awaited<ReturnType<typeof authorizeCompany>>) => Promise<T>,
) {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(803003)");
    const auth = await authorizeCompany(companyId, "write_cash", client);
    await client.query("SELECT set_config('app.actor_id',$1,true)", [auth.user.id]);
    const result = await work(client, auth);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

type ReconciliationScope = Pick<
  CashReconciliation,
  "companyId" | "start" | "end" | "currency" | "accountId"
>;
export async function readReconciliation(
  data: ReconciliationScope,
): Promise<CashReconciliation | null> {
  await authorizeCompany(data.companyId);
  const result = await db().query(
    `SELECT company_id AS "companyId",period_start::text AS start,period_end::text AS end,currency,account_code AS "accountId",
     net_income::float8,depreciation::float8,receivables::float8,inventory::float8,payables::float8,taxes_payable::float8,
     other_adjustments::float8,balance_sheet_cash::float8,explanation FROM cash_flow_reconciliations
     WHERE company_id=$1 AND period_start=$2 AND period_end=$3 AND currency=$4 AND account_code IS NOT DISTINCT FROM $5`,
    [data.companyId, data.start, data.end, data.currency, data.accountId],
  );
  return result.rows[0] ?? null;
}

/**
 * Proves actual ending cash against posted GL balances. Actuals are read from the ledger, so a
 * difference points to a posting this report could not convert into the account currency.
 * Proof is possible only in USD, the currency journal amounts are recorded in.
 */
export async function checkGlCash(data: ReconciliationScope): Promise<GlCashCheck> {
  const client = await db().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await authorizeCompany(data.companyId, undefined, client);
    const unavailable = (reason: string): GlCashCheck => ({
      status: "unavailable",
      reason,
      glBalance: null,
      cashBalance: null,
      difference: null,
      glAccounts: [],
    });
    if (data.currency !== "USD")
      return unavailable(
        "General ledger amounts are recorded in USD. Foreign-currency cash needs FX remeasurement before it can be proven against the GL.",
      );
    const cash = await readCashData(client, data.companyId);
    const accounts = cash.accounts.filter(
      (a) => a.currency === data.currency && (!data.accountId || a.id === data.accountId),
    );
    if (!accounts.length) return unavailable("No cash accounts in this scope.");
    const codes = accounts.map((a) => a.id);
    const gl = await client.query(
      `SELECT coalesce(sum(debit-credit),0)::float8 AS balance
       FROM (${postedLedgerLines}) posted WHERE date <= $2::date AND account_code = ANY($3::text[])`,
      [data.companyId, data.end, codes],
    );
    const report = summarize(accounts, cash.transactions, data.end, data.end, "daily", false);
    const cashBalance = report.periods.at(-1)?.balance ?? report.opening;
    const glBalance = Math.round(gl.rows[0].balance * 100) / 100;
    const difference = (Math.round(cashBalance * 100) - Math.round(glBalance * 100)) / 100;
    return {
      status: difference === 0 ? "verified" : "difference",
      reason:
        difference === 0
          ? "Actual ending cash agrees with posted GL balances."
          : "Actual ending cash differs from posted GL balances. Review foreign-currency postings on these accounts.",
      glBalance,
      cashBalance,
      difference,
      glAccounts: codes,
    };
  } finally {
    // Read-only snapshot: always end it, including on the early "unavailable" returns.
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}

export async function writeReconciliation(data: CashReconciliation) {
  return write(data.companyId, async (client, auth) => {
    await assertOpenPeriods(client, data.companyId, [data.end], auth.permissions.close_periods);
    if (data.accountId) {
      const cash = cashGlAccounts(await readChart(client, data.companyId));
      if (!cash.some((a) => a.code === data.accountId))
        throw new Error("Select a bank or cash account of this company.");
    }
    await client.query(
      `INSERT INTO cash_flow_reconciliations(company_id,period_start,period_end,currency,account_code,
       net_income,depreciation,receivables,inventory,payables,taxes_payable,other_adjustments,balance_sheet_cash,explanation,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT ON CONSTRAINT cash_flow_reconciliations_scope_key
      DO UPDATE SET net_income=EXCLUDED.net_income,depreciation=EXCLUDED.depreciation,receivables=EXCLUDED.receivables,
      inventory=EXCLUDED.inventory,payables=EXCLUDED.payables,taxes_payable=EXCLUDED.taxes_payable,
      other_adjustments=EXCLUDED.other_adjustments,balance_sheet_cash=EXCLUDED.balance_sheet_cash,
      explanation=EXCLUDED.explanation,updated_by=EXCLUDED.updated_by,updated_at=now()`,
      [
        data.companyId,
        data.start,
        data.end,
        data.currency,
        data.accountId,
        data.net_income,
        data.depreciation,
        data.receivables,
        data.inventory,
        data.payables,
        data.taxes_payable,
        data.other_adjustments,
        data.balance_sheet_cash,
        data.explanation,
        auth.user.id,
      ],
    );
    return { ok: true };
  });
}

/**
 * Saves a forecast. A forecast against another cash account is an internal transfer and is
 * stored as two legs that change together. Forecasts never post journal entries.
 */
export async function saveForecast(data: CashForecast & { companyId: string }) {
  return write(data.companyId, async (client, auth) => {
    const chart = await readChart(client, data.companyId);
    const cash = new Map(
      (await readCashAccounts(client, data.companyId, chart)).map((a) => [a.id, a]),
    );
    const account = cash.get(data.account_code);
    if (!account) throw new Error("Select a bank or cash account from the Chart of Accounts.");
    if (!chart.some((a) => a.code === data.counterpart_code))
      throw new Error("Select a counterpart account from this company's Chart of Accounts.");
    const counterpartCash = cash.get(data.counterpart_code);
    const transfer = data.cash_flow_line === "internal_transfer";
    if (transfer !== !!counterpartCash)
      throw new Error(
        transfer
          ? "A transfer needs another bank or cash account as counterpart."
          : "A forecast against another bank or cash account is a transfer: classify it as a transfer between own cash accounts.",
      );
    if (counterpartCash && counterpartCash.currency !== account.currency)
      throw new Error(
        "Transfers between currencies need FX handling and are not supported. Forecast each side separately.",
      );
    const previous = data.id
      ? (
          await client.query<ForecastRow>(
            `SELECT ${forecastColumns} FROM cash_forecasts WHERE id=$1 AND company_id=$2 FOR UPDATE`,
            [data.id, data.companyId],
          )
        ).rows[0]
      : undefined;
    if (data.id && !previous) throw new Error("Forecast not found.");
    if (previous && !!previous.transfer_id !== transfer)
      throw new Error(
        "A transfer cannot become a regular forecast, or the reverse. Cancel it and create a new one.",
      );
    if (
      previous?.transfer_id &&
      (previous.account_code !== data.account_code ||
        previous.transfer_account_code !== data.counterpart_code)
    )
      throw new Error("The accounts of a transfer cannot change. Cancel it and create a new one.");
    const leg = (accountCode: string, counterpart: string, direction: "in" | "out"): unknown[] => [
      data.companyId,
      accountCode,
      counterpart,
      data.description,
      direction,
      data.amount,
      data.expected_date,
      data.status,
      data.cash_flow_line,
      data.variance_note,
    ];
    const mirrorDirection = data.direction === "in" ? "out" : "in";
    if (previous) {
      const update = `UPDATE cash_forecasts SET account_code=$2,counterpart_code=$3,description=$4,direction=$5,
        amount=$6,expected_date=$7,status=$8,cash_flow_line=$9,variance_note=$10 WHERE company_id=$1`;
      await client.query(update + " AND id=$11", [
        ...leg(data.account_code, data.counterpart_code, data.direction),
        previous.id,
      ]);
      if (previous.transfer_id) {
        const other = await client.query(update + " AND transfer_id=$11 AND id<>$12", [
          ...leg(data.counterpart_code, data.account_code, mirrorDirection),
          previous.transfer_id,
          previous.id,
        ]);
        if (other.rowCount !== 1) throw new Error("The other leg of this transfer is missing.");
      }
    } else {
      const transferId = transfer ? crypto.randomUUID() : null;
      const insert = `INSERT INTO cash_forecasts(company_id,account_code,counterpart_code,description,direction,amount,
        expected_date,status,cash_flow_line,variance_note,created_by,transfer_id,transfer_account_code,
        forecast_amount,forecast_date,forecast_direction)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$6,$7,$5)`;
      await client.query(insert, [
        ...leg(data.account_code, data.counterpart_code, data.direction),
        auth.user.id,
        transferId,
        transfer ? data.counterpart_code : null,
      ]);
      if (transfer)
        await client.query(insert, [
          ...leg(data.counterpart_code, data.account_code, mirrorDirection),
          auth.user.id,
          transferId,
          data.account_code,
        ]);
    }
    return { ok: true };
  });
}

/** Maps a GL account to cash flow lines, or with `null` lines returns it to the default rule. */
export async function saveMapping(
  data: { companyId: string; account_code: string } & (
    | { inflow_line: CashFlowLine; outflow_line: CashFlowLine }
    | { inflow_line: null; outflow_line: null }
  ),
) {
  return write(data.companyId, async (client) => {
    const chart = await readChart(client, data.companyId);
    if (!chart.some((a) => a.code === data.account_code))
      throw new Error("Select an account from this company's Chart of Accounts.");
    if (cashGlAccounts(chart).some((a) => a.code === data.account_code))
      throw new Error("Movements between bank or cash accounts are always internal transfers.");
    if (data.inflow_line === null)
      await client.query(
        "DELETE FROM cash_flow_account_lines WHERE company_id=$1 AND account_code=$2",
        [data.companyId, data.account_code],
      );
    else
      await client.query(
        `INSERT INTO cash_flow_account_lines(company_id,account_code,inflow_line,outflow_line) VALUES($1,$2,$3,$4)
         ON CONFLICT(company_id,account_code) DO UPDATE SET inflow_line=EXCLUDED.inflow_line,outflow_line=EXCLUDED.outflow_line`,
        [data.companyId, data.account_code, data.inflow_line, data.outflow_line],
      );
    return { ok: true };
  });
}

/**
 * Reclassifies one posted cash movement, or with `null` returns it to its account mapping.
 * The statement of cash flows of a closed period does not change.
 */
export async function saveOverride(data: {
  companyId: string;
  journal_id: string;
  line_sequence: number;
  counterpart_code: string;
  cash_flow_line: CashFlowLine | null;
}) {
  return write(data.companyId, async (client, auth) => {
    const cash = cashGlAccounts(await readChart(client, data.companyId)).map((a) => a.code);
    const line = (
      await client.query<{ date: string }>(
        `WITH posted AS (${postedLedgerLines})
         SELECT c.date::text FROM posted c
         WHERE c.id=$2 AND c.sequence=$3 AND c.account_code=ANY($4::text[])
           AND EXISTS (SELECT 1 FROM posted o WHERE o.id=c.id AND o.account_code=$5)`,
        [data.companyId, data.journal_id, data.line_sequence, cash, data.counterpart_code],
      )
    ).rows[0];
    if (!line) throw new Error("Posted cash movement not found.");
    if (cash.includes(data.counterpart_code))
      throw new Error("Movements between bank or cash accounts are always internal transfers.");
    await assertOpenPeriods(client, data.companyId, [line.date], auth.permissions.close_periods);
    if (data.cash_flow_line === null)
      await client.query(
        "DELETE FROM cash_flow_line_overrides WHERE company_id=$1 AND journal_id=$2 AND line_sequence=$3 AND counterpart_code=$4",
        [data.companyId, data.journal_id, data.line_sequence, data.counterpart_code],
      );
    else
      await client.query(
        `INSERT INTO cash_flow_line_overrides(company_id,journal_id,line_sequence,counterpart_code,cash_flow_line)
         VALUES($1,$2,$3,$4,$5) ON CONFLICT(company_id,journal_id,line_sequence,counterpart_code)
         DO UPDATE SET cash_flow_line=EXCLUDED.cash_flow_line`,
        [
          data.companyId,
          data.journal_id,
          data.line_sequence,
          data.counterpart_code,
          data.cash_flow_line,
        ],
      );
    return { ok: true };
  });
}
