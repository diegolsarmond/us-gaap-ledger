// Bank reconciliation (database/039_bank_reconciliations.sql) over the existing Bank Feed tables.
// Runs every migration in a throwaway schema and checks balances, partial clearing, completion
// rules, audit history, period locks, multi-tenant isolation and that the ledger is never touched.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { randomUUID } from "node:crypto";
import pg from "pg";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.includes("/src/")) {
      const url = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(url)) return next(url.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith("/src/lib/auth.server.ts"))
      return {
        format: "module",
        source: "export async function readSession(){return globalThis.testLedgerSession??null}",
        shortCircuit: true,
      };
    return next(url, context);
  },
});
const admin = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const schema = "bank_recon_test_" + randomUUID().replaceAll("-", "");
let pool;
const rejects = (promise, pattern) => assert.rejects(promise, pattern);
try {
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("options", "-c search_path=" + schema);
  process.env.DATABASE_URL = url.href;
  pool = (await import("../src/lib/db.server.ts")).db();
  const current = (await pool.query("SELECT current_schema() AS s")).rows[0].s;
  assert.equal(current, schema, "tests must never run against the application schema");
  for (const file of readdirSync(new URL("../database/", import.meta.url))
    .filter((f) => f.endsWith(".sql") && !/^(000|024)_/.test(f))
    .sort())
    await pool.query(readFileSync(new URL("../database/" + file, import.meta.url), "utf8"));

  const user = (
    await pool.query(
      "INSERT INTO app_users(name,email,password_hash,profile_id) SELECT 'Recon Tester','bank-recon@test.invalid',$1,id FROM access_profiles WHERE system_admin RETURNING id,name,email",
      ["0".repeat(32) + ":" + "0".repeat(128)],
    )
  ).rows[0];
  globalThis.testLedgerSession = user;
  const service = await import("../src/lib/bank-reconciliation.server.ts");

  async function company(name) {
    const id = (
      await pool.query(
        "INSERT INTO companies(name,entity,state) VALUES($1,'LLC','FL') RETURNING id",
        [name],
      )
    ).rows[0].id;
    const accounts = [
      ["1000", "Checking Account", "Asset", "Debit", "Checking"],
      ["4000", "Sales", "Revenue", "Credit", "Sales of product income"],
      ["6000", "Bank fees", "Operating Expense", "Debit", "Bank charges"],
    ];
    for (const [i, [code, label, type, balance, detail]] of accounts.entries())
      await pool.query(
        `INSERT INTO ledger_accounts(company_id,id,position,code,name,type,balance_type,description,detail_type)
         VALUES($1,$2,$3,$2,$4,$5,$6,'',$7)`,
        [id, code, i, label, type, balance, detail],
      );
    await pool.query(
      `INSERT INTO ledger_fiscalperiods(company_id,id,position,period_code,fiscal_year,start_date,end_date,status)
       VALUES($1,'p2026',0,'2026',2026,'2026-01-01','2026-12-31','Open')`,
      [id],
    );
    await pool.query(
      `INSERT INTO ledger_statements(company_id,id,position,content,file_name,account_code,file_type,rows_count,
         uploaded_at,uploaded_by,status,feed_currency)
       VALUES($1,'file1',0,'','nov.csv','1000','CSV',7,'2026-12-01','Recon Tester','Processed','USD')`,
      [id],
    );
    const rows = [
      ["r1", "2026-11-03", "Client payment", "2500.00", "Classified"],
      ["r2", "2026-11-04", "Office rent", "-1200.00", "Classified"],
      ["r3", "2026-11-05", "Vendor payment", "-800.00", "Classified"],
      ["r4", "2026-11-06", "Bank deposit", "3800.00", "Classified"],
      ["r5", "2026-11-07", "Bank fee", "-200.00", "Pending"],
      ["r6", "2026-11-08", "Duplicate import", "-50.00", "Excluded"],
      ["r7", "2026-12-02", "December deposit", "100.00", "Classified"],
    ];
    for (const [i, [rowId, date, description, amount, status]] of rows.entries())
      await pool.query(
        `INSERT INTO ledger_stagingrows(company_id,id,position,file_id,date,description,amount,suggested_account,status)
         VALUES($1,$2,$3,'file1',$4,$5,$6,'',$7)`,
        [id, rowId, i, date, description, amount, status],
      );
    const attempts = {};
    for (const rowId of ["r1", "r2", "r3", "r4"])
      attempts[rowId] = (
        await pool.query(
          "INSERT INTO bank_feed_attempts(company_id,row_id,kind,state) VALUES($1,$2,'category','posted') RETURNING id",
          [id, rowId],
        )
      ).rows[0].id;
    // December line is matched, but its only link to a posted movement is inactive.
    attempts.r7 = (
      await pool.query(
        "INSERT INTO bank_feed_attempts(company_id,row_id,kind,state) VALUES($1,'r7','match','posted') RETURNING id",
        [id],
      )
    ).rows[0].id;
    await pool.query(
      "INSERT INTO bank_feed_links(company_id,attempt_id,movement_key,active) VALUES($1,$2,'journal:x:1',false)",
      [id, attempts.r7],
    );
    return { id, attempts };
  }

  const a = await company("Reconciliation test A");
  const b = await company("Reconciliation test B");
  const ledgerSnapshot = async () =>
    (
      await pool.query(
        `SELECT (SELECT count(*) FROM journal_entries)::int AS journals,
                (SELECT count(*) FROM journal_entry_lines)::int AS lines,
                (SELECT count(*) FROM ledger_journals)::int AS legacy,
                (SELECT string_agg(state,',' ORDER BY id) FROM bank_feed_attempts) AS attempts,
                (SELECT string_agg(status,',' ORDER BY company_id,id) FROM ledger_stagingrows) AS rows`,
      )
    ).rows[0];

  // Account list only offers bank accounts with imported statements.
  const list = await service.listReconciliations({ companyId: a.id });
  assert.deepEqual(
    list.accounts.map((x) => [x.account, x.currency]),
    [["1000", "USD"]],
  );
  assert.equal(list.canWrite, true);

  const november = {
    companyId: a.id,
    account: "1000",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
  };
  await rejects(
    service.createReconciliation({ ...november, statementEndingBalance: "14500" }),
    /beginning balance/,
  );
  await rejects(
    service.createReconciliation({
      ...november,
      account: "4000",
      statementEndingBalance: "1",
      beginningBalance: "0",
    }),
    /bank or credit card/,
  );
  const { id: nov } = await service.createReconciliation({
    ...november,
    statementEndingBalance: "14500",
    beginningBalance: "10000",
  });
  let detail = await service.reconciliationDetail({ companyId: a.id, id: nov });
  assert.equal(detail.reconciliation.status, "draft");
  assert.deepEqual(
    detail.lines.map((l) => l.id),
    ["r1", "r2", "r3", "r4", "r5"],
    "excluded lines and lines after the statement date are not offered",
  );
  assert.equal(detail.lines.find((l) => l.id === "r5").accounted, false);
  assert.equal(detail.canEditBeginning, true);

  const before = await ledgerSnapshot();

  // Illustrative example: 4 of 5 selected leaves a 200.00 difference.
  const partial = await service.toggleReconciliationItems({
    companyId: a.id,
    id: nov,
    rowIds: ["r1", "r2", "r3", "r4"],
    cleared: true,
  });
  assert.equal(partial.status, "in_progress");
  assert.equal(partial.clearedBalance, "14300.0000");
  assert.equal(partial.difference, "200.0000");
  assert.equal(partial.clearedCount, 4);
  await rejects(service.completeReconciliation({ companyId: a.id, id: nov }), /difference/i);

  // Unclear + clear again is idempotent on totals.
  await service.toggleReconciliationItems({
    companyId: a.id,
    id: nov,
    rowIds: ["r2"],
    cleared: false,
  });
  const again = await service.toggleReconciliationItems({
    companyId: a.id,
    id: nov,
    rowIds: ["r2", "r5"],
    cleared: true,
  });
  // The fee lowers the cleared balance to 14,100; the statement ending is corrected to match.
  assert.equal(again.difference, "400.0000");
  await service.updateReconciliation({ companyId: a.id, id: nov, statementEndingBalance: "14100" });
  detail = await service.reconciliationDetail({ companyId: a.id, id: nov });
  assert.equal(detail.reconciliation.clearedBalance, "14100.0000");
  assert.equal(detail.reconciliation.difference, "0.0000");
  await rejects(
    service.completeReconciliation({ companyId: a.id, id: nov }),
    /not posted or matched.*Bank fee/,
  );
  await rejects(
    service.toggleReconciliationItems({ companyId: a.id, id: nov, rowIds: ["r6"], cleared: true }),
    /Excluded/,
  );
  await rejects(
    service.toggleReconciliationItems({ companyId: a.id, id: nov, rowIds: ["r7"], cleared: true }),
    /after the statement ending date/,
  );

  // Once the fee is posted in the Bank Feed the reconciliation can be completed.
  const feeAttempt = (
    await pool.query(
      "INSERT INTO bank_feed_attempts(company_id,row_id,kind,state) VALUES($1,'r5','category','posted') RETURNING id",
      [a.id],
    )
  ).rows[0].id;
  await pool.query(
    "UPDATE ledger_stagingrows SET status='Classified' WHERE company_id=$1 AND id='r5'",
    [a.id],
  );
  const ledgerBeforeCompletion = await ledgerSnapshot();
  await service.completeReconciliation({ companyId: a.id, id: nov });
  assert.deepEqual(
    await ledgerSnapshot(),
    ledgerBeforeCompletion,
    "completing must not create or change journals, attempts or bank lines",
  );
  assert.equal(before.journals, ledgerBeforeCompletion.journals);
  detail = await service.reconciliationDetail({ companyId: a.id, id: nov });
  assert.equal(detail.reconciliation.status, "completed");
  assert.equal(detail.reconciliation.completedBy, "Recon Tester");
  assert.equal(detail.canEdit, false);
  assert.equal(detail.canDelete, false);
  const frozen = (
    await pool.query(
      "SELECT row_id,attempt_id FROM bank_reconciliation_items WHERE company_id=$1 AND reconciliation_id=$2 ORDER BY row_id",
      [a.id, nov],
    )
  ).rows;
  assert.deepEqual(
    frozen.map((r) => [r.row_id, r.attempt_id]),
    [
      ["r1", a.attempts.r1],
      ["r2", a.attempts.r2],
      ["r3", a.attempts.r3],
      ["r4", a.attempts.r4],
      ["r5", feeAttempt],
    ],
  );

  // Completed reconciliations are frozen in the service and in the database.
  await rejects(
    service.toggleReconciliationItems({ companyId: a.id, id: nov, rowIds: ["r1"], cleared: false }),
    /Reopen/,
  );
  await rejects(service.updateReconciliation({ companyId: a.id, id: nov, notes: "x" }), /Reopen/);
  await rejects(service.deleteReconciliation({ companyId: a.id, id: nov }), /cannot be deleted/);
  await rejects(
    pool.query("DELETE FROM bank_reconciliation_items WHERE company_id=$1 AND row_id='r1'", [a.id]),
    /reopened before cleared items change/,
  );
  await rejects(
    pool.query(
      "UPDATE bank_reconciliations SET statement_ending_balance=1,difference=1-cleared_balance WHERE id=$1",
      [nov],
    ),
    /must be reopened/,
  );
  await rejects(
    pool.query("UPDATE bank_feed_attempts SET state='undone' WHERE id=$1", [a.attempts.r1]),
    /completed bank reconciliation/,
  );
  await rejects(pool.query("DELETE FROM bank_reconciliation_events"), /append-only/);

  // Next period: sequential, beginning balance carried forward.
  await rejects(
    service.createReconciliation({
      ...november,
      periodStart: "2026-11-15",
      periodEnd: "2026-12-31",
      statementEndingBalance: "0",
    }),
    /start after 2026-11-30/,
  );
  const { id: dec } = await service.createReconciliation({
    ...november,
    periodStart: "2026-12-01",
    periodEnd: "2026-12-31",
    statementEndingBalance: "14200",
    beginningBalance: "999",
  });
  detail = await service.reconciliationDetail({ companyId: a.id, id: dec });
  assert.equal(detail.reconciliation.beginningBalance, "14100.0000");
  assert.equal(detail.canEditBeginning, false);
  assert.deepEqual(
    detail.lines.map((l) => l.id),
    ["r7"],
    "November items are not offered again",
  );
  await rejects(
    service.reopenReconciliation({ companyId: a.id, id: nov, reason: "fix" }),
    /most recent/,
  );
  await rejects(
    service.updateReconciliation({ companyId: a.id, id: dec, beginningBalance: "1" }),
    /previous reconciliation/,
  );
  // A match counts only while one of its links is active.
  const decState = await service.toggleReconciliationItems({
    companyId: a.id,
    id: dec,
    rowIds: ["r7"],
    cleared: true,
  });
  assert.equal(decState.difference, "0.0000");
  await rejects(service.completeReconciliation({ companyId: a.id, id: dec }), /December deposit/);
  await pool.query("UPDATE bank_feed_links SET active=true WHERE attempt_id=$1", [a.attempts.r7]);

  // isPeriodClosed blocks every change.
  await pool.query("UPDATE companies SET period_closed=true WHERE id=$1", [a.id]);
  await rejects(service.completeReconciliation({ companyId: a.id, id: dec }), /period is closed/);
  await rejects(
    service.toggleReconciliationItems({ companyId: a.id, id: dec, rowIds: ["r7"], cleared: false }),
    /period is closed/,
  );
  assert.equal((await service.listReconciliations({ companyId: a.id })).canWrite, false);
  await pool.query("UPDATE companies SET period_closed=false WHERE id=$1", [a.id]);
  await service.completeReconciliation({ companyId: a.id, id: dec });

  // Reopen only the latest one, with a reason, and never in a locked fiscal period.
  await pool.query("UPDATE ledger_fiscalperiods SET status='Locked' WHERE company_id=$1", [a.id]);
  await rejects(
    service.reopenReconciliation({ companyId: a.id, id: dec, reason: "late fee" }),
    /locked or closed/,
  );
  await pool.query("UPDATE ledger_fiscalperiods SET status='Open' WHERE company_id=$1", [a.id]);
  await service.reopenReconciliation({ companyId: a.id, id: dec, reason: "late fee" });
  detail = await service.reconciliationDetail({ companyId: a.id, id: dec });
  assert.equal(detail.reconciliation.status, "reopened");
  assert.equal(detail.reconciliation.reopenReason, "late fee");
  assert.equal(detail.reconciliation.reopenedBy, "Recon Tester");
  assert.equal(detail.canEdit, true);
  assert.equal(detail.canDelete, false, "a reconciliation that was ever completed is kept");
  await rejects(service.deleteReconciliation({ companyId: a.id, id: dec }), /cannot be deleted/);
  // Reopened: undoing the posting is allowed again (rolled back here).
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("UPDATE bank_feed_attempts SET state='undone' WHERE id=$1", [a.attempts.r7]);
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
  await service.completeReconciliation({ companyId: a.id, id: dec });

  const history = detail.events.map((e) => e.action).reverse();
  assert.deepEqual(history, ["created", "cleared", "completed", "reopened"]);
  const novHistory = (await service.reconciliationDetail({ companyId: a.id, id: nov })).events
    .map((e) => e.action)
    .reverse();
  assert.deepEqual(novHistory, [
    "created",
    "cleared",
    "uncleared",
    "cleared",
    "updated",
    "completed",
  ]);
  assert.ok(
    (
      await pool.query(
        "SELECT 1 FROM system_audit_log WHERE entity='bank_reconciliations' AND company_id=$1 AND actor_id=$2",
        [a.id, user.id],
      )
    ).rowCount,
    "row changes reach the system audit log with the acting user",
  );

  // Multi-tenant isolation: company B cannot see or touch company A's reconciliation or lines.
  await rejects(service.reconciliationDetail({ companyId: b.id, id: nov }), /unavailable/);
  const { id: bNov } = await service.createReconciliation({
    ...november,
    companyId: b.id,
    statementEndingBalance: "10000",
    beginningBalance: "10000",
  });
  await rejects(
    pool.query(
      `INSERT INTO bank_reconciliation_items(company_id,reconciliation_id,row_id,amount,cleared_by)
       VALUES($1,$2,'r1',1,$3)`,
      [a.id, bNov, user.id],
    ),
    /foreign key|unavailable/,
  );
  // Draft reconciliations that were never completed can be deleted; history survives.
  await service.deleteReconciliation({ companyId: b.id, id: bNov });
  assert.equal(
    (
      await pool.query(
        "SELECT string_agg(action,',' ORDER BY id) AS a FROM bank_reconciliation_events WHERE reconciliation_id=$1",
        [bNov],
      )
    ).rows[0].a,
    "created,deleted",
  );
  console.log("Bank reconciliation tests passed.");
} finally {
  await pool?.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
  await admin.end();
}
