import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { registerHooks } from "node:module";
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
        source: "export async function readSession(){return globalThis.bankFeedSession}",
        shortCircuit: true,
      };
    if (url.endsWith("/src/lib/db.server.ts"))
      return {
        format: "module",
        source: "export function db(){return globalThis.bankFeedDb}",
        shortCircuit: true,
      };
    return next(url, context);
  },
});

const { parseStatementCsv, parseStatementFile, quickBooksAutoPost, sourceCategoryAccount } =
  await import("../src/lib/statement-csv.ts");
const { bankFilterData, bankFilterOptions, emptyBankFilters, matchesBankFilters } =
  await import("../src/lib/bank-feed-filters.ts");
const { isModuleAvailable } = await import("../src/lib/module-availability.ts");
assert(isModuleAvailable("/statements"));
const source = process.argv[2] ? readFileSync(process.argv[2], "utf8") : undefined;
if (source) {
  const rows = parseStatementCsv(source);
  assert.equal(rows.length, 300);
  assert.equal(rows.length - new Set(rows.map((r) => JSON.stringify(r))).size, 6);
  assert.equal(
    rows.reduce((s, r) => s + Math.round(r.amount * 100), 0),
    885445,
  );
  assert.equal(rows[0].date, "2026-11-02");
  assert.equal(rows[0].fromTo, "US Bank");
}
assert.equal(
  parseStatementCsv('date,description,amount\n2026-01-10,"Fee, account",-10.01')[0].amount,
  -10.01,
);
assert.equal(
  parseStatementCsv(
    '\uFEFFdate;Bank description;Amount;From/To;Transaction Posted\r\n01/10/2026;"Fee; with ""quotes""";-$1,020.01;Vendor;"Added to: Expense: 300 Accounts"',
  )[0].amount,
  -1020.01,
);
assert.throws(() => parseStatementCsv("date,description,amount\n2026-02-29,Invalid,2"), /Linha 2/);
assert.throws(
  () =>
    parseStatementCsv(
      "date;Bank description;Amount;From/To;Transaction Posted\n01/10/2026,Wrong",
      "EUR",
    ),
  /Linha 2/,
);
const reviewHeader =
  "Date,Check No.,Bank description,Spent,Received,From/To,Class,Location,Customer,Match/Categorize";
const reviewCsv =
  reviewHeader +
  '\n01/17/2026,000123,"Review fee, test","$1,250.30",,Supplier,Class A,Office,Buyer,6000 Fees' +
  "\n01/18/2026,,Review receipt,,$20.25,Buyer,,,,Unapplied Cash Payment Income";
const review = parseStatementFile(reviewCsv);
assert.equal(review.format, "quickbooks-review");
assert.deepEqual(
  review.rows.map((row) => row.amountText),
  ["-1250.30", "20.25"],
);
assert.equal(review.rows[0].sourceStatus, "Pending");
assert.equal(review.rows[0].checkNumber, "000123");
const cardReview = parseStatementFile(
  "Date,Check No.,Bank description,Amount,From/To,Class,Location,Customer,Match/Categorize\n" +
    '07/01/2026,000123,Card purchase,-$53.32,"Vendor, Inc.",Class A,Office,Buyer,6000 Fees\n' +
    "07/02/2026,,Card refund,$5.00,Vendor,,,,6000 Fees",
);
assert.equal(cardReview.format, "quickbooks-review");
assert.deepEqual(
  cardReview.rows.map((row) => row.amountText),
  ["-53.32", "5.00"],
);
assert.equal(cardReview.rows[0].sourceStatus, "Pending");
assert.equal(cardReview.rows[0].checkNumber, "000123");
assert.equal(cardReview.rows[0].fromTo, "Vendor, Inc.");
assert.equal(cardReview.rows[0].sourceClass, "Class A");
assert.equal(cardReview.rows[0].sourceLocation, "Office");
assert.equal(cardReview.rows[0].sourceCustomer, "Buyer");
assert.equal(cardReview.rows[0].externalPosting, "6000 Fees");
const postedCsv =
  "date,Bank description,Amount,From/To,Transaction Posted\n" +
  "01/19/2026,QuickBooks categorized,-10.00,,Added to: Expense: 6000 Fees\n" +
  "01/20/2026,QuickBooks matched,20.00,,Matched to: Deposit: 4000 Sales\n" +
  "01/21/2026,No posting information,30.00,,";
