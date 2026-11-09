import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { z } from "zod";
import type { Bill, CompanyState, Invoice } from "./accounting-engine";
import { readState } from "./accounting.server";
import {
  bankAction,
  bankAmount,
  bankBatchAction,
  bankCategory,
  bankRate,
  bankSourceAccount,
  type bankReportImport,
  itemAmount,
  type BankAction,
  type BankBatchAction,
  type BankCategory,
  type BankSettlement,
} from "./bank-feed-model";
import { authorizeCompany, setActor } from "./companies.server";
import { db } from "./db.server";
import { amountUnits, convertedUnits, unitsAmount, type JournalInput } from "./journal-model";
import { createBankJournal, journalPostingAccess } from "./journal.server";
import { readLedger, replaceLedger } from "./ledger-storage.server";
import { externalAccount, parseStatementFile, quickBooksSourceStatus } from "./statement-csv";
import { resolvePostingAccount } from "./posting-accounts";
import {
  money,
  normalizedFx,
  outstanding,
  settlementAmounts,
  type Payment,
} from "./transaction-fx";

type Auth = Awaited<ReturnType<typeof authorizeCompany>>;
type Scope = { companyId: string };
type RowScope = Scope & { rowId: string };
type Import = Scope & { account: string; currency: string; fileName: string; content: string };
type BankRow = {
  id: string;
  fileId: string;
  account: string;
  currency: string;
  date: string;
  amount: string;
  description: string;
  fromTo: string;
  partyId: string | null;
  partyName: string | null;
  partyEdited: boolean;
  externalPosting: string;
  splitAccount: string;
  sourceFormat: ReturnType<typeof parseStatementFile>["format"] | null;
  checkNumber: string | null;
  sourceClass: string | null;
  sourceLocation: string | null;
  sourceCustomer: string | null;
  returnedToPending: boolean;
  duplicate: boolean;
  status: "Pending" | "Classified" | "Excluded";
  exclusion: string | null;
  attemptId: string | null;
  attemptKind: "category" | "settlement" | "match" | "legacy" | null;
  attemptState: "pending" | "posted" | null;
  transactionType: string | null;
  locationId: string | null;
  allocationAccounts: string[];
  classIds: string[];
  journalId: string | null;
  journalNumber: string | null;
  legacyJournalId: string | null;
  accountingDate: string | null;
  postedAt: string | null;
  classifiedAccount: string | null;
  attachmentCount: number;
};
const withSourceStatus = (row: BankRow) => {
  const sourceStatus = quickBooksSourceStatus(row.sourceFormat, row.externalPosting);
  return {
    ...row,
    sourceStatus,
    isSourcePosted:
      row.status === "Pending" &&
      !row.attemptId &&
      !row.returnedToPending &&
      sourceStatus === "Posted",
  };
};
// Undo events keep imported postings in Pending without changing the original CSV metadata.
const rowQuery = `
 SELECT r.id,r.file_id AS "fileId",r.date::text,r.description,r.amount::text,r.status,
   f.account_code AS account,f.feed_currency AS currency,r.feed_from_to AS "fromTo",
   selected_party.id AS "partyId",
   coalesce(v.display_name,p.display_name) AS "partyName",r.feed_party_edited AS "partyEdited",
   r.feed_external_posting AS "externalPosting",r.suggested_account AS "splitAccount",r.feed_exclusion AS exclusion,
   f.feed_source_format AS "sourceFormat",r.feed_check_number AS "checkNumber",
   r.feed_source_class AS "sourceClass",r.feed_source_location AS "sourceLocation",
   r.feed_source_customer AS "sourceCustomer",
   EXISTS (SELECT 1 FROM ledger_stagingrows d JOIN ledger_statements df ON (df.company_id,df.id)=(d.company_id,d.file_id)
     WHERE d.company_id=r.company_id AND d.id<>r.id AND (
       d.feed_fingerprint=r.feed_fingerprint OR ((d.feed_fingerprint IS NULL OR r.feed_fingerprint IS NULL)
        AND df.account_code=f.account_code AND df.feed_currency=f.feed_currency AND d.date=r.date AND d.amount=r.amount
        AND lower(regexp_replace(d.description,'[[:space:]]+',' ','g'))=lower(regexp_replace(r.description,'[[:space:]]+',' ','g')))
     )) AS duplicate,
   a.id AS "attemptId",a.kind AS "attemptKind",a.state AS "attemptState",a.journal_id AS "journalId",
   a.transaction_type AS "transactionType",a.location_id AS "locationId",
   coalesce(allocation.accounts, ARRAY[]::text[]) AS "allocationAccounts",
   coalesce(allocation.classes, ARRAY[]::text[]) AS "classIds",
   j.journal_number AS "journalNumber",a.legacy_journal_id AS "legacyJournalId",
   a.accounting_date::text AS "accountingDate",r.classified_account AS "classifiedAccount",
   coalesce(j.posted_at,a.created_at)::text AS "postedAt",
   coalesce(t.count,0) AS "attachmentCount",returned.target_id IS NOT NULL AS "returnedToPending"
 FROM ledger_stagingrows r JOIN ledger_statements f ON (f.company_id,f.id)=(r.company_id,r.file_id)
 LEFT JOIN bank_feed_attempts a ON (a.company_id,a.row_id)=(r.company_id,r.id) AND a.state IN ('pending','posted')
 LEFT JOIN LATERAL (
   SELECT array_agg(DISTINCT p.account_code) FILTER (WHERE p.account_code IS NOT NULL) AS accounts,
          array_agg(DISTINCT p.class_id) FILTER (WHERE p.class_id IS NOT NULL) AS classes
   FROM bank_feed_allocations p WHERE p.attempt_id=a.id
 ) allocation ON a.id IS NOT NULL
 LEFT JOIN journal_entries j ON j.id=a.journal_id
 CROSS JOIN LATERAL (SELECT CASE WHEN a.kind='category' THEN a.payee_id ELSE r.feed_payee_id END AS id) selected_party
 LEFT JOIN ledger_vendors v ON v.company_id=r.company_id AND v.id=selected_party.id AND r.amount<0
 LEFT JOIN ledger_customers p ON p.company_id=r.company_id AND p.id=selected_party.id AND r.amount>0
 LEFT JOIN (
   SELECT company_id,row_id,count(*)::int AS count FROM bank_feed_attachments WHERE company_id=$1 GROUP BY company_id,row_id
 ) t ON (t.company_id,t.row_id)=(r.company_id,r.id)
  LEFT JOIN (
    SELECT DISTINCT target_id FROM system_audit_events
    WHERE company_id=$1 AND entity='BankFeed' AND action IN ('BANK_FEED_UNDO_SOURCE','BANK_FEED_UNDO','BANK_FEED_UNMATCH')
  ) returned ON returned.target_id=r.id AND r.feed_external_posting<>''
 WHERE r.company_id=$1`;

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function transaction<T>(
  companyId: string,
  write: boolean,
  run: (c: PoolClient, auth: Auth) => Promise<T>,
) {
  const c = await db().connect();
  try {
    await c.query(write ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    if (write) await c.query("SELECT pg_advisory_xact_lock(803003)");
    const auth = await authorizeCompany(companyId, write ? "write_accounting" : undefined, c);
    if (write) {
      await c.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [companyId]);
      await setActor(c, auth.user.id);
    }
    const result = await run(c, auth);
    if (write) await c.query("UPDATE companies SET revision=revision+1 WHERE id=$1", [companyId]);
    await c.query("COMMIT");
    return result;
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
  }
}

async function audit(c: PoolClient, auth: Auth, action: string, id: string, details: unknown) {
  await c.query(
    `INSERT INTO system_audit_log(actor_id,actor_name,action,entity,target_id,company_id,after_data)
     VALUES($1,$2,$3,'BankFeed',$4,$5,$6)`,
    [auth.user.id, auth.user.name, action, id, auth.company.id, JSON.stringify(details)],
  );
}

async function getRow(c: PoolClient, { companyId, rowId }: RowScope) {
  const row = (await c.query<BankRow>(rowQuery + " AND r.id=$2", [companyId, rowId])).rows[0];
  if (!row) throw new Error("Bank Feed transaction unavailable.");
  return withSourceStatus(row);
}

async function validateSource(c: PoolClient, companyId: string, code: string, currency: string) {
  const accounts = (await readLedger(
    c,
    companyId,
    "accounts",
  )) as unknown as CompanyState["accounts"];
  const account = accounts.find((a) => a.code === code);
  if (!account || !bankSourceAccount(account, accounts))
    throw new Error("Select a bank or credit card account from this company's chart of accounts.");
  if (account.sourceAccount && account.sourceAccount.currency !== currency)
    throw new Error("Select the currency recorded on the imported bank or credit card account.");
  const currencies = await readLedger(c, companyId, "currencies");
  if (!currencies.some((item) => item["code"] === currency && item["status"] === "Active"))
    throw new Error("Select an active company currency.");
  if (
    (
      await c.query(
        `SELECT 1 FROM ledger_statements WHERE company_id=$1 AND account_code=$2 AND feed_currency<>$3
     UNION ALL SELECT 1 FROM bank_feed_balances WHERE company_id=$1 AND account_code=$2 AND currency<>$3
     LIMIT 1`,
        [companyId, code, currency],
      )
    ).rowCount
  )
    throw new Error("The selected account is already used with another currency.");
}

