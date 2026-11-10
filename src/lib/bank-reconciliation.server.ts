import type { PoolClient } from "pg";
import type { z } from "zod";
import type { CompanyState } from "./accounting-engine";
import { bankSourceAccount } from "./bank-feed-model";
import { transaction } from "./bank-feed.server";
import {
  signedUnits,
  type ReconciliationStatus,
  type reconciliationCreate,
  type reconciliationReopen,
  type reconciliationToggle,
  type reconciliationUpdate,
} from "./bank-reconciliation-model";
import type { authorizeCompany } from "./companies.server";
import { readLedger } from "./ledger-storage.server";

type Auth = Awaited<ReturnType<typeof authorizeCompany>>;
type Scope = { companyId: string };
type Ref = Scope & { id: string };

type Reconciliation = {
  id: string;
  account: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  beginningBalance: string;
  statementEndingBalance: string;
  clearedBalance: string;
  difference: string;
  status: ReconciliationStatus;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  completedAt: string | null;
  completedBy: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenReason: string | null;
  clearedCount: number;
};

/**
 * A line counts as booked when its active Bank Feed attempt is posted. A match is booked only
 * while at least one of its links to a posted movement is still active.
 */
const accountedSql = `(a.state='posted' AND (a.kind<>'match' OR EXISTS (
  SELECT 1 FROM bank_feed_links k WHERE k.company_id=a.company_id AND k.attempt_id=a.id AND k.active)))`;

const reconciliationSql = `
 SELECT b.id,b.account_code AS account,b.currency,b.period_start::text AS "periodStart",
   b.period_end::text AS "periodEnd",b.beginning_balance::text AS "beginningBalance",
   b.statement_ending_balance::text AS "statementEndingBalance",b.cleared_balance::text AS "clearedBalance",
   b.difference::text AS difference,b.status,b.notes,b.created_at::text AS "createdAt",cu.name AS "createdBy",
   b.completed_at::text AS "completedAt",co.name AS "completedBy",b.reopened_at::text AS "reopenedAt",
   ro.name AS "reopenedBy",b.reopen_reason AS "reopenReason",
   (SELECT count(*)::int FROM bank_reconciliation_items i
     WHERE i.company_id=b.company_id AND i.reconciliation_id=b.id) AS "clearedCount"
 FROM bank_reconciliations b
 LEFT JOIN app_users cu ON cu.id=b.created_by
 LEFT JOIN app_users co ON co.id=b.completed_by
 LEFT JOIN app_users ro ON ro.id=b.reopened_by
 WHERE b.company_id=$1`;

async function load(c: PoolClient, { companyId, id }: Ref, lock = false) {
  if (lock)
    await c.query("SELECT 1 FROM bank_reconciliations WHERE company_id=$1 AND id=$2 FOR UPDATE", [
      companyId,
      id,
    ]);
  const rec = (await c.query<Reconciliation>(reconciliationSql + " AND b.id=$2", [companyId, id]))
    .rows[0];
  if (!rec) throw new Error("Bank reconciliation unavailable.");
  return rec;
}

function assertWritable(auth: Auth) {
  if (!auth.permissions.write_accounting) throw new Error("Access denied.");
  if (auth.company.isPeriodClosed) throw new Error("Company accounting period is closed.");
}

function assertEditable(rec: Reconciliation) {
  if (rec.status === "completed")
    throw new Error("This reconciliation is completed. Reopen it before making changes.");
}

async function closedFiscalPeriod(c: PoolClient, companyId: string, date: string) {
  return !!(
    await c.query(
      `SELECT 1 FROM ledger_fiscalperiods WHERE company_id=$1 AND start_date<=$2::date AND end_date>=$2::date
        AND status IN ('Locked','Closed')`,
      [companyId, date],
    )
  ).rowCount;
}