assert.deepEqual(
  parseStatementFile(postedCsv).rows.map((row) => row.sourceStatus),
  ["Posted", "Posted", null],
);
const postedWithDetailsCsv =
  'Transaction Posted,Location,Amount,Customer,Date,Bank description,Check No.,"Extra; field"\n' +
  'Matched to: Expense: 6000 Fees,Office,-$53.32,Buyer,7/1/2026,"Card, expense",000123,ignored';
const postedWithDetails = parseStatementFile(postedWithDetailsCsv);
assert.equal(postedWithDetails.format, "quickbooks-posted");
assert.equal(postedWithDetails.rows[0].date, "2026-07-01");
assert.equal(postedWithDetails.rows[0].amountText, "-53.32");
assert.equal(postedWithDetails.rows[0].sourceStatus, "Posted");
assert.equal(postedWithDetails.rows[0].checkNumber, "000123");
assert.equal(postedWithDetails.rows[0].sourceLocation, "Office");
assert.equal(postedWithDetails.rows[0].sourceCustomer, "Buyer");
assert.equal(postedWithDetails.rows[0].sourceClass, null);
assert.equal(quickBooksAutoPost("Added to: Expense: 6000 Fees · Auto-post (rule)"), "rule");
assert.equal(quickBooksAutoPost("Auto-post (match)"), "match");
assert.equal(quickBooksAutoPost("Matched to: Expense: 6000 Fees"), null);
assert.equal(
  parseStatementFile(
    "Date,Bank description,Amount,Match/Categorize\n07/01/2026,Card,-$53.32,6000 Fees",
  ).rows[0].sourceStatus,
  "Pending",
);
assert.equal(
  parseStatementFile("Date,Bank description,Amount\n07/01/2026,Card,-$53.32").rows[0].sourceStatus,
  null,
);
assert.throws(
  () => parseStatementFile("Date,Bank description,Amount,Amount\n07/01/2026,Card,1,2"),
  /colunas duplicadas/,
);
assert.throws(
  () => parseStatementFile("Date,Bank description,Amount,Spent,Received\n07/01/2026,Card,1,,1"),
  /Use o CSV/,
);
assert.throws(() => parseStatementFile(reviewCsv, "EUR"), /Linha 2/);
assert.throws(
  () => parseStatementFile(reviewHeader + "\n01/17/2026,,Both,$1.00,$2.00,,,,,"),
  /Linha 2/,
);
assert.equal(
  sourceCategoryAccount("6000 Fees", review.format, [
    { code: "6000" },
    { code: "QBO-6000", sourceAccount: { number: "6000", path: "Fees" } },
  ]),
  "QBO-6000",
);
console.log(
  "PASS: CSV parser, dates, quotes, delimiter and signed values" +
    (source ? ", including the 300-row sample." : "."),
);