function fingerprint(
  account: string,
  currency: string,
  row: { date: string; amountText: string; description: string },
) {
  return digest([
    account,
    currency,
    row.date,
    unitsAmount(bankAmount(row.amountText, currency)),
    row.description.replace(/\s+/g, " ").toLowerCase(),
  ]);
}

async function prepareImport(c: PoolClient, data: Import) {
  await validateSource(c, data.companyId, data.account, data.currency);
  const { format, rows } = parseStatementFile(data.content, data.currency);
  const keys = rows.map((row) => fingerprint(data.account, data.currency, row));
  const batchDigest = digest([
    data.currency,
    rows
      .map((row) =>
        digest([
          row.date,
          row.description,
          unitsAmount(bankAmount(row.amountText, data.currency)),
          row.fromTo,
          row.externalPosting,
          ...(format === "quickbooks-review" ||
          row.checkNumber ||
          row.sourceClass ||
          row.sourceLocation ||
          row.sourceCustomer
            ? [format, row.checkNumber, row.sourceClass, row.sourceLocation, row.sourceCustomer]
            : []),
        ]),
      )
      .sort(),
  ]);
  const [old, batch] = await Promise.all([
    c.query<{ key: string }>(
      `SELECT r.feed_fingerprint AS key FROM ledger_stagingrows r
       WHERE r.company_id=$1 AND r.feed_fingerprint=ANY($2::text[])
       UNION SELECT s.key
       FROM unnest($3::date[],$4::numeric[],$5::text[],$2::text[]) s(date,amount,description,key)
       JOIN ledger_stagingrows r ON r.company_id=$1 AND r.feed_fingerprint IS NULL AND r.date=s.date
         AND r.amount=s.amount AND lower(regexp_replace(r.description,'[[:space:]]+',' ','g'))=s.description
       JOIN ledger_statements f ON (f.company_id,f.id)=(r.company_id,r.file_id)
       WHERE f.account_code=$6 AND f.feed_currency=$7`,
      [
        data.companyId,
        keys,
        rows.map((r) => r.date),
        rows.map((r) => r.amountText),
        rows.map((r) => r.description.replace(/\s+/g, " ").toLowerCase()),
        data.account,
        data.currency,
      ],
    ),
    c.query(
      `SELECT 1 FROM ledger_statements WHERE company_id=$1 AND account_code=$2 AND
        (feed_digest=$3 OR (feed_digest IS NULL AND feed_currency=$4 AND
          replace(ltrim(content,chr(65279)),E'\\r\\n',E'\\n')=replace(ltrim($5,chr(65279)),E'\\r\\n',E'\\n')))`,
      [data.companyId, data.account, batchDigest, data.currency, data.content],
    ),
  ]);
  const repeated = new Set(old.rows.map((r) => r.key));
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) repeated.add(key);
    seen.add(key);
  }
  return {
    rows,
    format,
    postedInQuickBooks: rows.filter((row) => row.sourceStatus === "Posted").length,
    keys,
    batchDigest,
    duplicateBatch: !!batch.rowCount,
    duplicates: keys.filter((key) => repeated.has(key)).length,
  };
}

export async function previewBankImport(data: Import) {
  return transaction(data.companyId, false, async (c, auth) => {
    if (!auth.permissions.write_accounting) throw new Error("Access denied.");
    const { rows, format, postedInQuickBooks, duplicates, duplicateBatch } = await prepareImport(
      c,
      data,
    );
    const total = rows.reduce((sum, row) => sum + bankAmount(row.amountText, data.currency), 0n);
    return {
      count: rows.length,
      format,
      postedInQuickBooks,
      total: unitsAmount(total),
      duplicates,
      duplicateBatch,
      sample: rows.slice(0, 8),
    };
  });
}

async function saveBankImport(
  c: PoolClient,
  auth: Auth,
  data: Import,
  {
    rows,
    format,
    postedInQuickBooks,
    keys,
    batchDigest,
    duplicateBatch,
  }: Awaited<ReturnType<typeof prepareImport>>,
) {
  if (duplicateBatch) throw new Error("This batch was already imported into the selected account.");
  const id = randomUUID();
  await c.query(
    `INSERT INTO ledger_statements(company_id,id,position,content,file_name,account_code,file_type,
       rows_count,uploaded_at,uploaded_by,status,feed_currency,feed_digest,feed_source_format)
       VALUES($1,$2,(SELECT coalesce(min(position),0)-1 FROM ledger_statements WHERE company_id=$1),
       $3,$4,$5,'CSV',$6,$7,$8,'Pending Review',$9,$10,$11)`,
    [
      data.companyId,
      id,
      data.content,
      data.fileName,
      data.account,
      rows.length,
      new Date().toISOString(),
      auth.user.name,
      data.currency,
      batchDigest,
      format,
    ],
  );
  const ids = rows.map(() => randomUUID());
  await c.query(
    `INSERT INTO ledger_stagingrows(company_id,id,position,file_id,date,description,amount,suggested_account,
         status,feed_from_to,feed_external_posting,feed_fingerprint,feed_check_number,feed_source_class,
         feed_source_location,feed_source_customer)
       SELECT $1,t.id,offsets.start+t.n::int,$2,t.date,t.description,t.amount,'','Pending',t.party,t.posting,t.fingerprint,
         t.check_number,t.source_class,t.source_location,t.source_customer
       FROM unnest($3::text[],$4::date[],$5::text[],$6::numeric[],$7::text[],$8::text[],$9::text[],
                   $10::text[],$11::text[],$12::text[],$13::text[])
         WITH ORDINALITY AS t(id,date,description,amount,party,posting,fingerprint,check_number,source_class,source_location,source_customer,n)
       CROSS JOIN (SELECT coalesce(min(position),0)-$14::int-1 AS start FROM ledger_stagingrows WHERE company_id=$1) offsets`,
    [
      data.companyId,
      id,
      ids,
      rows.map((r) => r.date),
      rows.map((r) => r.description),
      rows.map((r) => r.amountText),
      rows.map((r) => r.fromTo),
      rows.map((r) => r.externalPosting),
      keys,
      rows.map((r) => r.checkNumber),
      rows.map((r) => r.sourceClass),
      rows.map((r) => r.sourceLocation),
      rows.map((r) => r.sourceCustomer),
      rows.length,
    ],
  );
  await c.query(
    `INSERT INTO ledger_references(company_id,source_domain,source_id,account_id,statement_id)
       SELECT $1::uuid,'statements',$2::text,$3::text,NULL::text UNION ALL
       SELECT $1::uuid,'stagingRows',unnest($4::text[]),NULL::text,$2::text`,
    [data.companyId, id, data.account, ids],
  );
  await audit(c, auth, "IMPORT_STATEMENT", id, {
    account: data.account,
    currency: data.currency,
    count: rows.length,
    name: data.fileName,
    format,
  });
  return { id, count: rows.length, postedInQuickBooks };
}

export async function importBankFile(data: Import) {
  return transaction(data.companyId, true, async (c, auth) =>
    saveBankImport(c, auth, data, await prepareImport(c, data)),
  );
}

