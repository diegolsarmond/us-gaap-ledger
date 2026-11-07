BEGIN;

ALTER TABLE ledger_statements ADD COLUMN IF NOT EXISTS feed_currency text NOT NULL DEFAULT 'USD';
ALTER TABLE ledger_statements ADD COLUMN IF NOT EXISTS feed_digest text;
CREATE UNIQUE INDEX IF NOT EXISTS bank_feed_batch ON ledger_statements(company_id,account_code,feed_digest)
 WHERE feed_digest IS NOT NULL;
ALTER TABLE ledger_stagingrows ADD COLUMN IF NOT EXISTS feed_from_to text NOT NULL DEFAULT '';
ALTER TABLE ledger_stagingrows ADD COLUMN IF NOT EXISTS feed_external_posting text NOT NULL DEFAULT '';
ALTER TABLE ledger_stagingrows ADD COLUMN IF NOT EXISTS feed_fingerprint text;
ALTER TABLE ledger_stagingrows ADD COLUMN IF NOT EXISTS feed_exclusion text;
CREATE INDEX IF NOT EXISTS bank_feed_rows_by_file ON ledger_stagingrows(company_id,file_id);
CREATE INDEX IF NOT EXISTS bank_feed_rows_by_fingerprint ON ledger_stagingrows(company_id,feed_fingerprint);

CREATE TABLE IF NOT EXISTS bank_feed_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 row_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('category','settlement','match','legacy')),
 state text NOT NULL CHECK(state IN ('pending','posted','rejected','undone')),
 journal_id uuid UNIQUE REFERENCES journal_entries(id), legacy_journal_id text,
 reversal_id uuid UNIQUE REFERENCES journal_entries(id), accounting_date date,
 transaction_type text, memo text, payee_id text, location_id text, rate numeric(24,12), rate_source text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,id),
 FOREIGN KEY(company_id,row_id) REFERENCES ledger_stagingrows(company_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(company_id,legacy_journal_id) REFERENCES ledger_journals(company_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_feed_active_attempt ON bank_feed_attempts(company_id,row_id)
 WHERE state IN ('pending','posted');
ALTER TABLE bank_feed_attempts ADD COLUMN IF NOT EXISTS duplicate_confirmed boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS bank_feed_legacy_owner ON bank_feed_attempts(company_id,legacy_journal_id)
 WHERE legacy_journal_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS bank_feed_allocations (
 attempt_id uuid NOT NULL REFERENCES bank_feed_attempts(id), position integer NOT NULL,
 account_code text, amount numeric(20,4) NOT NULL CHECK(amount>0), description text,
 customer_id text, project_id text, cost_center_id text, class_id text, sku text,
 quantity numeric, unit_rate numeric, billable boolean,
 document_id text, expected_cash numeric(20,2), expected_book numeric(20,2),
 expected_discount numeric(20,4), expected_gain numeric(20,2), payment_id text,
 PRIMARY KEY(attempt_id,position)
);
CREATE TABLE IF NOT EXISTS bank_feed_links (
 company_id uuid NOT NULL, attempt_id uuid NOT NULL, movement_key text NOT NULL, active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(attempt_id,movement_key),
 FOREIGN KEY(company_id,attempt_id) REFERENCES bank_feed_attempts(company_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_feed_unique_link ON bank_feed_links(company_id,movement_key) WHERE active;
CREATE TABLE IF NOT EXISTS bank_feed_balances (
 company_id uuid NOT NULL REFERENCES companies(id), account_code text NOT NULL, currency text NOT NULL,
 balance_date date NOT NULL, amount numeric(20,4) NOT NULL,
 PRIMARY KEY(company_id,account_code,balance_date),
 FOREIGN KEY(company_id,account_code) REFERENCES ledger_accounts(company_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS bank_feed_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 kind text NOT NULL CHECK(kind IN ('mapping','rule')), pattern text NOT NULL, account_code text NOT NULL,
 UNIQUE(company_id,kind,pattern),
 FOREIGN KEY(company_id,account_code) REFERENCES ledger_accounts(company_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS bank_feed_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, row_id text NOT NULL,
 name text NOT NULL, content bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,row_id) REFERENCES ledger_stagingrows(company_id,id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE ledger_bills_payments ADD COLUMN IF NOT EXISTS reversed_at date;
ALTER TABLE ledger_bills_payments ADD COLUMN IF NOT EXISTS reversal_journal_id text;
ALTER TABLE ledger_invoices_payments ADD COLUMN IF NOT EXISTS reversed_at date;
ALTER TABLE ledger_invoices_payments ADD COLUMN IF NOT EXISTS reversal_journal_id text;

-- Recover only pairs proved by one atomic legacy command and verified against the bank leg.
WITH evidence AS (
 SELECT a.company_id,s.key AS row_id,j.key AS journal_id
 FROM system_audit_events a
 JOIN LATERAL (SELECT read_audit_snapshot(a.id,'after',ARRAY['stagingRows']) AS rows,
                      read_audit_snapshot(a.id,'after',ARRAY['journals']) AS journals) snapshot ON true
 CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(snapshot.rows)='object' THEN snapshot.rows ELSE '{}'::jsonb END) s
 CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(snapshot.journals)='object' THEN snapshot.journals ELSE '{}'::jsonb END) j
 JOIN ledger_stagingrows r ON r.company_id=a.company_id AND r.id=s.key AND r.status='Classified'
 JOIN ledger_statements f ON f.company_id=r.company_id AND f.id=r.file_id
 JOIN ledger_journals l ON l.company_id=a.company_id AND l.id=j.key AND l.date=r.date
   AND l.source_type='BankStaging' AND l.status='Posted' AND l.currency='USD'
 JOIN ledger_journals_lines b ON b.company_id=l.company_id AND b.parent_id=l.id
   AND b.account_code=f.account_code AND b.debit-b.credit=r.amount
 WHERE a.action='classifyStagingRow' AND s.value->>'status'='Classified'
   AND NOT EXISTS (SELECT 1 FROM ledger_journals v WHERE v.company_id=l.company_id AND v.source_id=l.id AND v.status='Posted')
), unambiguous AS (
 SELECT *,count(*) OVER (PARTITION BY company_id,row_id) AS rows_found,
          count(*) OVER (PARTITION BY company_id,journal_id) AS journals_found FROM evidence
)
INSERT INTO bank_feed_attempts(company_id,row_id,kind,state,legacy_journal_id,accounting_date)
SELECT u.company_id,u.row_id,'legacy','posted',u.journal_id,r.date
FROM unambiguous u JOIN ledger_stagingrows r ON r.company_id=u.company_id AND r.id=u.row_id
WHERE u.rows_found=1 AND u.journals_found=1 ON CONFLICT DO NOTHING;

COMMIT;
