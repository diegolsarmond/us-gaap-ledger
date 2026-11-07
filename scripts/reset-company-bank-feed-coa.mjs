import pg from "pg";

const [companyId, ...flags] = process.argv.slice(2);
const apply = flags.includes("--apply");
const discardPending = flags.includes("--discard-pending-bank-feed");
const detachRejected = discardPending || flags.includes("--detach-rejected");
if (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId ?? "") ||
  flags.some(
    (flag) => !["--apply", "--detach-rejected", "--discard-pending-bank-feed"].includes(flag),
  ) ||
  !process.env.DATABASE_URL
) {
  throw new Error(
    "Usage: node --env-file=.env scripts/reset-company-bank-feed-coa.mjs COMPANY_UUID [--apply] [--detach-rejected | --discard-pending-bank-feed]",
  );
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const query = (sql) => client.query(sql, [companyId]);
const affected = [
  [
    "bank_feed_allocations",
    "attempt_id IN (SELECT id FROM bank_feed_attempts WHERE company_id=$1)",
  ],
  ["bank_feed_links", "company_id=$1"],
  ["bank_feed_attachments", "company_id=$1"],
  ["bank_feed_attempts", "company_id=$1"],
  ["ledger_references", "company_id=$1 AND source_domain IN ('statements','stagingRows')"],
  ["ledger_stagingrows", "company_id=$1"],
  ["ledger_statements", "company_id=$1"],
  ["bank_feed_balances", "company_id=$1"],
  ["bank_feed_rules", "company_id=$1"],
  ["ledger_accounts", "company_id=$1"],
];
const blockers = [
  ["Active Bank Feed reconciliation links", "bank_feed_links", "company_id=$1 AND active"],
  ["Legacy journal lines", "ledger_journals_lines", "company_id=$1"],
  [
    "Cash accounts linked to the CoA",
    "cash_accounts",
    "company_id=$1 AND gl_account_code IS NOT NULL",
  ],
  [
    "Cash transactions linked to the CoA",
    "cash_transactions",
    "company_id=$1 AND gl_account_code IS NOT NULL",
  ],
  ["Automatic posting roles", "ledger_postingaccounts", "company_id=$1"],
  ["Journal account rules", "journal_account_rules", "company_id=$1"],
  [
    "Vendor default expense accounts",
    "ledger_vendors",
    "company_id=$1 AND coalesce(default_expense_account_code,'') <> ''",
  ],
  ["Bill line accounts", "ledger_bills_items", "company_id=$1 AND coalesce(account_code,'') <> ''"],
  [
    "Expense categories linked to the CoA",
    "ledger_expensecategories",
    "company_id=$1 AND coalesce(gl_account_code,'') <> ''",
  ],
  [
    "Tax jurisdictions linked to the CoA",
    "ledger_taxjurisdictions",
    "company_id=$1 AND coalesce(gl_account_code,'') <> ''",
  ],
  [
    "Other ledger references",
    "ledger_references",
    "company_id=$1 AND (account_id IS NOT NULL OR statement_id IS NOT NULL) AND source_domain NOT IN ('statements','stagingRows')",
  ],
];
const count = async (table, filter) =>
  (await query(`SELECT count(*)::int AS count FROM ${table} WHERE ${filter}`)).rows[0].count;

try {
  await client.connect();
  await client.query(apply ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query("SET LOCAL lock_timeout = '10s'");
  if (apply) await client.query("SELECT pg_advisory_xact_lock(803003)");
  const company = (
    await query(`SELECT name FROM companies WHERE id=$1${apply ? " FOR UPDATE" : ""}`)
  ).rows[0];
  if (!company) throw new Error("Company not found.");
  console.log(`${apply ? "Apply" : "Preview"} · ${company.name} · ${companyId}`);

  const counts = {};
  for (const [table, filter] of affected) counts[table] = await count(table, filter);
  console.table(counts);
  const pending = discardPending
    ? (
        await query(
          `SELECT a.id AS attempt_id, j.id AS journal_id, j.status
             FROM bank_feed_attempts a
             JOIN journal_entries j ON j.id=a.journal_id AND j.company_id=a.company_id
            WHERE a.company_id=$1 AND a.state='pending' AND a.kind IN ('category','settlement')
              AND a.legacy_journal_id IS NULL AND a.reversal_id IS NULL
              AND j.source_module='Bank Feed' AND j.journal_type='Automatic'
              AND j.status='Pending Approval' AND j.posted_at IS NULL AND j.journal_number IS NULL
            ORDER BY j.id`,
        )
      ).rows
    : [];
  const pendingJournals = new Set(pending.map((row) => row.journal_id));
  if (pending.length) {
    console.log("Pending Bank Feed journals to reject and detach:");
    console.table(pending);
  }

  const conflicts = [];
  const unreleased = (
    await client.query(
      `SELECT count(*)::int AS count FROM bank_feed_attempts
        WHERE company_id=$1 AND NOT (id=ANY($2::uuid[]))
          AND (state <> 'rejected' OR legacy_journal_id IS NOT NULL OR reversal_id IS NOT NULL)`,
      [companyId, pending.map((row) => row.attempt_id)],
    )
  ).rows[0].count;
  if (unreleased)
    conflicts.push(`Bank Feed attempts with unreleased or historical journal links: ${unreleased}`);
  for (const [label, table, filter] of blockers) {
    const n = await count(table, filter);
    if (n) conflicts.push(`${label}: ${n}`);
  }
  const journalLines = (
    await query(
      `SELECT j.id AS journal_id, j.status, j.source_module, l.line_number, l.account_code
       FROM journal_entry_lines l JOIN journal_entries j ON j.company_id=l.company_id AND j.id=l.journal_entry_id
      WHERE l.company_id=$1 AND l.account_code IS NOT NULL
      ORDER BY j.id,l.line_number`,
    )
  ).rows;
  const detachable = journalLines.filter(
    (line) =>
      line.source_module === "Bank Feed" &&
      (line.status === "Rejected" || pendingJournals.has(line.journal_id)),
  );
  const blocked = journalLines.length - detachable.length;
  if (blocked) conflicts.push(`Journal lines with accounts that must be preserved: ${blocked}`);
  if (journalLines.length) console.table(journalLines);
  if (detachable.length && !detachRejected)
    conflicts.push(
      `Rejected Bank Feed journal lines requiring explicit --detach-rejected: ${detachable.length}`,
    );
  if (conflicts.length) console.log(`Blocked:\n${conflicts.join("\n")}`);

  if (!apply) {
    await client.query("ROLLBACK");
  } else {
    if (conflicts.length)
      throw new Error("Resolve the listed dependencies before applying the reset.");
    if (Object.values(counts).some(Boolean) || detachable.length) {
      if (pendingJournals.size) {
        const rejected = await client.query(
          `UPDATE journal_entries SET status='Rejected',version=version+1
            WHERE company_id=$1 AND id=ANY($2::uuid[]) AND status='Pending Approval'`,
          [companyId, [...pendingJournals]],
        );
        if (rejected.rowCount !== pendingJournals.size)
          throw new Error("Pending journals changed during the reset. Run the preview again.");
      }
      if (detachable.length) {
        const detached = await client.query(
          `UPDATE journal_entry_lines l SET account_code=NULL
             FROM journal_entries j
            WHERE l.company_id=$1 AND j.company_id=l.company_id AND j.id=l.journal_entry_id
              AND j.id=ANY($2::uuid[])
              AND l.account_code IS NOT NULL AND j.status='Rejected' AND j.source_module='Bank Feed'`,
          [companyId, [...new Set(detachable.map((line) => line.journal_id))]],
        );
        if (detached.rowCount !== detachable.length)
          throw new Error("Journal lines changed during the reset. Run the preview again.");
      }
      for (const [table, filter] of affected) await query(`DELETE FROM ${table} WHERE ${filter}`);
      await query("UPDATE companies SET revision=revision+1 WHERE id=$1");
      await client.query(
        `INSERT INTO system_audit_log(actor_name,action,entity,target_id,company_id,before_data,after_data)
         VALUES(current_user,'RESET_BANK_FEED_COA','Company',$1::text,$1::uuid,$2,$3)`,
        [
          companyId,
          JSON.stringify({ counts, pendingJournals: pending, detachedJournalLines: detachable }),
          JSON.stringify({
            counts: Object.fromEntries(affected.map(([table]) => [table, 0])),
            rejectedJournalIds: [...pendingJournals],
          }),
        ],
      );
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    }
    await client.query("COMMIT");
    console.log("Company reset committed.");
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