export async function importBankReport({
  companyId,
  files,
  preview,
}: z.infer<typeof bankReportImport>) {
  return transaction(companyId, !preview, async (c, auth) => {
    if (!auth.permissions.write_accounting) throw new Error("Access denied.");
    const accounts = (await readLedger(
      c,
      companyId,
      "accounts",
    )) as unknown as CompanyState["accounts"];
    const activeCurrencies = new Set(
      (await readLedger(c, companyId, "currencies"))
        .filter((row) => row["status"] === "Active")
        .map((row) => row["code"]),
    );
    const bankCodes = new Set(
      accounts.filter((account) => bankSourceAccount(account, accounts)).map(({ code }) => code),
    );
    const archiveCodes = [
      ...new Set(files.filter((file) => !bankCodes.has(file.account)).map((file) => file.account)),
    ];
    const batches = new Set<string>();
    if (archiveCodes.length) {
      const existing = await c.query<{
        account_code: string;
        source_group: string;
        currency: string;
        digest: string;
      }>(
        `SELECT account_code,source_group,currency,digest FROM transaction_report_imports
         WHERE company_id=$1 AND account_code=ANY($2::text[]) AND source_group=ANY($3::text[])`,
        [companyId, archiveCodes, files.map(({ sourceGroup }) => sourceGroup)],
      );
      for (const row of existing.rows)
        batches.add(JSON.stringify([row.account_code, row.source_group, row.currency, row.digest]));
    }
    const archived: {
      id: string;
      account_code: string;
      source_group: string;
      currency: string;
      digest: string;
      file_name: string;
      row_count: number;
      content: string;
    }[] = [];
    const currencies = new Map<string, string>();
    const groups = [];
    for (const file of files) {
      try {
        if (!accounts.some((account) => account.code === file.account))
          throw new Error("Select an account from this company's chart of accounts.");
        if (!activeCurrencies.has(file.currency))
          throw new Error("Select an active company currency.");
        const bankFeed = bankCodes.has(file.account);
        const data = { ...file, companyId };
        if (bankFeed) {
          const currency = currencies.get(file.account);
          if (currency && currency !== file.currency)
            throw new Error(
              "Use the same currency for all groups mapped to the same bank account.",
            );
          currencies.set(file.account, file.currency);
          const prepared = await prepareImport(c, data);
          const batch = JSON.stringify([file.account, prepared.batchDigest]);
          const duplicateBatch = prepared.duplicateBatch || batches.has(batch);
          batches.add(batch);
          if (!preview) await saveBankImport(c, auth, data, { ...prepared, duplicateBatch });
          groups.push({
            count: prepared.rows.length,
            total: unitsAmount(
              prepared.rows.reduce(
                (sum, row) => sum + bankAmount(row.amountText, file.currency),
                0n,
              ),
            ),
            duplicates: prepared.duplicates,
            duplicateBatch,
            bankFeed,
          });
          continue;
        }
        const { rows } = parseStatementFile(file.content, file.currency);
        const hash = digest(
          rows
            .map(({ amountText, ...row }) =>
              digest({ ...row, amount: unitsAmount(bankAmount(amountText, file.currency)) }),
            )
            .sort(),
        );
        const batch = JSON.stringify([file.account, file.sourceGroup, file.currency, hash]);
        const duplicateBatch = batches.has(batch);
        batches.add(batch);
        if (!preview) {
          if (duplicateBatch)
            throw new Error("This group was already imported into the selected account.");
          archived.push({
            id: randomUUID(),
            account_code: file.account,
            source_group: file.sourceGroup,
            currency: file.currency,
            digest: hash,
            file_name: file.fileName,
            row_count: rows.length,
            content: file.content,
          });
        }
        groups.push({
          count: rows.length,
          total: unitsAmount(
            rows.reduce((sum, row) => sum + bankAmount(row.amountText, file.currency), 0n),
          ),
          duplicates: 0,
          duplicateBatch,
          bankFeed,
        });
      } catch (error) {
        throw new Error(
          `${file.sourceGroup}: ${error instanceof Error ? error.message : "Import failed."}`,
        );
      }
    }
    if (archived.length) {
      await c.query(
        `INSERT INTO transaction_report_imports
           (company_id,id,account_code,source_group,currency,digest,file_name,row_count,content)
         SELECT $1,id,account_code,source_group,currency,digest,file_name,row_count,content
         FROM jsonb_to_recordset($2::jsonb) AS groups
           (id uuid,account_code text,source_group text,currency text,digest text,file_name text,row_count int,content text)`,
        [companyId, JSON.stringify(archived)],
      );
      await audit(c, auth, "IMPORT_TRANSACTION_REPORT", archived[0]!.id, {
        groups: archived.length,
        count: archived.reduce((count, group) => count + group.row_count, 0),
      });
    }
    return { groups, count: groups.reduce((sum, group) => sum + group.count, 0) };
  });
}

export async function listTransactionReportImports({ companyId }: Scope) {
  return transaction(
    companyId,
    false,
    async (c) =>
      (
        await c.query<{
          id: string;
          account: string;
          sourceGroup: string;
          currency: string;
          count: number;
          importedAt: string;
        }>(
          `SELECT id,account_code AS account,source_group AS "sourceGroup",currency,row_count AS count,
        imported_at::text AS "importedAt"
       FROM transaction_report_imports WHERE company_id=$1 ORDER BY imported_at DESC,id LIMIT 200`,
          [companyId],
        )
      ).rows,
  );
}

export async function loadTransactionReportImport({ companyId, id }: Scope & { id: string }) {
  return transaction(companyId, false, async (c) => {
    const file = (
      await c.query<{ name: string; content: string }>(
        "SELECT file_name AS name,content FROM transaction_report_imports WHERE company_id=$1 AND id=$2",
        [companyId, id],
      )
    ).rows[0];
    if (!file) throw new Error("Imported report group unavailable.");
    return file;
  });
}

const movementsSql = `
 SELECT 'journal:'||j.id||':'||l.line_number AS key,j.id::text AS "journalId",j.journal_number AS reference,
   j.accounting_date::text AS date,l.account_code AS account,j.transaction_currency AS currency,
   (l.debit-l.credit)::text AS amount,(l.base_debit-l.base_credit)::text AS base,j.description,
   j.source_type AS "sourceType",j.source_id AS "sourceId",
   NOT EXISTS (SELECT 1 FROM journal_entries x WHERE x.reversal_of_entry_id=j.id) AS unreversed,
   (j.source_module='Bank Feed' AND (l.line_number=1 OR j.source_type='BankFeedReversal')) AS owned
 FROM journal_entries j JOIN journal_entry_lines l ON l.journal_entry_id=j.id
 WHERE j.company_id=$1 AND j.status='Posted'
 UNION ALL
 SELECT 'legacy:'||j.id||':'||l.position,j.id,j.id,j.date::text,l.account_code,j.currency,
   (l.debit-l.credit)::text,(l.debit-l.credit)::text,j.memo,j.source_type,j.source_id,
   j.status='Posted', (j.source_type='BankStaging' AND l.position=1) OR EXISTS (SELECT 1 FROM bank_feed_attempts a
     JOIN ledger_stagingrows r ON (r.company_id,r.id)=(a.company_id,a.row_id)
     JOIN ledger_statements f ON (f.company_id,f.id)=(r.company_id,r.file_id)
     WHERE a.company_id=j.company_id AND a.legacy_journal_id=j.id
       AND (a.state='undone' OR f.account_code=l.account_code))
 FROM ledger_journals j JOIN ledger_journals_lines l ON (l.company_id,l.parent_id)=(j.company_id,j.id)
 WHERE j.company_id=$1 AND j.status IN ('Posted','Reversed')`;

type Movement = {
  key: string;
  journalId: string;
  reference: string;
  date: string;
  account: string;
  currency: string;
  amount: string;
  base: string;
  description: string;
  sourceType: string;
  sourceId: string | null;
  unreversed: boolean;
  owned: boolean;
};

async function register(c: PoolClient, companyId: string, account?: string) {
  return (
    await c.query<Movement>(
      `SELECT * FROM (${movementsSql}) m ${account ? "WHERE account=$2" : ""} ORDER BY date DESC,key`,
      account ? [companyId, account] : [companyId],
    )
  ).rows;
}

export async function bankFeedList({ companyId }: Scope) {
  return transaction(companyId, false, async (c, auth) => {
    const [rows, files, balances, posted, rules, access] = await Promise.all([
      c.query<BankRow>(rowQuery + " ORDER BY r.date DESC,r.position,r.id", [companyId]),
      c.query<{
        id: string;
        name: string;
        account: string;
        currency: string;
        count: number;
        uploadedAt: string;
      }>(
        `SELECT id,file_name AS name,account_code AS account,feed_currency AS currency,
          rows_count AS count,uploaded_at AS "uploadedAt" FROM ledger_statements WHERE company_id=$1
          ORDER BY uploaded_at DESC`,
        [companyId],
      ),
      c.query<{ account: string; currency: string; date: string; amount: string }>(
        `SELECT DISTINCT ON (account_code) account_code AS account,currency,balance_date::text AS date,amount::text
          FROM bank_feed_balances WHERE company_id=$1 ORDER BY account_code,balance_date DESC`,
        [companyId],
      ),
      c.query<{ account: string; amount: string }>(
        `SELECT account,sum(base::numeric)::text AS amount FROM (${movementsSql}) m GROUP BY account`,
        [companyId],
      ),
      c.query<{ id: string; kind: "mapping" | "rule"; pattern: string; account: string }>(
        "SELECT id,kind,pattern,account_code AS account FROM bank_feed_rules WHERE company_id=$1 ORDER BY kind,pattern",
        [companyId],
      ),
      journalPostingAccess(c, companyId, auth.user.id),
    ]);
    return {
      rows: rows.rows.map(withSourceStatus),
      files: files.rows,
      balances: balances.rows,
      posted: posted.rows,
      rules: rules.rows,
      canWrite: auth.permissions.write_accounting,
      canReverse: auth.permissions.write_accounting && access.grant.post && access.grant.reverse,
    };
  });
}

export async function bankFeedRegister({ companyId, account }: Scope & { account: string }) {
  return transaction(companyId, false, (c) => register(c, companyId, account));
}

export async function bankFeedFile({ companyId, id }: Scope & { id: string }) {
  return transaction(companyId, false, async (c) => {
    const file = (
      await c.query<{ name: string; content: string }>(
        "SELECT file_name AS name,content FROM ledger_statements WHERE company_id=$1 AND id=$2",
        [companyId, id],
      )
    ).rows[0];
    if (!file?.content) throw new Error("Archived CSV unavailable.");
    return file;
  });
}