if (!process.env.DATABASE_URL) {
  console.log("SKIP: PostgreSQL integration requires DATABASE_URL.");
  process.exit(0);
}
const schema = "bank_feed_test_" + randomUUID().replaceAll("-", "");
const root = new pg.Client({ connectionString: process.env.DATABASE_URL });
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c search_path=" + schema,
});
await root.connect();
try {
  await root.query(`CREATE SCHEMA "${schema}"`);
  globalThis.bankFeedDb = pool;
  const migrate = (file) =>
    pool.query(readFileSync(new URL("../database/" + file, import.meta.url), "utf8"));
  for (const file of readdirSync(new URL("../database/", import.meta.url)).sort()) {
    if (file.endsWith(".sql") && !/^(000|024|033|034)/.test(file)) await migrate(file);
  }
  const { replaceLedger, readLedger } = await import("../src/lib/ledger-storage.server.ts");
  const feed = await import("../src/lib/bank-feed.server.ts");
  const { executeJournal } = await import("../src/lib/journal.server.ts");
  const { generateTrialBalance } = await import("../src/lib/trial-balance.server.ts");
  const { outstanding } = await import("../src/lib/transaction-fx.ts");
  const profile = (await pool.query("SELECT id FROM access_profiles WHERE system_admin")).rows[0]
    .id;
  const staff = (
    await pool.query("INSERT INTO access_profiles(name) VALUES('Read only') RETURNING id")
  ).rows[0].id;
  const user = async (name, grant) =>
    (
      await pool.query(
        "INSERT INTO app_users(name,email,password_hash,profile_id) VALUES($1,$2,$3,$4) RETURNING id,name,email",
        [name, name.toLowerCase() + "@bank.test", "0".repeat(32) + ":" + "0".repeat(128), grant],
      )
    ).rows[0];
  const operator = await user("Operator", profile);
  const approver = await user("Approver", profile);
  const reader = await user("Reader", staff);
  globalThis.bankFeedSession = operator;
  const company = async (name) =>
    (
      await pool.query(
        "INSERT INTO companies(name,entity,state) VALUES($1,'LLC','FL') RETURNING id",
        [name],
      )
    ).rows[0].id;
  const companyId = await company("Bank Feed");
  const other = await company("Other");
  await pool.query("INSERT INTO profile_companies(profile_id,company_id) VALUES($1,$2)", [
    staff,
    other,
  ]);
  await pool.query(
    "INSERT INTO accounting_policies(company_id,approval_required) VALUES($1,false)",
    [companyId],
  );
  const account = (code, name, type = "Asset", balanceType = "Debit") => ({
    code,
    name,
    type,
    balanceType,
    description: "",
  });
  const setup = await pool.connect();
  try {
    await setup.query("BEGIN");
    await replaceLedger(setup, companyId, "accounts", [
      account("1000", "USD Bank"),
      account("1010", "EUR Bank"),
      account("1100", "Accounts Receivable"),
      account("2000", "Accounts Payable", "Liability", "Credit"),
      account("4000", "Sales", "Revenue", "Credit"),
      account("6000", "Fees", "Operating Expense"),
      account("6300", "FX", "Other Expense"),
      account("80200", "Discount", "Other Income", "Credit"),
    ]);
    await replaceLedger(setup, companyId, "currencies", [
      { code: "USD", name: "US Dollar", isBaseCurrency: true, status: "Active" },
      { code: "EUR", name: "Euro", isBaseCurrency: false, status: "Active" },
    ]);
    await replaceLedger(setup, companyId, "fiscalPeriods", [
      {
        id: "jan",
        periodCode: "2026-01",
        fiscalYear: "2026",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        status: "Open",
      },
      {
        id: "feb",
        periodCode: "2026-02",
        fiscalYear: "2026",
        startDate: "2026-02-01",
        endDate: "2026-02-28",
        status: "Open",
      },
    ]);
    await replaceLedger(setup, companyId, "statements", [
      {
        id: "legacy-file",
        accountCode: "1000",
        fileName: "legacy.csv",
        fileType: "CSV",
        rowsCount: 1,
        status: "Pending Review",
        uploadedAt: "2026-01-10",
        uploadedBy: "Operator",
      },
    ]);
    await replaceLedger(setup, companyId, "stagingRows", [
      {
        id: "legacy-row",
        fileId: "legacy-file",
        date: "2026-01-10",
        description: "Legacy classification",
        amount: -7,
        status: "Classified",
        suggestedAccount: "",
        classifiedAccount: "6000",
      },
    ]);
    await replaceLedger(setup, companyId, "journals", [
      {
        id: "legacy-journal",
        date: "2026-01-10",
        memo: "Legacy classification",
        sourceType: "BankStaging",
        status: "Posted",
        currency: "USD",
        fxRate: 1,
        createdBy: "Operator",
        createdAt: "2026-01-10",
        lines: [
          { id: "counter", accountCode: "6000", debit: 7, credit: 0 },
          { id: "bank", accountCode: "1000", debit: 0, credit: 7 },
        ],
      },
    ]);
    await setup.query(
      "INSERT INTO system_audit_log(actor_name,action,entity,target_id,company_id,after_data) VALUES('Operator','classifyStagingRow','Accounting',$1::uuid::text,$1::uuid,$2)",
      [
        companyId,
        JSON.stringify({
          stagingRows: { "legacy-row": { status: "Classified" } },
          journals: { "legacy-journal": { sourceType: "BankStaging" } },
        }),
      ],
    );
    await setup.query("COMMIT");
  } finally {
    setup.release();
  }
  await migrate("033_bank_feed.sql");
  await migrate("033_bank_feed.sql");
  await migrate("034_bank_feed_party.sql");
  await migrate("034_bank_feed_party.sql");
  const rows = async () => (await feed.bankFeedList({ companyId })).rows;
  const find = async (description) => (await rows()).find((row) => row.description === description);
  const action = (row, input) =>
    feed.bankFeedCommand({ companyId, input: { rowId: row.id, ...input } });
  const importFile = (content, account = "1000", currency = "USD") => ({
    companyId,
    account,
    currency,
    fileName: "test.csv",
    content,
  });
  const undo = (row, date = "2026-01-15") =>
    action(row, { operation: "undo", date, reason: "Test correction" });
  const category = (row, extra = {}) =>
    action(row, {
      operation: "categorize",
      transactionType: Number(row.amount) < 0 ? "Expense" : "Deposit",
      date: row.date,
      memo: row.description,
      lines: [{ account: "6000", amount: String(Math.abs(Number(row.amount))), description: "" }],
      ...extra,
    });
  assert.equal((await find("Legacy classification")).legacyJournalId, "legacy-journal");
  await undo(await find("Legacy classification"));
  assert.equal((await find("Legacy classification")).status, "Pending");

  if (source) {
    const file = importFile(source);
    assert.equal((await feed.previewBankImport(file)).total, "8854.4500");
    assert.equal((await feed.importBankFile(file)).count, 300);
    await assert.rejects(feed.importBankFile(file), /already imported/);
    const sample = (await rows()).filter((r) => r.externalPosting);
    assert.equal(sample.length, 300);
    assert(sample.every((row) => row.status === "Pending"));
  }
  const usdCsv =
    "date,description,amount\n2026-01-12,New payment,-60\n2026-01-13,New receipt,45\n2026-01-13,Competing receipt,45\n2026-01-14,Find recorded,20\n2026-01-14,Find competing,20\n2026-01-15,Duplicate,-6\n2026-01-15,Duplicate,-6\n2026-01-15,Exclude me,1";
  const uploads = await Promise.allSettled([
    feed.importBankFile(importFile(usdCsv)),
    feed.importBankFile(importFile(usdCsv)),
  ]);
  assert.equal(uploads.filter((x) => x.status === "fulfilled").length, 1);
  const duplicate = await find("Duplicate");
  assert.equal(duplicate.duplicate, true);
  await assert.rejects(category(duplicate), /duplicate/);
  const exclude = await find("Exclude me");
  await action(exclude, { operation: "exclude", reason: "Personal" });
  assert.equal((await find("Exclude me")).status, "Excluded");
  await action(exclude, { operation: "restore" });
  assert.equal((await find("Exclude me")).status, "Pending");
  const file = await action(exclude, {
    operation: "attach",
    name: "reference.txt",
    content: Buffer.from("sample").toString("base64"),
  });
  assert.equal(
    (await feed.bankFeedAttachment({ companyId, rowId: exclude.id, id: file.id })).name,
    "reference.txt",
  );

  const seed = await pool.connect();
  try {
    await seed.query("BEGIN");
    const bill = (id, amount) => ({
      id,
      billNumber: id,
      vendorName: "Supplier",
      date: "2025-12-10",
      dueDate: "2026-01-30",
      currency: "USD",
      fxRate: 1,
      foreignAmount: amount,
      usdAmount: amount,
      status: "Open",
      transactionCurrency: "USD",
      transactionAmount: amount,
      functionalCurrency: "USD",
      exchangeRateValue: 1,
      functionalAmount: amount,
      exchangeRateSource: "Manual",
      items: [{ id: "fee", description: "Fee", accountCode: "6000", isInventory: false, amount }],
      payments: [],
    });
    await replaceLedger(seed, companyId, "bills", [bill("B-1", 25), bill("B-2", 70)]);
    await replaceLedger(seed, companyId, "invoices", [
      {
        id: "I-1",
        customerName: "Customer",
        date: "2025-12-12",
        dueDate: "2026-01-31",
        kind: "Service",
        subtotal: 45,
        taxRate: 0,
        taxAmount: 0,
        total: 45,
        taxExempt: true,
        status: "Open",
        payments: [],
        transactionCurrency: "USD",
        transactionAmount: 45,
        functionalCurrency: "USD",
        exchangeRateValue: 1,
        functionalAmount: 45,
        exchangeRateSource: "Manual",
        items: [
          {
            id: "sale",
            description: "Service",
            isProduct: false,
            qty: 1,
            unitPrice: 45,
            taxable: false,
          },
        ],
      },
    ]);
    await seed.query("COMMIT");
  } finally {
    seed.release();
  }
  const newPayment = await find("New payment");
  const detail = await feed.bankFeedDetail({ companyId, rowId: newPayment.id });
  assert.deepEqual(
    detail.documents.map((d) => d.reference),
    ["B-1", "B-2"],
  );
  const settlement = {
    operation: "settle",
    rowId: newPayment.id,
    date: newPayment.date,
    confirmDuplicate: false,
    lines: [
      { documentId: "B-1", amount: "25" },
      { documentId: "B-2", amount: "35" },
    ],
  };
  assert.equal(
    (await feed.bankSettlementPreview({ companyId, input: settlement })).difference,
    "0.0000",
  );
  const paymentJournal = await feed.bankFeedCommand({ companyId, input: settlement });
  assert(paymentJournal.posted);
  let bills = await readLedger(pool, companyId, "bills");
  assert.equal(bills[0].status, "Paid");
  assert.equal(bills[1].status, "Partially Paid");
  assert.equal(outstanding(bills[1]).native, 35);
  const register = () => feed.bankFeedRegister({ companyId, account: "1000" });
  assert.equal(Number((await register()).find((r) => r.journalId === paymentJournal.id).base), -60);
  await pool.query(
    "UPDATE ledger_fiscalperiods SET status='Locked' WHERE company_id=$1 AND id='jan'",
    [companyId],
  );
  await assert.rejects(undo(await find("New payment")), /closed/);
  await undo(await find("New payment"), "2026-02-03");
  bills = await readLedger(pool, companyId, "bills");
  assert.equal(outstanding(bills[1], "2026-01-31").native, 35);
  assert.equal(outstanding(bills[1], "2026-02-03").native, 70);
  assert.equal(bills[0].status, "Open");
  assert.equal((await find("New payment")).status, "Pending");
  await pool.query(
    "UPDATE ledger_fiscalperiods SET status='Open' WHERE company_id=$1 AND id='jan'",
    [companyId],
  );

  const manual = async (amount) =>
    executeJournal({
      companyId,
      operation: "event",
      source: {
        module: "Test",
        type: "Payment",
        id: "test",
        eventId: "event-" + amount,
        eventVersion: 1,
        idempotencyKey: "event-" + amount,
        contractVersion: 1,
      },
      value: {
        journalType: "Automatic",
        accountingDate: "2026-01-13",
        description: "Existing " + amount,
        currency: "USD",
        exchangeRate: "1",
        exchangeRateSource: "USD",
        lines: [
          { accountCode: "1000", debit: String(amount), credit: "0", description: "" },
          { accountCode: "4000", credit: String(amount), debit: "0", description: "" },
        ],
      },
    });
  await manual(7);
  await manual(13);
  const recorded = await find("Find recorded");
  const competing = await find("Find competing");
  const keys = (await feed.bankFeedDetail({ companyId, rowId: recorded.id })).moves
    .filter((m) => m.description.startsWith("Existing"))
    .map((m) => m.key);
  assert.equal(keys.length, 2);
  const matches = await Promise.allSettled([
    action(recorded, { operation: "match", keys }),
    action(competing, { operation: "match", keys }),
  ]);
  assert.equal(matches.filter((m) => m.status === "fulfilled").length, 1);
  const winner = (await rows()).find(
    (r) => [recorded.id, competing.id].includes(r.id) && r.status === "Classified",
  );
  assert(winner);
  await action(winner, { operation: "undo" });
  assert.equal(
    (await feed.bankFeedDetail({ companyId, rowId: recorded.id })).moves.filter((m) =>
      keys.includes(m.key),
    ).length,
    2,
  );

  await feed.importBankFile(
    importFile("date,description,amount\n2026-01-15,FX split,-0.03", "1010", "EUR"),
  );
  const foreign = await find("FX split");
  const fxPosted = await category(foreign, {
    rate: "1.5",
    rateSource: "Bank confirmation",
    lines: [
      { account: "6000", amount: "0.01", description: "A" },
      { account: "6300", amount: "0.01", description: "B" },
      { account: "6000", amount: "0.01", description: "C" },
    ],
  });
  const bases = async (id) =>
    (
      await pool.query(
        "SELECT (base_debit-base_credit)::float8 AS value FROM journal_entry_lines WHERE journal_entry_id=$1 ORDER BY line_number",
        [id],
      )
    ).rows.map((r) => r.value);
  assert.deepEqual(await bases(fxPosted.id), [-0.05, 0.02, 0.01, 0.02]);
  assert.deepEqual(
    await bases((await undo(await find("FX split"))).id),
    [0.05, -0.02, -0.01, -0.02],
  );

  await pool.query("UPDATE accounting_policies SET approval_required=true WHERE company_id=$1", [
    companyId,
  ]);
  const receipt = await find("New receipt");
  const postReceipt = (row = receipt) =>
    action(row, {
      operation: "settle",
      date: row.date,
      lines: [{ documentId: "I-1", amount: "45" }],
    });
  let queued = await postReceipt();
  assert(!queued.posted);
  assert.equal((await find("New receipt")).attemptState, "pending");
  assert.equal((await readLedger(pool, companyId, "invoices"))[0].status, "Open");
  const review = (id, operation, version, reason) =>
    executeJournal({ companyId, id, operation, version, reason });
  await assert.rejects(review(queued.id, "approve", 2), /creator/);
  globalThis.bankFeedSession = approver;
  await review(queued.id, "reject", 2, "Recheck payment");
  assert.equal((await find("New receipt")).attemptId, null);
  globalThis.bankFeedSession = operator;
  queued = await postReceipt();
  const stale = await postReceipt(await find("Competing receipt"));
  globalThis.bankFeedSession = approver;
  await review(queued.id, "approve", 2);
  await review(stale.id, "approve", 2);
  await review(queued.id, "post", 3);
  assert.match((await review(stale.id, "post", 3)).conflict, /outstanding/);
  assert.equal((await readLedger(pool, companyId, "invoices"))[0].status, "Paid");
  assert.equal((await find("New receipt")).status, "Classified");
  assert.equal((await find("Competing receipt")).attemptId, null);

  globalThis.bankFeedSession = reader;
  await assert.rejects(feed.bankFeedDetail({ companyId, rowId: receipt.id }), /access denied/i);
  await assert.rejects(
    feed.importBankFile({ ...importFile(usdCsv), companyId: other }),
    /access denied|profile does not allow/i,
  );
  globalThis.bankFeedSession = operator;
  const balance = await executeJournal({
    companyId,
    operation: "balances",
    filters: { from: "2026-01-01", to: "2026-02-28", page: 0 },
  });
  assert.equal(Number(balance.rows.find((r) => r.code === "1000").closing_debit), 65);
  assert.equal(Number(balance.rows.find((r) => r.code === "1010").closing_debit), 0);
  const trial = await generateTrialBalance({ companyId, start: "2026-01-01", end: "2026-02-28" });
  assert.equal(trial.status, "Balanced");
  assert.equal(Number(trial.accounts.find((r) => r.code === "1000").closing_debit), 65);
  await pool.query("UPDATE accounting_policies SET approval_required=false WHERE company_id=$1", [
    companyId,
  ]);
  const { vendorSchema } = await import("../src/lib/vendor-model.ts");
  const vendor = {
    ...vendorSchema.parse({ displayName: "Chosen Supplier", companyName: "Chosen Supplier" }),
    id: "bulk-vendor",
  };
  await replaceLedger(pool, companyId, "vendors", [vendor]);
  await feed.importBankFile(
    importFile(
      "date;Bank description;Amount;From/To;Transaction Posted\n" +
        "01/16/2026;Bulk fee;-$11.00;Original Supplier;\n" +
        "02/03/2026;Bulk deposit;$8.00;;\n" +
        "03/01/2026;Bulk outside fiscal period;-$7.00;;",
    ),
  );
  const bulkFee = await find("Bulk fee");
  const bulkDeposit = await find("Bulk deposit");
  const outsidePeriod = await find("Bulk outside fiscal period");
  const batch = (rows, input) =>
    feed.bankFeedBatch({
      companyId,
      input: { bankAccount: "1000", rowIds: rows.map((row) => row.id), ...input },
    });
  await assert.rejects(
    action(bulkFee, { operation: "party", payeeId: "missing-vendor" }),
    /this company/,
  );
  await action(bulkFee, { operation: "party", payeeId: vendor.id });
  assert.equal((await find("Bulk fee")).partyName, "Chosen Supplier");
  assert.equal((await find("Bulk fee")).fromTo, "Original Supplier");
  await action(bulkFee, { operation: "party", payeeId: null });
  assert.equal((await find("Bulk fee")).partyId, null);
  assert.equal((await find("Bulk fee")).partyEdited, true);
  await action(bulkFee, { operation: "party", payeeId: vendor.id });
  const bulkCategorize = { operation: "categorize", outflowAccount: "6000", inflowAccount: "4000" };
  await assert.rejects(
    batch([bulkFee, outsidePeriod], bulkCategorize),
    /Bulk outside fiscal period.*fiscal period/i,
  );
  assert.equal((await find("Bulk fee")).attemptId, null);
  await batch([bulkFee, bulkDeposit], { operation: "exclude", reason: "Bulk exclusion" });
  assert.equal((await find("Bulk fee")).status, "Excluded");
  await batch([bulkFee, bulkDeposit], { operation: "restore" });
  assert.equal((await find("Bulk deposit")).status, "Pending");
  const bulkResult = await batch([bulkFee, bulkDeposit], bulkCategorize);
  assert.deepEqual(bulkResult, { count: 2, posted: 2, inApproval: 0 });
  const postedFee = await find("Bulk fee");
  assert.equal(postedFee.transactionType, "Expense");
  assert.deepEqual(postedFee.allocationAccounts, ["6000"]);
  const feeJournal = postedFee.journalId;
  assert.equal(
    (
      await pool.query(
        "SELECT vendor_id FROM journal_entry_lines WHERE journal_entry_id=$1 AND account_code='6000'",
        [feeJournal],
      )
    ).rows[0].vendor_id,
    vendor.id,
  );
  await assert.rejects(
    action(bulkFee, { operation: "party", payeeId: null }),
    /no longer available/,
  );
  await batch([bulkFee, bulkDeposit], {
    operation: "undo",
    reason: "Bulk reversal",
    date: "2026-02-07",
  });
  assert.equal((await find("Bulk fee")).status, "Pending");
  assert.equal((await find("Bulk fee")).partyName, "Chosen Supplier");
  assert.equal((await find("Bulk deposit")).status, "Pending");
  assert(
    (
      await pool.query(
        "SELECT count(*) FROM system_audit_events WHERE company_id=$1 AND action='BANK_FEED_UNDO'",
        [companyId],
      )
    ).rows[0].count >= 3,
  );
  const reviewFile = importFile(reviewCsv);
  const reviewPreview = await feed.previewBankImport(reviewFile);
  assert.equal(reviewPreview.format, "quickbooks-review");
  assert.equal(reviewPreview.total, "-1230.0500");
  const reviewImport = await feed.importBankFile(reviewFile);
  assert.equal(reviewImport.count, 2);
  assert.equal((await feed.previewBankImport(reviewFile)).duplicateBatch, true);
  const reviewRow = await find("Review fee, test");
  assert.equal(reviewRow.status, "Pending");
  assert.equal(reviewRow.journalId, null);
  assert.equal(reviewRow.sourceFormat, "quickbooks-review");
  assert.equal(reviewRow.checkNumber, "000123");
  assert.equal(reviewRow.sourceClass, "Class A");
  assert.equal(reviewRow.sourceLocation, "Office");
  assert.equal(reviewRow.sourceCustomer, "Buyer");
  assert.equal(reviewRow.externalPosting, "6000 Fees");
  assert.equal(reviewRow.sourceStatus, "Pending");
  const reviewFilters = bankFilterData(
    reviewRow,
    [],
    [],
    [{ kind: "rule", pattern: "review fee", account: "6000" }],
  );
  assert.equal(matchesBankFilters(reviewFilters, emptyBankFilters, "rules"), true);
  assert.equal(matchesBankFilters(reviewFilters, emptyBankFilters, "uncategorized"), true);
  const options = bankFilterOptions([reviewFilters]);
  assert.equal(
    matchesBankFilters(
      reviewFilters,
      { ...emptyBankFilters, class: options.class[0].id, payee: options.payee[0].id },
      "",
    ),
    true,
  );
  assert.equal(
    matchesBankFilters(reviewFilters, { ...emptyBankFilters, location: "another location" }, ""),
    false,
  );
  const postedFile = importFile(postedCsv);
  assert.equal((await feed.previewBankImport(postedFile)).postedInQuickBooks, 2);
  const postedImport = await feed.importBankFile(postedFile);
  assert.equal(postedImport.postedInQuickBooks, 2);
  const postedRow = await find("QuickBooks categorized");
  assert.equal(postedRow.sourceStatus, "Posted");
  assert.equal(postedRow.status, "Pending");
  assert.equal(postedRow.journalId, null);
  await pool.query(
    "UPDATE ledger_statements SET feed_source_format=NULL WHERE company_id=$1 AND id=$2",
    [companyId, postedImport.id],
  );
  assert.equal((await find("QuickBooks matched")).sourceStatus, "Posted");
  const postedDetailsFile = importFile(postedWithDetailsCsv);
  assert.equal((await feed.importBankFile(postedDetailsFile)).postedInQuickBooks, 1);
  const postedDetailsRow = await find("Card, expense");
  assert.equal(postedDetailsRow.checkNumber, "000123");
  assert.equal(postedDetailsRow.sourceLocation, "Office");
  assert.equal(postedDetailsRow.sourceCustomer, "Buyer");
  assert.equal((await feed.previewBankImport(postedDetailsFile)).duplicateBatch, true);
  console.log(
    "PASS: import and concurrent deduplication, legacy Undo, multi-title AP/AR, existing Match, FX rounding, approval, authorization and GL balances.",
  );
} finally {
  await pool.end();
  await root.query(`DROP SCHEMA "${schema}" CASCADE`);
  await root.end();
}
