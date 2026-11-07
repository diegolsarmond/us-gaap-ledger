import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { randomUUID } from "node:crypto";
import pg from "pg";
registerHooks({
  resolve(s, c, n) {
    if (s.startsWith(".") && c.parentURL?.includes("/src/")) {
      const u = new URL(s + ".ts", c.parentURL);
      if (existsSync(u)) return n(u.href, c);
    }
    return n(s, c);
  },
  load(u, c, n) {
    if (u.endsWith("/src/lib/auth.server.ts"))
      return {
        format: "module",
        source: "export async function readSession(){return globalThis.journalSession}",
        shortCircuit: true,
      };
    if (u.endsWith("/src/lib/db.server.ts"))
      return {
        format: "module",
        source: "export function db(){return globalThis.journalDb}",
        shortCircuit: true,
      };
    return n(u, c);
  },
});
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const schema = "journal_test_" + randomUUID().replaceAll("-", "");
let created = false;
try {
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  await client.query(`SET search_path TO "${schema}"`);
  for (const file of readdirSync(new URL("../database/", import.meta.url))
    .filter((x) => x.endsWith(".sql") && !/^(000|024)/.test(x))
    .sort())
    await client.query(readFileSync(new URL("../database/" + file, import.meta.url), "utf8"));
  globalThis.journalDb = {
    query: (...args) => client.query(...args),
    connect: async () => ({ query: (...args) => client.query(...args), release() {} }),
  };
  const { executeJournal: run } = await import("../src/lib/journal.server.ts");
  const { replaceLedger, readLedger, readLedgerDomains } =
    await import("../src/lib/ledger-storage.server.ts");
  const admin = (await client.query("SELECT id FROM access_profiles WHERE system_admin LIMIT 1"))
    .rows[0].id;
  const user = (
    await client.query(
      "INSERT INTO app_users(name,email,password_hash,profile_id) VALUES('Journal tester','journal@test.local','00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',$1) RETURNING id",
      [admin],
    )
  ).rows[0].id;
  const approver = (
    await client.query(
      "INSERT INTO app_users(name,email,password_hash,profile_id) VALUES('Approver','approver@test.local','00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',$1) RETURNING id",
      [admin],
    )
  ).rows[0].id;
  const company = (
    await client.query(
      "INSERT INTO companies(name,entity,state) VALUES('Journal test','LLC','FL') RETURNING id",
    )
  ).rows[0].id;
  const other = (
    await client.query(
      "INSERT INTO companies(name,entity,state) VALUES('Other','LLC','FL') RETURNING id",
    )
  ).rows[0].id;
  globalThis.journalSession = { id: user, name: "Journal tester", email: "journal@test.local" };
  await client.query("BEGIN");
  await replaceLedger(client, company, "accounts", [
    { code: "1000", name: "Cash", type: "Asset", balanceType: "Debit", description: "" },
    { code: "4000", name: "Revenue", type: "Revenue", balanceType: "Credit", description: "" },
  ]);
  await replaceLedger(client, company, "currencies", [
    { code: "USD", name: "US Dollar", isBaseCurrency: true, status: "Active" },
    { code: "EUR", name: "Euro", isBaseCurrency: false, status: "Active" },
  ]);
  await replaceLedger(client, company, "fiscalPeriods", [
    {
      id: "p1",
      periodCode: "2026-01",
      fiscalYear: "2026",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      status: "Open",
    },
    {
      id: "p2",
      periodCode: "2026-02",
      fiscalYear: "2026",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      status: "Locked",
    },
  ]);
  await client.query("COMMIT");
  const value = {
    journalType: "Manual",
    accountingDate: "2026-01-10",
    description: "Exact test",
    reference: "",
    currency: "USD",
    exchangeRate: "1",
    exchangeRateSource: "Parity",
    lines: [
      { accountCode: "1000", description: "", debit: "0.30", credit: "0" },
      { accountCode: "4000", description: "", debit: "0", credit: "0.30" },
    ],
  };
  const call = (operation, extra = {}) => run({ companyId: company, operation, ...extra });
  const incomplete = (
    await call("save", {
      value: {
        ...value,
        description: "",
        lines: [
          { accountCode: "", description: "", debit: "", credit: "" },
          { accountCode: "", description: "", debit: "", credit: "" },
        ],
      },
    })
  ).entry;
  await assert.rejects(
    () => call("submit", { id: incomplete.id, version: incomplete.version }),
    /operational event/,
  );
  assert.equal(incomplete.accounting_date, "2026-01-10");
  let j = (await call("save", { value })).entry;
  assert.equal(j.status, "Draft");
  assert.equal(
    (await call("balances", { filters: { from: "2026-01-01", to: "2026-01-31", page: 0 } })).rows[0]
      .closing_debit,
    "0",
  );
  await assert.rejects(() => call("post", { id: j.id, version: j.version }), /approval/);
  j = (await call("submit", { id: j.id, version: j.version })).entry;
  await assert.rejects(() => call("approve", { id: j.id, version: j.version }), /creator/);
  globalThis.journalSession = { id: approver, name: "Approver", email: "approver@test.local" };
  j = (await call("approve", { id: j.id, version: j.version })).entry;
  j = (await call("post", { id: j.id, version: j.version })).entry;
  assert.equal(j.status, "Posted");
  assert.equal(j.journal_number, "JE-00000001");
  await assert.rejects(() => call("save", { id: j.id, version: j.version, value }), /Only drafts/);
  const b = (await call("balances", { filters: { from: "2026-01-11", to: "2026-01-31", page: 0 } }))
    .rows;
  assert.equal(b[0].opening_debit, "0.3000");
  assert.equal(b[1].closing_credit, "0.3000");
  const projection = await readLedger(client, company, "journals");
  assert.equal(projection.length, 1);
  assert.equal(projection[0].lines[0].debit, 0.3);
  await client.query("BEGIN");
  await replaceLedger(client, company, "journals", projection);
  await client.query("COMMIT");
  assert.equal((await readLedger(client, company, "journals")).length, 1);
  await assert.rejects(
    () => run({ companyId: other, operation: "detail", id: j.id }),
    /unavailable/,
  );
  await assert.rejects(
    () =>
      call("reverse", {
        id: j.id,
        version: j.version,
        reason: "Wrong date",
        reversalDate: "2026-02-01",
      }),
    /closed/,
  );
  const reversed = (
    await call("reverse", {
      id: j.id,
      version: j.version,
      reason: "Correction",
      reversalDate: "2026-01-12",
    })
  ).entry;
  assert.equal(reversed.status, "Posted");
  assert.equal(reversed.reversal_of_entry_id, j.id);
  await assert.rejects(
    () =>
      call("reverse", {
        id: j.id,
        version: j.version,
        reason: "Again",
        reversalDate: "2026-01-12",
      }),
    /already reversed/,
  );
  assert.equal((await call("detail", { id: j.id })).entry.status, "Posted");
  assert.equal(
    (await call("balances", { filters: { from: "2026-01-01", to: "2026-01-31", page: 0 } })).rows[0]
      .closing_debit,
    "0.0000",
  );
  await assert.rejects(
    () => client.query("UPDATE journal_entries SET description=$2 WHERE id=$1", [j.id, "Tamper"]),
    /immutable/,
  );
  await assert.rejects(
    () => client.query("DELETE FROM journal_entry_lines WHERE journal_entry_id=$1", [j.id]),
    /immutable/,
  );
  const source = {
    module: "Invoices",
    type: "Invoice",
    id: "inv1",
    eventId: "issued1",
    eventVersion: 1,
    idempotencyKey: "invoice1",
    contractVersion: 1,
  };
  const automatic = (await call("event", { value, source })).entry;
  assert.equal(automatic.status, "Pending Approval");
  assert.equal((await call("event", { value, source })).entry.id, automatic.id);
  await assert.rejects(
    () => call("event", { value: { ...value, description: "Different" }, source }),
    /conflict/,
  );
  const unbalanced = { ...value, lines: [value.lines[0], { ...value.lines[1], credit: "0.31" }] };
  const draft = (await call("save", { value: unbalanced })).entry;
  await assert.rejects(() => call("submit", { id: draft.id, version: draft.version }), /balance/);
  await assert.rejects(
    () =>
      call("save", {
        value: { ...value, lines: [{ ...value.lines[0], accountCode: "OTHER" }, value.lines[1]] },
      }),
    /analytical/,
  );
  await assert.rejects(
    () =>
      call("save", {
        value: { ...value, lines: [{ ...value.lines[0], debit: "0.001" }, value.lines[1]] },
      }),
    /precision/,
  );
  const fx = (
    await call("save", {
      value: {
        ...value,
        currency: "EUR",
        exchangeRate: "1.123456789012",
        exchangeRateSource: "Historical documented rate",
      },
    })
  ).entry;
  assert.equal((await call("detail", { id: fx.id })).lines[0].base_debit, "0.3400");

  const { loadConfiguration, saveConfiguration } =
    await import("../src/lib/journal-configuration.server.ts");
  let configuration = await loadConfiguration(company);
  await saveConfiguration({
    ...configuration,
    accounts: configuration.accounts.map((a) => (a.code === "1000" ? { ...a, active: false } : a)),
  });
  await assert.rejects(() => call("save", { value }), /inactive/);
  await saveConfiguration({
    ...configuration,
    accounts: configuration.accounts.map((a) =>
      a.code === "1000" ? { ...a, costCenterRequired: true } : a,
    ),
  });
  const missingCenter = (await call("save", { value })).entry;
  await assert.rejects(
    () => call("submit", { id: missingCenter.id, version: missingCenter.version }),
    /cost center/,
  );
  await saveConfiguration({ ...configuration, approvalRequired: false, openingDate: "2026-01-01" });
  const direct = (await call("save", { value })).entry;
  await assert.rejects(
    () => call("save", { id: direct.id, version: direct.version + 1, value }),
    /version conflict/,
  );
  assert.equal(
    (await call("post", { id: direct.id, version: direct.version })).entry.status,
    "Posted",
  );
  await assert.rejects(
    () => call("save", { value: { ...value, journalType: "Opening" } }),
    /authorized migration date/,
  );
  const opening = (
    await call("save", {
      value: { ...value, journalType: "Opening", accountingDate: "2026-01-01" },
    })
  ).entry;
  assert.equal(
    (await call("post", { id: opening.id, version: opening.version })).entry.status,
    "Posted",
  );
  const secondOpening = (
    await call("save", {
      value: { ...value, journalType: "Opening", accountingDate: "2026-01-01" },
    })
  ).entry;
  await assert.rejects(
    () => call("post", { id: secondOpening.id, version: secondOpening.version }),
    /overlap/,
  );
  const countBefore = (await client.query("SELECT count(*)::int AS n FROM journal_entries")).rows[0]
    .n;
  await assert.rejects(
    () =>
      call("event", {
        value: unbalanced,
        source: { ...source, eventId: "bad-event", idempotencyKey: "bad-key" },
      }),
    /balance/,
  );
  assert.equal(
    (await client.query("SELECT count(*)::int AS n FROM journal_entries")).rows[0].n,
    countBefore,
    "failed automatic events roll back completely",
  );
  await client.query("BEGIN");
  await client.query("UPDATE journal_entries SET status='Posted' WHERE id=$1", [draft.id]);
  await assert.rejects(() => client.query("COMMIT"), /balance/);
  await client.query("ROLLBACK");
  const { accountingDateLabel, updateJournalLines } = await import("../src/lib/journal-model.ts");
  assert.equal(accountingDateLabel("2026-11-02"), "November 2, 2026");
  assert.equal(accountingDateLabel("2026-02-11"), "February 11, 2026");
  assert.equal(accountingDateLabel("02/11/2026"), "");
  const changed = updateJournalLines(value.lines, 0, { credit: "12.50" });
  assert.equal(changed[0].debit, "0");
  assert.equal(changed[0].credit, "12.50");
  assert.deepEqual(changed[1], value.lines[1]);
  assert.equal(updateJournalLines(changed, 0, { debit: "3" })[0].credit, "0");
  assert.equal(updateJournalLines(value.lines, 0, { accountCode: "4000" })[1].accountCode, "4000");
  const { convertedUnits } = await import("../src/lib/journal-model.ts");
  assert.equal(convertedUnits("0.30", "1.123456789012"), 3400n);
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    options: "-c search_path=" + schema,
    max: 2,
  });
  const originalDb = globalThis.journalDb;
  globalThis.journalDb = pool;
  try {
    const concurrentSource = { ...source, eventId: "concurrent", idempotencyKey: "concurrent" };
    const [a, b] = await Promise.all([
      call("event", { value, source: concurrentSource }),
      call("event", { value, source: concurrentSource }),
    ]);
    assert.equal(a.entry.id, b.entry.id);
    assert.equal(a.entry.status, "Posted");
    const concurrent = (await call("save", { value })).entry;
    const posts = await Promise.allSettled([
      call("post", { id: concurrent.id, version: concurrent.version }),
      call("post", { id: concurrent.id, version: concurrent.version }),
    ]);
    assert.equal(posts.filter((r) => r.status === "fulfilled").length, 1);
  } finally {
    globalThis.journalDb = originalDb;
    await pool.end();
  }
  // A profile without company scope cannot query journals, even with valid IDs.
  const restricted = (
    await client.query(
      "INSERT INTO access_profiles(name) VALUES('Restricted journal test') RETURNING id",
    )
  ).rows[0].id;
  await client.query("UPDATE app_users SET profile_id=$2 WHERE id=$1", [approver, restricted]);
  await assert.rejects(() => call("detail", { id: j.id }), /access denied/);
  assert.ok(
    (
      await client.query(
        "SELECT count(*)::int AS n FROM system_audit_log WHERE action='JOURNAL_FAILURE'",
      )
    ).rows[0].n > 0,
  );
  const { createAccountingEngine, createInitialCompanyData } =
    await import("../src/lib/accounting-engine.ts");
  await client.query("BEGIN");
  try {
    await client.query(`TRUNCATE "${schema}".journal_entry_lines`);
    const journals = await readLedger(client, company, "journals");
    assert.ok(journals.length > 0);
    assert.ok(journals.every((entry) => Array.isArray(entry.lines) && entry.lines.length === 0));
    const state = Object.assign(
      createInitialCompanyData(),
      await readLedgerDomains(client, company, ["accounts", "journals"]),
    );
    const engine = createAccountingEngine(state, {}, {});
    assert.equal(engine.value.incompleteJournalCount, journals.length);
    assert.equal(engine.value.isLedgerBalanced, false);
  } finally {
    await client.query("ROLLBACK");
  }
  console.log(
    "PASS: draft/approval/post/reversal, exact currency amounts, opening balances, immutable GL, idempotency, versioning, company scope, closed periods, rollback, audit and legacy read integration.",
  );
} finally {
  if (created) {
    await client.query("ROLLBACK");
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
  await client.end();
}