export async function bankFeedAttachment({ companyId, rowId, id }: RowScope & { id: string }) {
  return transaction(companyId, false, async (c) => {
    const file = (
      await c.query<{ name: string; content: Buffer }>(
        "SELECT name,content FROM bank_feed_attachments WHERE company_id=$1 AND row_id=$2 AND id=$3",
        [companyId, rowId, id],
      )
    ).rows[0];
    if (!file) throw new Error("Attachment unavailable.");
    return { name: file.name, content: file.content.toString("base64") };
  });
}

type Document = Bill | Invoice;
const outgoing = (row: BankRow) => Number(row.amount) < 0;
const party = (doc: Document) =>
  "vendorName" in doc
    ? { id: doc.vendorId ?? "", name: doc.vendorName, reference: doc.billNumber || doc.id }
    : { id: doc.customerId ?? "", name: doc.customerName, reference: doc.id };

function tradeDocuments(state: CompanyState, row: BankRow) {
  return outgoing(row) ? state.bills : state.invoices;
}

async function eligibleMovements(
  c: PoolClient,
  companyId: string,
  row: BankRow,
  state: CompanyState,
) {
  const [movements, links] = await Promise.all([
    register(c, companyId, row.account),
    c.query<{ movement_key: string }>(
      "SELECT movement_key FROM bank_feed_links WHERE company_id=$1 AND active",
      [companyId],
    ),
  ]);
  const linked = new Set(links.rows.map((l) => l.movement_key));
  const payments = new Map<string, { doc: Document; payment: Payment }>();
  for (const doc of tradeDocuments(state, row)) {
    for (const payment of doc.payments ?? []) {
      if (!payment.reversedAt) payments.set(payment.journalId, { doc, payment });
    }
  }
  return movements.flatMap((movement) => {
    if (
      linked.has(movement.key) ||
      !movement.unreversed ||
      movement.owned ||
      Number(movement.amount) < 0 !== outgoing(row)
    )
      return [];
    const paid = payments.get(movement.journalId);
    let amount = movement.amount.replace(/^-/, "");
    if (movement.key.startsWith("legacy:") && movement.currency !== "USD") {
      if (
        !paid ||
        paid.payment.transactionCurrency !== row.currency ||
        money(Math.abs(Number(movement.base))) !==
          money(paid.payment.cashFunctionalAmount ?? paid.payment.functionalAmount)
      )
        return [];
      amount = money(paid.payment.transactionAmount - (paid.payment.discountAmount ?? 0)).toFixed(
        2,
      );
    } else if (movement.currency !== row.currency) return [];
    let units: bigint;
    try {
      units = bankAmount(amount, row.currency);
    } catch {
      return [];
    }
    if (units <= 0n || units > nativeTotal(row)) return [];
    return [
      {
        ...movement,
        amount: unitsAmount(units),
        party: paid ? party(paid.doc) : null,
        issueDate: paid?.doc.date ?? null,
        dueDate: paid?.doc.dueDate ?? null,
      },
    ];
  });
}

export async function bankFeedDetail(data: RowScope) {
  return transaction(data.companyId, false, async (c, auth) => {
    const row = await getRow(c, data);
    const state = await readState(data.companyId, c);
    const documents = tradeDocuments(state, row).flatMap((doc) => {
      const open = outstanding(doc).native;
      return open > 0
        ? [
            {
              ...party(doc),
              id: doc.id,
              partyId: party(doc).id,
              date: doc.date,
              dueDate: doc.dueDate,
              currency: normalizedFx(doc).transactionCurrency,
              open,
            },
          ]
        : [];
    });
    const [moves, attachments, history, rules, { policy, grant }] = await Promise.all([
      row.status === "Pending" && !row.attemptId
        ? eligibleMovements(c, data.companyId, row, state)
        : [],
      c.query<{ id: string; name: string; size: number }>(
        "SELECT id,name,octet_length(content) AS size FROM bank_feed_attachments WHERE company_id=$1 AND row_id=$2 ORDER BY created_at,id",
        [data.companyId, data.rowId],
      ),
      c.query<{
        id: string;
        kind: string;
        state: string;
        journalId: string | null;
        reversalId: string | null;
        date: string | null;
        journalNumber: string | null;
        memo: string | null;
        transactionType: string | null;
        payeeId: string | null;
        locationId: string | null;
        rate: string | null;
        rateSource: string | null;
      }>(
        `SELECT a.id,a.kind,a.state,a.journal_id AS "journalId",a.reversal_id AS "reversalId",
           a.accounting_date::text AS date,j.journal_number AS "journalNumber",a.memo,
           a.transaction_type AS "transactionType",a.payee_id AS "payeeId",a.location_id AS "locationId",
           a.rate::text,a.rate_source AS "rateSource"
         FROM bank_feed_attempts a LEFT JOIN journal_entries j ON j.id=a.journal_id
         WHERE a.company_id=$1 AND a.row_id=$2 ORDER BY a.created_at DESC,a.id`,
        [data.companyId, data.rowId],
      ),
      c.query<{
        account: string;
        active: boolean;
        allowed: boolean;
        costCenter: boolean;
        from: string | null;
        to: string | null;
      }>(
        `SELECT account_code AS account,active,posting_allowed AS allowed,cost_center_required AS "costCenter",
         valid_from::text AS "from",valid_to::text AS "to" FROM journal_account_rules WHERE company_id=$1`,
        [data.companyId],
      ),
      journalPostingAccess(c, data.companyId, auth.user.id),
    ]);
    const allocations = (
      await c.query<{
        attemptId: string;
        account: string | null;
        amount: string;
        description: string | null;
        customerId: string | null;
        projectId: string | null;
        costCenterId: string | null;
        classId: string | null;
        sku: string | null;
        quantity: string | null;
        unitRate: string | null;
        billable: boolean | null;
        documentId: string | null;
        cash: string | null;
      }>(
        `SELECT p.attempt_id AS "attemptId",p.account_code AS account,p.amount::text,p.description,
        p.customer_id AS "customerId",p.project_id AS "projectId",p.cost_center_id AS "costCenterId",
        p.class_id AS "classId",p.sku,p.quantity::text,p.unit_rate::text AS "unitRate",
        p.billable,p.document_id AS "documentId",p.expected_cash::text AS cash
       FROM bank_feed_allocations p JOIN bank_feed_attempts a ON a.id=p.attempt_id
       WHERE a.company_id=$1 AND a.row_id=$2 ORDER BY p.position`,
        [data.companyId, data.rowId],
      )
    ).rows;
    const matched = (
      await c.query<{ attemptId: string; key: string; reference: string | null }>(
        `SELECT l.attempt_id AS "attemptId",l.movement_key AS key,m.reference
       FROM bank_feed_links l JOIN bank_feed_attempts a ON a.id=l.attempt_id
       LEFT JOIN (${movementsSql}) m ON m.key=l.movement_key
       WHERE a.company_id=$1 AND a.row_id=$2 ORDER BY l.movement_key`,
        [data.companyId, data.rowId],
      )
    ).rows;
    const recent = row.fromTo
      ? (
          await c.query<{ account: string; count: number }>(
            `SELECT p.account_code AS account,count(*)::int AS count
       FROM bank_feed_allocations p JOIN bank_feed_attempts a ON a.id=p.attempt_id AND a.state='posted'
       JOIN ledger_stagingrows r ON (r.company_id,r.id)=(a.company_id,a.row_id)
       WHERE a.company_id=$1 AND lower(r.feed_from_to)=lower($2) AND p.account_code IS NOT NULL
       GROUP BY p.account_code ORDER BY count DESC,p.account_code LIMIT 6`,
            [data.companyId, row.fromTo],
          )
        ).rows
      : [];
    return {
      row,
      documents,
      moves,
      attachments: attachments.rows,
      history: history.rows,
      allocations,
      matched,
      recent,
      rules: rules.rows,
      approvalRequired: !!policy.approval_required || !grant.post,
      softClose: grant.soft,
      periodClosed: auth.company.isPeriodClosed,
    };
  });
}

async function updateRow(
  c: PoolClient,
  companyId: string,
  rowId: string,
  status: BankRow["status"],
  account?: string,
  exclusion?: string,
) {
  await c.query(
    "UPDATE ledger_stagingrows SET status=$3,classified_account=$4,feed_exclusion=$5 WHERE company_id=$1 AND id=$2",
    [companyId, rowId, status, account ?? null, exclusion ?? null],
  );
}

