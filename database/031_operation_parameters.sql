BEGIN;
CREATE TABLE IF NOT EXISTS ledger_postingaccounts (
 company_id uuid NOT NULL REFERENCES companies(id), id text NOT NULL, position integer NOT NULL,
 code text NOT NULL, name text NOT NULL, gl_account_code text NOT NULL, status text NOT NULL,
 scope text, shared_id uuid, PRIMARY KEY(company_id,id), UNIQUE(company_id,code),
 FOREIGN KEY(company_id,gl_account_code) REFERENCES ledger_accounts(company_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS ledger_postingaccounts_companyids (
 company_id uuid NOT NULL, parent_id text NOT NULL, position integer NOT NULL, value uuid NOT NULL REFERENCES companies(id),
 PRIMARY KEY(company_id,parent_id,position), FOREIGN KEY(company_id,parent_id) REFERENCES ledger_postingaccounts(company_id,id) DEFERRABLE INITIALLY DEFERRED
);
DO $migration$ DECLARE t text; c record; BEGIN
 FOREACH t IN ARRAY ARRAY['cash_accounts','cash_flow_reconciliations'] LOOP
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid=t::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%currency%' LOOP
 EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',t,c.conname);
 END LOOP;
 EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK(currency ~ ''^[A-Z]{3}$'')',t,t||'_currency_iso');
 END LOOP;
END $migration$;
ALTER TABLE ledger_invoices ADD COLUMN IF NOT EXISTS cost_center_id text;
ALTER TABLE ledger_bills ADD COLUMN IF NOT EXISTS cost_center_id text;
ALTER TABLE ledger_journals_lines ADD COLUMN IF NOT EXISTS cost_center_id text;
COMMIT;