async function event(
  c: PoolClient,
  auth: Auth,
  id: string,
  action: "created" | "updated" | "cleared" | "uncleared" | "completed" | "reopened" | "deleted",
  details: Record<string, unknown> = {},
) {
  await c.query(
    `INSERT INTO bank_reconciliation_events(company_id,reconciliation_id,action,actor_id,actor_name,details)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [auth.company.id, id, action, auth.user.id, auth.user.name, JSON.stringify(details)],
  );
}

/** Cleared and difference are always derived from stored items; the client total is a preview only. */
async function refresh(c: PoolClient, companyId: string, id: string, touch: boolean) {
  await c.query(
    `WITH s AS (SELECT coalesce(sum(amount),0) AS total FROM bank_reconciliation_items
       WHERE company_id=$1 AND reconciliation_id=$2)
     UPDATE bank_reconciliations b SET cleared_balance=b.beginning_balance+s.total,
       difference=b.statement_ending_balance-b.beginning_balance-s.total,
       status=CASE WHEN $3 AND b.status='draft' THEN 'in_progress' ELSE b.status END
     FROM s WHERE b.company_id=$1 AND b.id=$2`,
    [companyId, id, touch],
  );
}

async function previous(c: PoolClient, companyId: string, account: string, before: string) {
  return (
    await c.query<{ id: string; periodEnd: string; ending: string; status: ReconciliationStatus }>(
      `SELECT id,period_end::text AS "periodEnd",statement_ending_balance::text AS ending,status
       FROM bank_reconciliations WHERE company_id=$1 AND account_code=$2 AND period_end<$3::date
       ORDER BY period_end DESC LIMIT 1`,
      [companyId, account, before],
    )
  ).rows[0];
}

async function lines(c: PoolClient, companyId: string, rec: Reconciliation) {
  return (
    await c.query<{
      id: string;
      date: string;
      description: string;
      fromTo: string;
      amount: string;
      status: "Pending" | "Classified" | "Excluded";
      attemptKind: "category" | "settlement" | "match" | "legacy" | null;
      journalNumber: string | null;
      legacyJournalId: string | null;
      accounted: boolean;
      cleared: boolean;
      clearedAt: string | null;
    }>(
      `SELECT r.id,r.date::text,r.description,r.feed_from_to AS "fromTo",r.amount::text,r.status,
         a.kind AS "attemptKind",j.journal_number AS "journalNumber",a.legacy_journal_id AS "legacyJournalId",
         coalesce(${accountedSql},false) AS accounted,i.row_id IS NOT NULL AS cleared,i.cleared_at::text AS "clearedAt"
       FROM ledger_stagingrows r JOIN ledger_statements f ON (f.company_id,f.id)=(r.company_id,r.file_id)
       LEFT JOIN bank_feed_attempts a ON (a.company_id,a.row_id)=(r.company_id,r.id) AND a.state IN ('pending','posted')
       LEFT JOIN journal_entries j ON j.id=a.journal_id
       LEFT JOIN bank_reconciliation_items i ON (i.company_id,i.row_id)=(r.company_id,r.id)
       WHERE r.company_id=$1 AND f.account_code=$2 AND f.feed_currency=$3 AND (
         i.reconciliation_id=$4 OR ($5 AND i.row_id IS NULL AND r.date<=$6::date AND r.status<>'Excluded'))
       ORDER BY r.date,r.position,r.id`,
      [companyId, rec.account, rec.currency, rec.id, rec.status !== "completed", rec.periodEnd],
    )
  ).rows;
}

export async function listReconciliations({ companyId }: Scope) {
  return transaction(companyId, false, async (c, auth) => {
    const ledgerAccounts = (await readLedger(
      c,
      companyId,
      "accounts",
    )) as unknown as CompanyState["accounts"];
    const sources = await c.query<{ account: string; currency: string; lines: number }>(
      `SELECT f.account_code AS account,f.feed_currency AS currency,count(r.id)::int AS lines
       FROM ledger_statements f LEFT JOIN ledger_stagingrows r ON (r.company_id,r.file_id)=(f.company_id,f.id)
       WHERE f.company_id=$1 GROUP BY f.account_code,f.feed_currency ORDER BY f.account_code`,
      [companyId],
    );
    const recs = await c.query<Reconciliation>(
      reconciliationSql + " ORDER BY b.account_code,b.period_end DESC",
      [companyId],
    );
    const balances = await c.query<{ account: string; date: string; amount: string }>(
      `SELECT account_code AS account,balance_date::text AS date,amount::text
       FROM bank_feed_balances WHERE company_id=$1 ORDER BY account_code,balance_date DESC`,
      [companyId],
    );
    const accounts = sources.rows.flatMap((source) => {
      const account = ledgerAccounts.find((a) => a.code === source.account);
      if (!account || !bankSourceAccount(account, ledgerAccounts)) return [];
      return [{ ...source, name: account.name, type: account.type }];
    });
    return {
      accounts,
      reconciliations: recs.rows,
      statementBalances: balances.rows,
      canWrite: auth.permissions.write_accounting && !auth.company.isPeriodClosed,
      periodClosed: auth.company.isPeriodClosed,
    };
  });
}

export async function reconciliationDetail(ref: Ref) {
  return transaction(ref.companyId, false, async (c, auth) => {
    const rec = await load(c, ref);
    // One client runs one query at a time, so these are awaited in sequence.
    const rows = await lines(c, ref.companyId, rec);
    const events = await c.query<{
      id: string;
      action: string;
      actor: string;
      occurredAt: string;
      details: Record<string, unknown>;
    }>(
      `SELECT id::text,action,actor_name AS actor,occurred_at::text AS "occurredAt",details
       FROM bank_reconciliation_events WHERE company_id=$1 AND reconciliation_id=$2
       ORDER BY occurred_at DESC,id DESC LIMIT 500`,
      [ref.companyId, ref.id],
    );
    const prior = await previous(c, ref.companyId, rec.account, rec.periodStart);
    const fiscalClosed = await closedFiscalPeriod(c, ref.companyId, rec.periodEnd);
    const later = await c.query(
      "SELECT 1 FROM bank_reconciliations WHERE company_id=$1 AND account_code=$2 AND period_end>$3::date LIMIT 1",
      [ref.companyId, rec.account, rec.periodEnd],
    );
    const writable = auth.permissions.write_accounting && !auth.company.isPeriodClosed;
    return {
      reconciliation: rec,
      lines: rows,
      events: events.rows,
      previousEnding: prior?.status === "completed" ? prior.ending : null,
      fiscalPeriodClosed: fiscalClosed,
      canEdit: writable && rec.status !== "completed",
      canEditBeginning: writable && rec.status !== "completed" && !prior,
      canReopen: writable && rec.status === "completed" && !fiscalClosed && !later.rowCount,
      canDelete:
        writable && (rec.status === "draft" || rec.status === "in_progress") && !rec.completedAt,
    };
  });
}

export async function createReconciliation(input: z.infer<typeof reconciliationCreate>) {
  return transaction(input.companyId, true, async (c, auth) => {
    assertWritable(auth);
    const { companyId } = input;
    if (input.periodStart > input.periodEnd)
      throw new Error("The period start must be on or before the statement ending date.");
    const ledgerAccounts = (await readLedger(
      c,
      companyId,
      "accounts",
    )) as unknown as CompanyState["accounts"];
    const account = ledgerAccounts.find((a) => a.code === input.account);
    if (!account || !bankSourceAccount(account, ledgerAccounts))
      throw new Error(
        "Select a bank or credit card account from this company's chart of accounts.",
      );
    const currency = (
      await c.query<{ currency: string }>(
        "SELECT DISTINCT feed_currency AS currency FROM ledger_statements WHERE company_id=$1 AND account_code=$2",
        [companyId, input.account],
      )
    ).rows;
    if (!currency.length)
      throw new Error("Import a bank statement for this account before reconciling it.");
    if (currency.length > 1)
      throw new Error("This account has statements in more than one currency.");
    const latest = (
      await c.query<{ periodEnd: string; ending: string; status: ReconciliationStatus }>(
        `SELECT period_end::text AS "periodEnd",statement_ending_balance::text AS ending,status
         FROM bank_reconciliations WHERE company_id=$1 AND account_code=$2 ORDER BY period_end DESC LIMIT 1`,
        [companyId, input.account],
      )
    ).rows[0];
    if (latest && latest.status !== "completed")
      throw new Error("Complete or delete the open reconciliation for this account first.");
    if (latest && input.periodStart <= latest.periodEnd)
      throw new Error(`The period must start after ${latest.periodEnd}, the last reconciled date.`);
    const beginning = latest ? latest.ending : input.beginningBalance;
    if (beginning === undefined)
      throw new Error("Enter the beginning balance for this account's first reconciliation.");
    const id = (
      await c.query<{ id: string }>(
        `INSERT INTO bank_reconciliations(company_id,account_code,currency,period_start,period_end,
           beginning_balance,statement_ending_balance,cleared_balance,difference,notes,created_by)
         VALUES($1,$2,$3,$4,$5,$6::numeric,$7::numeric,$6::numeric,$7::numeric-$6::numeric,$8,$9) RETURNING id`,
        [
          companyId,
          input.account,
          currency[0]!.currency,
          input.periodStart,
          input.periodEnd,
          beginning,
          input.statementEndingBalance,
          input.notes || null,
          auth.user.id,
        ],
      )
    ).rows[0]!.id;
    await event(c, auth, id, "created", {
      account: input.account,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      beginningBalance: beginning,
      statementEndingBalance: input.statementEndingBalance,
    });
    return { id };
  });
}

export async function updateReconciliation(input: z.infer<typeof reconciliationUpdate>) {
  return transaction(input.companyId, true, async (c, auth) => {
    assertWritable(auth);
    const rec = await load(c, input, true);
    assertEditable(rec);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (input.beginningBalance !== undefined) {
      if (await previous(c, input.companyId, rec.account, rec.periodStart))
        throw new Error("The beginning balance comes from the previous reconciliation.");
      changes["beginningBalance"] = { from: rec.beginningBalance, to: input.beginningBalance };
    }
    if (input.statementEndingBalance !== undefined)
      changes["statementEndingBalance"] = {
        from: rec.statementEndingBalance,
        to: input.statementEndingBalance,
      };
    if (input.periodEnd !== undefined) {
      if (input.periodEnd < rec.periodStart)
        throw new Error("The statement ending date must be on or after the period start.");
      const late = await c.query(
        `SELECT 1 FROM bank_reconciliation_items i JOIN ledger_stagingrows r ON (r.company_id,r.id)=(i.company_id,i.row_id)
         WHERE i.company_id=$1 AND i.reconciliation_id=$2 AND r.date>$3::date LIMIT 1`,
        [input.companyId, input.id, input.periodEnd],
      );
      if (late.rowCount)
        throw new Error("Unclear the transactions dated after the new ending date first.");
      changes["periodEnd"] = { from: rec.periodEnd, to: input.periodEnd };
    }
    if (input.notes !== undefined) changes["notes"] = { from: rec.notes, to: input.notes };
    await c.query(
      `WITH s AS (SELECT coalesce(sum(amount),0) AS total FROM bank_reconciliation_items
         WHERE company_id=$1 AND reconciliation_id=$2)
       UPDATE bank_reconciliations b SET
         beginning_balance=coalesce($3::numeric,b.beginning_balance),
         statement_ending_balance=coalesce($4::numeric,b.statement_ending_balance),
         period_end=coalesce($5::date,b.period_end),
         notes=CASE WHEN $6::boolean THEN nullif($7,'') ELSE b.notes END,
         cleared_balance=coalesce($3::numeric,b.beginning_balance)+s.total,
         difference=coalesce($4::numeric,b.statement_ending_balance)-coalesce($3::numeric,b.beginning_balance)-s.total,
         status=CASE WHEN b.status='draft' THEN 'in_progress' ELSE b.status END
       FROM s WHERE b.company_id=$1 AND b.id=$2`,
      [
        input.companyId,
        input.id,
        input.beginningBalance ?? null,
        input.statementEndingBalance ?? null,
        input.periodEnd ?? null,
        input.notes !== undefined,
        input.notes ?? "",
      ],
    );
    await event(c, auth, input.id, "updated", changes);
    return { id: input.id };
  });
}

export async function toggleReconciliationItems(input: z.infer<typeof reconciliationToggle>) {
  return transaction(input.companyId, true, async (c, auth) => {
    assertWritable(auth);
    const rec = await load(c, input, true);
    assertEditable(rec);
    const rowIds = [...new Set(input.rowIds)];
    let changed: { count: number; total: string };
    if (input.cleared) {
      const found = await c.query(
        "SELECT 1 FROM ledger_stagingrows WHERE company_id=$1 AND id=ANY($2::text[])",
        [input.companyId, rowIds],
      );
      if (found.rowCount !== rowIds.length)
        throw new Error("A selected transaction is no longer available in the Bank Feed.");
      const elsewhere = await c.query(
        "SELECT 1 FROM bank_reconciliation_items WHERE company_id=$1 AND row_id=ANY($2::text[]) AND reconciliation_id<>$3 LIMIT 1",
        [input.companyId, rowIds, input.id],
      );
      if (elsewhere.rowCount)
        throw new Error("A selected transaction is already cleared in another reconciliation.");
      // Account, currency, period end and exclusion are enforced by bank_reconciliation_item_guard.
      changed = (
        await c.query<{ count: number; total: string }>(
          `WITH added AS (
             INSERT INTO bank_reconciliation_items(company_id,reconciliation_id,row_id,amount,cleared_by)
             SELECT r.company_id,$2,r.id,r.amount,$4 FROM ledger_stagingrows r
             WHERE r.company_id=$1 AND r.id=ANY($3::text[])
             ON CONFLICT (company_id,reconciliation_id,row_id) DO NOTHING RETURNING amount)
           SELECT count(*)::int AS count,coalesce(sum(amount),0)::text AS total FROM added`,
          [input.companyId, input.id, rowIds, auth.user.id],
        )
      ).rows[0]!;
    } else {
      changed = (
        await c.query<{ count: number; total: string }>(
          `WITH removed AS (
             DELETE FROM bank_reconciliation_items WHERE company_id=$1 AND reconciliation_id=$2
             AND row_id=ANY($3::text[]) RETURNING amount)
           SELECT count(*)::int AS count,coalesce(sum(amount),0)::text AS total FROM removed`,
          [input.companyId, input.id, rowIds],
        )
      ).rows[0]!;
    }
    await refresh(c, input.companyId, input.id, true);
    if (changed.count)
      await event(c, auth, input.id, input.cleared ? "cleared" : "uncleared", {
        rowIds,
        ...changed,
      });
    return load(c, input);
  });
}

export async function completeReconciliation(ref: Ref) {
  return transaction(ref.companyId, true, async (c, auth) => {
    assertWritable(auth);
    const rec = await load(c, ref, true);
    assertEditable(rec);
    const prior = await previous(c, ref.companyId, rec.account, rec.periodStart);
    if (prior && prior.status !== "completed")
      throw new Error("Complete the previous reconciliation for this account first.");
    if (prior && signedUnits(prior.ending) !== signedUnits(rec.beginningBalance))
      throw new Error("The beginning balance no longer matches the previous reconciliation.");
    // Re-read amounts from the bank lines so the record reflects what the bank reported.
    await c.query(
      `UPDATE bank_reconciliation_items i SET amount=r.amount FROM ledger_stagingrows r
       WHERE i.company_id=$1 AND i.reconciliation_id=$2 AND (r.company_id,r.id)=(i.company_id,i.row_id)
         AND i.amount<>r.amount`,
      [ref.companyId, ref.id],
    );
    await refresh(c, ref.companyId, ref.id, false);
    const unbooked = (
      await c.query<{ date: string; description: string }>(
        `SELECT r.date::text,r.description FROM bank_reconciliation_items i
         JOIN ledger_stagingrows r ON (r.company_id,r.id)=(i.company_id,i.row_id)
         LEFT JOIN bank_feed_attempts a ON (a.company_id,a.row_id)=(r.company_id,r.id) AND a.state IN ('pending','posted')
         WHERE i.company_id=$1 AND i.reconciliation_id=$2 AND NOT coalesce(${accountedSql},false)
         ORDER BY r.date,r.id`,
        [ref.companyId, ref.id],
      )
    ).rows;
    if (unbooked.length)
      throw new Error(
        `${unbooked.length} cleared transaction(s) are not posted or matched in the Bank Feed yet ` +
          `(${unbooked
            .slice(0, 3)
            .map((r) => `${r.date} ${r.description}`)
            .join("; ")}${unbooked.length > 3 ? "; …" : ""}).`,
      );
    const after = await load(c, ref);
    if (signedUnits(after.difference) !== 0n)
      throw new Error("The difference must be zero before the reconciliation can be completed.");
    // Freeze which Bank Feed posting or match each cleared line was reconciled against.
    await c.query(
      `UPDATE bank_reconciliation_items i SET attempt_id=a.id FROM bank_feed_attempts a
       WHERE i.company_id=$1 AND i.reconciliation_id=$2 AND (a.company_id,a.row_id)=(i.company_id,i.row_id)
         AND a.state='posted'`,
      [ref.companyId, ref.id],
    );
    await c.query(
      `UPDATE bank_reconciliations SET status='completed',completed_by=$3,completed_at=now()
       WHERE company_id=$1 AND id=$2`,
      [ref.companyId, ref.id, auth.user.id],
    );
    await event(c, auth, ref.id, "completed", {
      beginningBalance: after.beginningBalance,
      statementEndingBalance: after.statementEndingBalance,
      clearedBalance: after.clearedBalance,
      clearedCount: after.clearedCount,
    });
    return { id: ref.id };
  });
}

export async function reopenReconciliation(input: z.infer<typeof reconciliationReopen>) {
  return transaction(input.companyId, true, async (c, auth) => {
    assertWritable(auth);
    const rec = await load(c, input, true);
    if (rec.status !== "completed")
      throw new Error("Only completed reconciliations can be reopened.");
    if (await closedFiscalPeriod(c, input.companyId, rec.periodEnd))
      throw new Error("The fiscal period of this statement is locked or closed.");
    const later = await c.query(
      "SELECT 1 FROM bank_reconciliations WHERE company_id=$1 AND account_code=$2 AND period_end>$3::date LIMIT 1",
      [input.companyId, rec.account, rec.periodEnd],
    );
    if (later.rowCount)
      throw new Error("Only the most recent reconciliation of an account can be reopened.");
    await c.query(
      `UPDATE bank_reconciliations SET status='reopened',reopened_by=$3,reopened_at=now(),reopen_reason=$4
       WHERE company_id=$1 AND id=$2`,
      [input.companyId, input.id, auth.user.id, input.reason],
    );
    await event(c, auth, input.id, "reopened", { reason: input.reason });
    return { id: input.id };
  });
}

export async function deleteReconciliation(ref: Ref) {
  return transaction(ref.companyId, true, async (c, auth) => {
    assertWritable(auth);
    const rec = await load(c, ref, true);
    if (rec.completedAt || (rec.status !== "draft" && rec.status !== "in_progress"))
      throw new Error("A reconciliation that was completed cannot be deleted. Reopen it instead.");
    await event(c, auth, ref.id, "deleted", {
      account: rec.account,
      periodStart: rec.periodStart,
      periodEnd: rec.periodEnd,
      clearedCount: rec.clearedCount,
    });
    await c.query("DELETE FROM bank_reconciliations WHERE company_id=$1 AND id=$2", [
      ref.companyId,
      ref.id,
    ]);
    return { id: ref.id };
  });
}