async function newAttempt(
  c: PoolClient,
  companyId: string,
  row: BankRow,
  kind: "category" | "settlement" | "match",
  details: {
    date?: string;
    transactionType?: string;
    memo?: string;
    payeeId?: string | undefined;
    locationId?: string | undefined;
    rate?: string;
    rateSource?: string;
    confirmDuplicate?: boolean;
  } = {},
) {
  const id = randomUUID();
  await c.query(
    `INSERT INTO bank_feed_attempts(company_id,row_id,id,kind,state,accounting_date,transaction_type,memo,payee_id,location_id,rate,rate_source,duplicate_confirmed)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      companyId,
      row.id,
      id,
      kind,
      kind === "match" ? "posted" : "pending",
      details.date ?? null,
      details.transactionType ?? null,
      details.memo ?? null,
      details.payeeId ?? null,
      details.locationId ?? null,
      details.rate ?? null,
      details.rateSource ?? null,
      details.confirmDuplicate ?? false,
    ],
  );
  return id;
}

function journalLine(accountCode: string, units: bigint, debit: boolean, description: string) {
  const amount = unitsAmount(units);
  return { accountCode, description, debit: debit ? amount : "0", credit: debit ? "0" : amount };
}

function nativeTotal(row: BankRow) {
  const units = bankAmount(row.amount, row.currency);
  return units < 0n ? -units : units;
}

function validateDimension(state: CompanyState, code: string, id?: string) {
  if (!id) return;
  if (
    !state.dimensions.some(
      (d) =>
        d.code.toUpperCase() === code &&
        d.status === "Active" &&
        d.options.some((o) => o.id === id && o.status === "Active"),
    )
  )
    throw new Error(`Select an active ${code.toLowerCase()} for this company.`);
}

async function category(
  c: PoolClient,
  auth: Auth,
  row: BankRow,
  input: BankCategory,
  state: CompanyState,
) {
  const companyId = auth.company.id;
  const fx = bankRate(row.currency, input.rate, input.rateSource);
  validateDimension(state, "LOCATION", input.locationId);
  const vendor = outgoing(row) ? state.vendors.find((v) => v.id === input.payeeId) : undefined;
  const customer = !outgoing(row) ? state.customers.find((v) => v.id === input.payeeId) : undefined;
  if (input.payeeId && !vendor && !customer) throw new Error("Select an active counterparty.");
  if (
    (input.transactionType === "Expense" && !outgoing(row)) ||
    (input.transactionType === "Deposit" && outgoing(row))
  )
    throw new Error("Transaction type does not match the direction of the bank movement.");
  const bank = nativeTotal(row);
  const baseBank = convertedUnits(unitsAmount(bank), fx.value);
  if (baseBank === 0n) throw new Error("The movement rounds to zero in USD.");
  const description = input.memo || row.description;
  const center = input.lines[0]?.costCenterId;
  const journalLines: JournalInput["lines"] = [
    {
      ...journalLine(row.account, bank, !outgoing(row), description),
      ...(center && input.lines.every((line) => line.costCenterId === center)
        ? { costCenterId: center }
        : {}),
    },
  ];
  const bases = [
    {
      debit: outgoing(row) ? "0" : unitsAmount(baseBank),
      credit: outgoing(row) ? unitsAmount(baseBank) : "0",
    },
  ];
  let total = 0n;
  let previousBase = 0n;
  for (const line of input.lines) {
    if (line.account === row.account) throw new Error("Choose a different counterpart account.");
    validateDimension(state, "CLASS", line.classId);
    if (line.billable && !line.customerId)
      throw new Error("Select a customer for each billable line.");
    if (line.sku) {
      if (
        !state.inventory.some((item) => item.sku === line.sku) ||
        !line.quantity ||
        !line.unitRate
      )
        throw new Error("Select a product or service and enter its quantity and rate.");
      if (
        itemAmount(line.quantity, line.unitRate, row.currency) !==
        unitsAmount(bankAmount(line.amount, row.currency))
      )
        throw new Error("The item amount must equal quantity × rate.");
    } else if (line.quantity || line.unitRate)
      throw new Error("Select a product or service for quantity and rate.");
    const units = bankAmount(line.amount, row.currency);
    if (units <= 0n) throw new Error("Each allocation must be positive.");
    total += units;
    const cumulative = convertedUnits(unitsAmount(total), fx.value);
    const base = unitsAmount(cumulative - previousBase);
    previousBase = cumulative;
    bases.push({ debit: outgoing(row) ? base : "0", credit: outgoing(row) ? "0" : base });
    journalLines.push({
      ...journalLine(line.account, units, outgoing(row), line.description || description),
      ...(line.customerId || customer ? { customerId: line.customerId || customer!.id } : {}),
      ...(vendor ? { vendorId: vendor.id } : {}),
      ...(line.projectId ? { projectId: line.projectId } : {}),
      ...(line.costCenterId ? { costCenterId: line.costCenterId } : {}),
    });
  }
  if (total !== bank) throw new Error("The allocated amounts must equal the bank amount.");
  const attempt = await newAttempt(c, companyId, row, "category", {
    ...input,
    memo: description,
    rate: fx.value,
    rateSource: fx.source,
  });
  for (const [index, line] of input.lines.entries())
    await c.query(
      `INSERT INTO bank_feed_allocations(attempt_id,position,account_code,amount,description,customer_id,
        project_id,cost_center_id,class_id,sku,quantity,unit_rate,billable)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        attempt,
        index,
        line.account,
        line.amount,
        line.description,
        line.customerId ?? null,
        line.projectId ?? null,
        line.costCenterId ?? null,
        line.classId ?? null,
        line.sku ?? null,
        line.quantity ?? null,
        line.unitRate ?? null,
        line.billable,
      ],
    );
  const journal = await createBankJournal(
    c,
    auth,
    attempt,
    {
      journalType: "Automatic",
      accountingDate: input.date,
      description,
      reference: row.id,
      currency: row.currency,
      exchangeRate: fx.value,
      exchangeRateSource: fx.source,
      lines: journalLines,
    },
    { bases },
  );
  await recordJournal(
    c,
    auth,
    row,
    attempt,
    journal,
    input.lines.length === 1 ? input.lines[0]?.account : undefined,
  );
  const mapCode = externalAccount(row.externalPosting, row.sourceFormat);
  if (input.rememberMapping && mapCode && input.lines.length === 1)
    await saveRule(c, auth, "mapping", mapCode, input.lines[0]!.account);
  return journal;
}

async function recordJournal(
  c: PoolClient,
  auth: Auth,
  row: BankRow,
  id: string,
  journal: { id: string; posted: boolean },
  account?: string,
) {
  await c.query("UPDATE bank_feed_attempts SET journal_id=$2,state=$3 WHERE id=$1", [
    id,
    journal.id,
    journal.posted ? "posted" : "pending",
  ]);
  if (journal.posted) await updateRow(c, auth.company.id, row.id, "Classified", account);
  await audit(c, auth, journal.posted ? "BANK_FEED_POST" : "BANK_FEED_SUBMIT", row.id, {
    attemptId: id,
    journalId: journal.id,
  });
}

class SettlementConflict extends Error {}

function controlAccount(state: CompanyState, kind: "AP" | "AR", doc: Document) {
  const original = state.journals.find(
    (j) => j.sourceId === doc.id && j.sourceType === (kind === "AP" ? "Bill" : "Invoice"),
  );
  return (
    (kind === "AP" ? original?.lines.at(-1)?.accountCode : original?.lines[0]?.accountCode) ??
    resolveAccount(state, kind === "AP" ? "20100" : "11000", kind === "AP" ? "2000" : "1100")
  );
}

function resolveAccount(state: CompanyState, preferred: string, legacy: string) {
  return resolvePostingAccount(state.accounts, state.postingAccounts ?? [], preferred, legacy);
}

function prepareSettlement(state: CompanyState, row: BankRow, input: BankSettlement) {
  const kind: "AP" | "AR" = outgoing(row) ? "AP" : "AR";
  const documents = tradeDocuments(state, row);
  const fx = bankRate(row.currency, input.rate, input.rateSource);
  if (new Set(input.lines.map((l) => l.documentId)).size !== input.lines.length)
    throw new SettlementConflict("Select each document once.");
  const allocations = input.lines.map((line) => {
    const doc = documents.find((d) => d.id === line.documentId);
    if (!doc || normalizedFx(doc).transactionCurrency !== row.currency)
      throw new SettlementConflict("Select documents in the same currency as the bank movement.");
    if (
      state.journals.some(
        (j) =>
          j.sourceType === "FXRevaluation" &&
          j.sourceId?.startsWith(`${kind}:${doc.id}:`) &&
          j.date >= input.date,
      )
    )
      throw new SettlementConflict("The settlement date must follow the latest revaluation.");
    const amount = Number(line.amount);
    const units = bankAmount(line.amount, row.currency);
    if (units % 100n !== 0n)
      throw new SettlementConflict(
        "The receivables and payables ledger supports up to two decimal places.",
      );
    let quote: ReturnType<typeof settlementAmounts>;
    try {
      quote = settlementAmounts(doc, kind, amount, Number(fx.value), input.date);
    } catch (error) {
      throw new SettlementConflict(
        `${party(doc).reference}: ${error instanceof Error ? error.message : "Invalid allocation."}`,
      );
    }
    return { doc, amount, ...quote };
  });
  const cash = allocations.reduce(
    (sum, p) => sum + bankAmount(p.cashAmount.toFixed(2), row.currency),
    0n,
  );
  const cashBase = allocations.reduce(
    (sum, p) => sum + amountUnits(p.cashFunctionalAmount.toFixed(2)),
    0n,
  );
  return { allocations, kind, fx, cash, cashBase };
}

type Settlement = ReturnType<typeof prepareSettlement>;

export async function bankSettlementPreview({
  companyId,
  input,
}: Scope & { input: BankSettlement }) {
  return transaction(companyId, false, async (c, auth) => {
    if (!auth.permissions.write_accounting) throw new Error("Access denied.");
    const row = await getRow(c, { companyId, rowId: input.rowId });
    if (row.status !== "Pending" || row.attemptId)
      throw new Error("The transaction is no longer available.");
    const quote = prepareSettlement(await readState(companyId, c), row, input);
    return {
      allocations: quote.allocations.map(({ doc, ...allocation }) => ({
        documentId: doc.id,
        ...allocation,
      })),
      cash: unitsAmount(quote.cash),
      cashBase: unitsAmount(quote.cashBase),
      difference: unitsAmount(quote.cash - nativeTotal(row)),
      rate: quote.fx.value,
      rateSource: quote.fx.source,
    };
  });
}

function settlementJournal(
  state: CompanyState,
  row: BankRow,
  date: string,
  quote: Settlement,
): JournalInput {
  const outgoingPayment = quote.kind === "AP";
  const center = quote.allocations[0]?.doc.costCenterId;
  const lines: JournalInput["lines"] = [
    {
      ...journalLine(row.account, quote.cashBase, !outgoingPayment, row.description),
      ...(center && quote.allocations.every((p) => p.doc.costCenterId === center)
        ? { costCenterId: center }
        : {}),
    },
  ];
  for (const p of quote.allocations) {
    const doc = p.doc;
    const contact =
      "vendorName" in doc
        ? doc.vendorId
          ? { vendorId: doc.vendorId }
          : {}
        : doc.customerId
          ? { customerId: doc.customerId }
          : {};
    const dimensions = {
      ...contact,
      ...(doc.costCenterId ? { costCenterId: doc.costCenterId } : {}),
      ...(doc.projectId ? { projectId: doc.projectId } : {}),
    };
    const counterpart = (account: string, value: number, debit: boolean, memo: string) => {
      if (value <= 0) return;
      if (account === row.account)
        throw new Error("Settlement counterpart cannot be the bank account.");
      lines.push({
        ...journalLine(
          account,
          amountUnits(value.toFixed(2)),
          debit,
          memo + " · " + party(doc).reference,
        ),
        ...dimensions,
      });
    };
    counterpart(
      controlAccount(state, quote.kind, doc),
      p.bookAmount,
      outgoingPayment,
      "Clear carrying amount",
    );
    counterpart(
      resolveAccount(
        state,
        outgoingPayment ? "80400" : "40900",
        outgoingPayment ? "80200" : "40200",
      ),
      p.discountFunctional,
      !outgoingPayment,
      "Contractual early-payment discount",
    );
    counterpart(
      resolveAccount(state, "80300", "6300"),
      Math.abs(p.realizedGain),
      p.realizedGain < 0,
      "Realized FX",
    );
  }
  return {
    journalType: "Automatic",
    accountingDate: date,
    description: row.description,
    reference: row.id,
    currency: "USD",
    exchangeRate: "1",
    exchangeRateSource: "Functional currency parity",
    lines,
  };
}

function refreshDocument(doc: Document) {
  const active = (doc.payments ?? []).filter((p) => !p.reversedAt);
  const last = active.at(-1);
  doc.status = outstanding(doc).native === 0 ? "Paid" : last ? "Partially Paid" : "Open";
  doc.paymentDate = last?.date;
  if ("vendorName" in doc) {
    doc.paidFxRate = last?.exchangeRateValue;
    doc.realizedFxDiff = money(active.reduce((total, p) => total + p.realizedGain, 0));
  }
}

async function applySettlement(
  c: PoolClient,
  companyId: string,
  state: CompanyState,
  attempt: string,
  row: BankRow,
  date: string,
  journalId: string,
  quote: Settlement,
) {
  for (const [position, p] of quote.allocations.entries()) {
    const payment: Payment = {
      id: randomUUID(),
      date,
      transactionCurrency: row.currency,
      transactionAmount: p.amount,
      functionalCurrency: "USD",
      exchangeRateValue: Number(quote.fx.value),
      exchangeRateSource: quote.fx.source,
      exchangeRateDate: date,
      functionalAmount: p.functionalAmount,
      bookAmount: p.bookAmount,
      cashFunctionalAmount: p.cashFunctionalAmount,
      discountAmount: p.discountAmount,
      realizedGain: p.realizedGain,
      journalId: "JE:" + journalId,
    };
    p.doc.payments = [...(p.doc.payments ?? []), payment];
    refreshDocument(p.doc);
    await c.query(
      "UPDATE bank_feed_allocations SET payment_id=$3 WHERE attempt_id=$1 AND position=$2",
      [attempt, position, payment.id],
    );
  }
  const domain = quote.kind === "AP" ? "bills" : "invoices";
  await replaceLedger(c, companyId, domain, state[domain] as unknown as Record<string, unknown>[]);
}

async function settle(
  c: PoolClient,
  auth: Auth,
  row: BankRow,
  input: BankSettlement,
  state: CompanyState,
) {
  const quote = prepareSettlement(state, row, input);
  if (quote.cash !== nativeTotal(row) || quote.cashBase <= 0n)
    throw new Error("The net payment must equal the bank amount.");
  const attempt = await newAttempt(c, auth.company.id, row, "settlement", {
    date: input.date,
    memo: row.description,
    rate: quote.fx.value,
    rateSource: quote.fx.source,
    confirmDuplicate: input.confirmDuplicate,
  });
  for (const [position, p] of quote.allocations.entries())
    await c.query(
      `INSERT INTO bank_feed_allocations(attempt_id,position,document_id,amount,expected_cash,expected_book,expected_discount,expected_gain)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        attempt,
        position,
        p.doc.id,
        p.amount,
        p.cashFunctionalAmount,
        p.bookAmount,
        p.discountAmount,
        p.realizedGain,
      ],
    );
  const journal = await createBankJournal(
    c,
    auth,
    attempt,
    settlementJournal(state, row, input.date, quote),
  );
  if (journal.posted)
    await applySettlement(c, auth.company.id, state, attempt, row, input.date, journal.id, quote);
  await recordJournal(c, auth, row, attempt, journal);
  return journal;
}

export async function releaseBankPosting(c: PoolClient, companyId: string, journalId: string) {
  await c.query(
    "UPDATE bank_feed_attempts SET state='rejected' WHERE company_id=$1 AND journal_id=$2 AND state='pending'",
    [companyId, journalId],
  );
}

export async function completeBankPosting(c: PoolClient, auth: Auth, journalId: string) {
  const companyId = auth.company.id;
  const attempt = (
    await c.query<{
      id: string;
      rowId: string;
      kind: string;
      date: string;
      rate: string;
      source: string;
      duplicateConfirmed: boolean;
    }>(
      `SELECT id,row_id AS "rowId",kind,accounting_date::text AS date,rate::text,rate_source AS source,
          duplicate_confirmed AS "duplicateConfirmed"
     FROM bank_feed_attempts WHERE company_id=$1 AND journal_id=$2 AND state='pending'`,
      [companyId, journalId],
    )
  ).rows[0];
  if (!attempt) throw new Error("Pending Bank Feed posting unavailable.");
  const row = await getRow(c, { companyId, rowId: attempt.rowId });
  if (row.status !== "Pending") throw new Error("The Bank Feed transaction is no longer pending.");
  if (row.duplicate && !attempt.duplicateConfirmed)
    return "A possible duplicate appeared after submission. Review it in the Bank Feed.";
  const allocations = (
    await c.query<{
      document_id: string;
      amount: string;
      expected_cash: string;
      expected_book: string;
      expected_discount: string;
      expected_gain: string;
      account_code: string | null;
    }>("SELECT * FROM bank_feed_allocations WHERE attempt_id=$1 ORDER BY position", [attempt.id])
  ).rows;
  if (attempt.kind === "settlement") {
    const state = await readState(companyId, c);
    let quote: Settlement;
    try {
      quote = prepareSettlement(state, row, {
        operation: "settle",
        rowId: row.id,
        date: attempt.date,
        rate: attempt.rate,
        rateSource: attempt.source,
        confirmDuplicate: true,
        lines: allocations.map((p) => ({ documentId: p.document_id, amount: p.amount })),
      });
    } catch (error) {
      if (error instanceof SettlementConflict) return error.message;
      throw error;
    }
    if (
      quote.cash !== nativeTotal(row) ||
      quote.allocations.some((p, i) => {
        const old = allocations[i]!;
        return (
          p.cashFunctionalAmount !== Number(old.expected_cash) ||
          p.bookAmount !== Number(old.expected_book) ||
          p.discountAmount !== Number(old.expected_discount) ||
          p.realizedGain !== Number(old.expected_gain)
        );
      })
    )
      return "The settlement amounts changed. Review the open titles and submit again.";
    await applySettlement(c, companyId, state, attempt.id, row, attempt.date, journalId, quote);
  }
  await c.query("UPDATE bank_feed_attempts SET state='posted' WHERE id=$1", [attempt.id]);
  await updateRow(
    c,
    companyId,
    row.id,
    "Classified",
    allocations.length === 1 ? (allocations[0]?.account_code ?? undefined) : undefined,
  );
  await audit(c, auth, "BANK_FEED_POST", row.id, { attemptId: attempt.id, journalId });
  return undefined;
}

async function match(c: PoolClient, auth: Auth, row: BankRow, keys: string[], state: CompanyState) {
  const companyId = auth.company.id;
  const moves = (await eligibleMovements(c, companyId, row, state)).filter((move) =>
    keys.includes(move.key),
  );
  if (moves.length !== keys.length)
    throw new Error("One or more selected movements are no longer available.");
  if (
    moves.reduce((total, move) => total + bankAmount(move.amount, row.currency), 0n) !==
    nativeTotal(row)
  )
    throw new Error("The selected movements must total the bank amount.");
  const attempt = await newAttempt(c, companyId, row, "match");
  await c.query(
    "INSERT INTO bank_feed_links(company_id,attempt_id,movement_key) SELECT $1::uuid,$2::uuid,unnest($3::text[])",
    [companyId, attempt, keys],
  );
  await updateRow(c, companyId, row.id, "Classified");
  await audit(c, auth, "BANK_FEED_MATCH", row.id, { attemptId: attempt, movements: keys });
  return { id: attempt, posted: true };
}

async function reverseSettlements(
  c: PoolClient,
  companyId: string,
  row: BankRow,
  date: string,
  reversalId: string,
) {
  const state = await readState(companyId, c);
  const outgoingPayment = outgoing(row);
  const payments = (
    await c.query<{ document_id: string; payment_id: string }>(
      "SELECT document_id,payment_id FROM bank_feed_allocations WHERE attempt_id=$1 ORDER BY position",
      [row.attemptId],
    )
  ).rows;
  for (const { document_id, payment_id } of payments) {
    const doc = tradeDocuments(state, row).find((d) => d.id === document_id);
    const position = doc?.payments?.findIndex((p) => p.id === payment_id) ?? -1;
    const payment = doc?.payments?.[position];
    if (!doc || !payment || payment.reversedAt)
      throw new Error("The original payment is unavailable.");
    const later = doc
      .payments!.slice(position + 1)
      .some((p) => !p.reversedAt || p.reversedAt > date);
    const revalued = state.journals.some(
      (j) =>
        j.sourceType === "FXRevaluation" &&
        j.sourceId?.startsWith(`${outgoingPayment ? "AP" : "AR"}:${doc.id}:`) &&
        j.date >= payment.date,
    );
    if (later || revalued)
      throw new Error(
        `${party(doc).reference}: resolve dependent payments or revaluations before undoing this settlement.`,
      );
    payment.reversedAt = date;
    payment.reversalJournalId = "JE:" + reversalId;
    refreshDocument(doc);
  }
  const domain = outgoingPayment ? "bills" : "invoices";
  await replaceLedger(c, companyId, domain, state[domain] as unknown as Record<string, unknown>[]);
}

async function undo(
  c: PoolClient,
  auth: Auth,
  row: ReturnType<typeof withSourceStatus>,
  input: Extract<BankAction, { operation: "undo" }>,
) {
  const companyId = auth.company.id;
  if (row.isSourcePosted) {
    await audit(c, auth, "BANK_FEED_UNDO_SOURCE", row.id, { sourceStatus: row.sourceStatus });
    return { id: row.id, posted: false };
  }
  if (row.status !== "Classified" || !row.attemptId || !row.attemptKind)
    throw new Error("Undo requires a posted transaction with a verified journal or match.");
  if (row.attemptKind === "match") {
    await c.query("UPDATE bank_feed_links SET active=false WHERE company_id=$1 AND attempt_id=$2", [
      companyId,
      row.attemptId,
    ]);
    await c.query("UPDATE bank_feed_attempts SET state='undone' WHERE id=$1", [row.attemptId]);
    await updateRow(c, companyId, row.id, "Pending");
    await audit(c, auth, "BANK_FEED_UNMATCH", row.id, { attemptId: row.attemptId });
    return { id: row.attemptId, posted: false };
  }
  if (!input.date || !input.reason || input.date < (row.accountingDate ?? row.date))
    throw new Error(
      "Enter a reversal reason and an open accounting date on or after the posting date.",
    );
  if (
    (
      await c.query(
        "SELECT 1 FROM bank_feed_links WHERE company_id=$1 AND active AND starts_with(movement_key,$2)",
        [companyId, row.journalId ? `journal:${row.journalId}:` : `legacy:${row.legacyJournalId}:`],
      )
    ).rowCount
  )
    throw new Error("Undo the other Bank Feed matches for this journal first.");
  const original = row.journalId
    ? (
        await c.query<{
          transaction_currency: string;
          exchange_rate: string;
          exchange_rate_source: string;
        }>(
          "SELECT transaction_currency,exchange_rate,exchange_rate_source FROM journal_entries WHERE company_id=$1 AND id=$2 AND status='Posted'",
          [companyId, row.journalId],
        )
      ).rows[0]
    : undefined;
  if (!original && !row.legacyJournalId) throw new Error("Original journal unavailable.");
  const lines = (
    await c.query<{
      account_code: string;
      credit: string;
      debit: string;
      description: string;
      project_id: string | null;
      cost_center_id: string | null;
      customer_id: string | null;
      vendor_id: string | null;
    }>(
      row.journalId
        ? "SELECT * FROM journal_entry_lines WHERE company_id=$1 AND journal_entry_id=$2 ORDER BY line_number"
        : "SELECT *,memo AS description,NULL AS customer_id,NULL AS vendor_id FROM ledger_journals_lines WHERE company_id=$1 AND parent_id=$2 ORDER BY position",
      [companyId, row.journalId ?? row.legacyJournalId],
    )
  ).rows;
  const reversal = await createBankJournal(
    c,
    auth,
    row.attemptId,
    {
      journalType: "Adjustment",
      accountingDate: input.date,
      description: "Bank Feed reversal: " + input.reason,
      reference: row.id,
      currency: original?.transaction_currency ?? "USD",
      exchangeRate: original?.exchange_rate ?? "1",
      exchangeRateSource: original?.exchange_rate_source ?? "Functional currency parity",
      lines: lines.map((line) => ({
        accountCode: line.account_code,
        description: line.description ?? "",
        debit: line.credit,
        credit: line.debit,
        ...(line.project_id ? { projectId: line.project_id } : {}),
        ...(line.cost_center_id ? { costCenterId: line.cost_center_id } : {}),
        ...(line.customer_id ? { customerId: line.customer_id } : {}),
        ...(line.vendor_id ? { vendorId: line.vendor_id } : {}),
      })),
    },
    {
      reversal: {
        reason: input.reason,
        ...(row.journalId ? { journalId: row.journalId } : { legacyId: row.legacyJournalId! }),
      },
    },
  );
  if (row.attemptKind === "settlement")
    await reverseSettlements(c, companyId, row, input.date, reversal.id);
  await c.query("UPDATE bank_feed_attempts SET state='undone',reversal_id=$2 WHERE id=$1", [
    row.attemptId,
    reversal.id,
  ]);
  await updateRow(c, companyId, row.id, "Pending");
  await audit(c, auth, "BANK_FEED_UNDO", row.id, {
    attemptId: row.attemptId,
    reversal: reversal.id,
    date: input.date,
    reason: input.reason,
  });
  return { id: reversal.id, posted: false };
}

async function saveRule(
  c: PoolClient,
  auth: Auth,
  kind: "mapping" | "rule",
  pattern: string,
  account: string,
) {
  const id = (
    await c.query<{ id: string }>(
      `INSERT INTO bank_feed_rules(company_id,kind,pattern,account_code) VALUES($1,$2,$3,$4)
     ON CONFLICT(company_id,kind,pattern) DO UPDATE SET account_code=excluded.account_code RETURNING id`,
      [auth.company.id, kind, pattern, account],
    )
  ).rows[0]!.id;
  await audit(c, auth, "BANK_FEED_RULE", id, { kind, pattern, account });
  return { id, posted: false };
}

function assertPending(row: ReturnType<typeof withSourceStatus>, confirmDuplicate?: boolean) {
  if (row.status !== "Pending" || row.attemptId)
    throw new Error("This transaction is no longer available. Refresh the Bank Feed.");
  if (confirmDuplicate === false && row.duplicate)
    throw new Error("Review the possible duplicate and confirm before continuing.");
}

async function moveBankRow(
  c: PoolClient,
  auth: Auth,
  row: ReturnType<typeof withSourceStatus>,
  input: Extract<BankAction, { operation: "exclude" | "restore" }>,
) {
  const companyId = auth.company.id;
  if (input.operation === "restore") {
    if (row.status !== "Excluded") throw new Error("Only excluded transactions can be restored.");
    await updateRow(c, companyId, row.id, "Pending");
    await audit(c, auth, "BANK_FEED_RESTORE", row.id, { reason: row.exclusion });
  } else {
    assertPending(row);
    await updateRow(c, companyId, row.id, "Excluded", undefined, input.reason);
    await audit(c, auth, "BANK_FEED_EXCLUDE", row.id, { reason: input.reason });
  }
  return { id: row.id, posted: false };
}

export async function bankFeedBatch({ companyId, input: raw }: Scope & { input: BankBatchAction }) {
  const input = bankBatchAction.parse(raw);
  return transaction(companyId, true, async (c, auth) => {
    const found = (
      await c.query<BankRow>(rowQuery + " AND f.account_code=$2 AND r.id=ANY($3::text[])", [
        companyId,
        input.bankAccount,
        input.rowIds,
      ])
    ).rows;
    if (found.length !== input.rowIds.length)
      throw new Error("One or more selected transactions are unavailable in this account.");
    const byId = new Map(found.map((row) => [row.id, withSourceStatus(row)]));
    const rows = input.rowIds.map((id) => byId.get(id)!);
    if (input.operation === "split") {
      const accounts = await readLedger(c, companyId, "accounts");
      if (
        input.account === input.bankAccount ||
        !accounts.some((account) => account["code"] === input.account) ||
        accounts.some((account) => account["parentCode"] === input.account)
      )
        throw new Error(
          "Select a counterpart posting account from this company's chart of accounts.",
        );
      for (const row of rows) assertPending(row);
      const changed = rows.filter((row) => row.splitAccount !== input.account);
      if (changed.length) {
        await c.query(
          "UPDATE ledger_stagingrows SET suggested_account=$3 WHERE company_id=$1 AND id=ANY($2::text[])",
          [companyId, changed.map(({ id }) => id), input.account],
        );
        for (const row of changed)
          await audit(c, auth, "BANK_FEED_SPLIT", row.id, {
            previous: row.splitAccount || row.externalPosting,
            account: input.account,
          });
      }
      return { count: rows.length, posted: 0, inApproval: 0 };
    }
    if (input.operation === "undo") {
      rows.sort(
        (a, b) =>
          Number(b.attemptKind === "match") - Number(a.attemptKind === "match") ||
          (b.accountingDate ?? b.date).localeCompare(a.accountingDate ?? a.date) ||
          (b.postedAt ?? "").localeCompare(a.postedAt ?? ""),
      );
    }
    if (input.operation === "categorize") {
      const first = rows[0]!;
      if (rows.some((row) => row.currency !== first.currency))
        throw new Error("Select transactions in the same currency.");
      if (first.currency !== "USD" && rows.some((row) => row.date !== first.date))
        throw new Error("Select a single bank date when applying a shared exchange rate.");
    }
    const state = input.operation === "categorize" ? await readState(companyId, c) : undefined;
    let posted = 0;
    for (const row of rows) {
      try {
        if (input.operation === "categorize" && state) {
          assertPending(row, input.confirmDuplicate);
          const counterpart = outgoing(row) ? input.outflowAccount : input.inflowAccount;
          if (!counterpart) throw new Error("Select a counterpart account for this direction.");
          const party = row.fromTo.toLowerCase();
          const contacts = (outgoing(row) ? state.vendors : state.customers).filter(
            (contact) => party && contact.displayName.toLowerCase() === party,
          );
          const result = await category(
            c,
            auth,
            row,
            bankCategory.parse({
              operation: "categorize",
              rowId: row.id,
              date: row.date,
              transactionType: outgoing(row) ? "Expense" : "Deposit",
              memo: row.description,
              payeeId: row.partyEdited
                ? row.partyName
                  ? (row.partyId ?? undefined)
                  : undefined
                : contacts.length === 1
                  ? contacts[0]!.id
                  : undefined,
              rate: input.rate,
              rateSource: input.rateSource,
              confirmDuplicate: input.confirmDuplicate,
              lines: [
                {
                  account: counterpart,
                  description: "",
                  amount: unitsAmount(nativeTotal(row)),
                  costCenterId: input.costCenterId,
                },
              ],
            }),
            state,
          );
          if (result.posted) posted++;
        } else if (input.operation === "undo") {
          await undo(c, auth, row, { ...input, rowId: row.id });
        } else if (input.operation === "exclude" || input.operation === "restore") {
          await moveBankRow(c, auth, row, { ...input, rowId: row.id });
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Operation failed.";
        throw new Error(`${row.date} · ${row.description.slice(0, 100)}: ${detail}`);
      }
    }
    return {
      count: rows.length,
      posted,
      inApproval: input.operation === "categorize" ? rows.length - posted : 0,
    };
  });
}

export async function bankFeedCommand({ companyId, input: raw }: Scope & { input: BankAction }) {
  const input = bankAction.parse(raw);
  return transaction(companyId, true, async (c, auth) => {
    if (input.operation === "balance") {
      await validateSource(c, companyId, input.account, input.currency);
      const amount = unitsAmount(bankAmount(input.amount, input.currency));
      await c.query(
        `INSERT INTO bank_feed_balances(company_id,account_code,currency,balance_date,amount) VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(company_id,account_code,balance_date) DO UPDATE SET amount=excluded.amount`,
        [companyId, input.account, input.currency, input.date, amount],
      );
      await audit(c, auth, "BANK_FEED_BALANCE", input.account, {
        amount,
        date: input.date,
        currency: input.currency,
      });
      return { id: input.account, posted: false };
    }
    if (input.operation === "rule") {
      const pattern = input.pattern.toLowerCase();
      if (input.kind === "mapping" && !/^\d+$/.test(pattern))
        throw new Error("Enter the source account number for a QuickBooks mapping.");
      const accounts = await readLedger(c, companyId, "accounts");
      if (
        !accounts.some((a) => a["code"] === input.account) ||
        accounts.some((a) => a["parentCode"] === input.account)
      )
        throw new Error("Select a posting account.");
      return saveRule(c, auth, input.kind, pattern, input.account);
    }
    if (input.operation === "removeRule") {
      const deleted = await c.query(
        "DELETE FROM bank_feed_rules WHERE company_id=$1 AND id=$2 RETURNING *",
        [companyId, input.id],
      );
      if (!deleted.rowCount) throw new Error("Rule unavailable.");
      await audit(c, auth, "BANK_FEED_REMOVE_RULE", input.id, deleted.rows[0]);
      return { id: input.id, posted: false };
    }
    const row = await getRow(c, { companyId, rowId: input.rowId });
    if (input.operation === "date") {
      assertPending(row);
      if (input.date !== row.date) {
        await c.query(
          "UPDATE ledger_stagingrows SET date=$3,feed_fingerprint=coalesce(feed_fingerprint,$4) WHERE company_id=$1 AND id=$2",
          [
            companyId,
            row.id,
            input.date,
            fingerprint(row.account, row.currency, {
              date: row.date,
              amountText: row.amount,
              description: row.description,
            }),
          ],
        );
        await audit(c, auth, "BANK_FEED_DATE", row.id, {
          previousDate: row.date,
          date: input.date,
        });
      }
      return { id: row.id, posted: false };
    }
    if (input.operation === "party") {
      assertPending(row);
      if (input.payeeId) {
        const domain = outgoing(row) ? "vendors" : "customers";
        const contacts = await readLedger(c, companyId, domain);
        if (!contacts.some((contact) => contact["id"] === input.payeeId))
          throw new Error("Select a counterparty from this company.");
      }
      await c.query(
        "UPDATE ledger_stagingrows SET feed_payee_id=$3,feed_party_edited=true WHERE company_id=$1 AND id=$2",
        [companyId, row.id, input.payeeId],
      );
      await audit(c, auth, "BANK_FEED_PARTY", row.id, {
        previous: row.partyId,
        payeeId: input.payeeId,
      });
      return { id: row.id, posted: false };
    }
    if (input.operation === "attach" || input.operation === "removeAttachment") {
      if (input.operation === "attach") {
        const content = Buffer.from(input.content, "base64");
        if (
          !content.length ||
          content.length > 10_000_000 ||
          content.toString("base64") !== input.content
        )
          throw new Error("Invalid attachment. Maximum size is 10 MB.");
        const attachment = (
          await c.query<{ id: string }>(
            "INSERT INTO bank_feed_attachments(company_id,row_id,name,content) VALUES($1,$2,$3,$4) RETURNING id",
            [companyId, row.id, input.name, content],
          )
        ).rows[0]!;
        await audit(c, auth, "BANK_FEED_ATTACHMENT", row.id, {
          id: attachment.id,
          name: input.name,
          size: content.length,
        });
        return { id: attachment.id, posted: false };
      }
      const deleted = await c.query(
        "DELETE FROM bank_feed_attachments WHERE company_id=$1 AND row_id=$2 AND id=$3 RETURNING name",
        [companyId, row.id, input.id],
      );
      if (!deleted.rowCount) throw new Error("Attachment unavailable.");
      await audit(c, auth, "BANK_FEED_REMOVE_ATTACHMENT", row.id, {
        id: input.id,
        name: deleted.rows[0].name,
      });
      return { id: input.id, posted: false };
    }
    if (input.operation === "undo") return undo(c, auth, row, input);
    if (input.operation === "restore" || input.operation === "exclude")
      return moveBankRow(c, auth, row, input);
    assertPending(row, input.confirmDuplicate);
    const state = await readState(companyId, c);
    if (input.operation === "match") return match(c, auth, row, input.keys, state);
    if (input.operation === "settle") return settle(c, auth, row, input, state);
    return category(c, auth, row, input, state);
  });
}
