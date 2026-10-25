-- Explicit, one-time cleanup authorized for the transition. Never run on application startup.
BEGIN;
CREATE TABLE IF NOT EXISTS app_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
SELECT pg_advisory_xact_lock(803005);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_migrations WHERE id='005_reset_legacy_cash') THEN
  DELETE FROM cash_transactions WHERE company_id IS NULL;
  DELETE FROM cash_accounts WHERE company_id IS NULL;
  INSERT INTO app_migrations(id) VALUES('005_reset_legacy_cash');
 END IF;
END $$;
ALTER TABLE cash_accounts ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE cash_transactions ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE cash_accounts DROP CONSTRAINT IF EXISTS cash_accounts_user_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS cash_accounts_company_name_key ON cash_accounts(company_id,name);
CREATE UNIQUE INDEX IF NOT EXISTS cash_accounts_id_company_key ON cash_accounts(id,company_id);
ALTER TABLE cash_transactions DROP CONSTRAINT IF EXISTS cash_transactions_account_id_user_id_fkey;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='cash_transactions_account_company_fkey' AND conrelid='cash_transactions'::regclass) THEN
 ALTER TABLE cash_transactions ADD CONSTRAINT cash_transactions_account_company_fkey FOREIGN KEY(account_id,company_id) REFERENCES cash_accounts(id,company_id);
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS cash_transactions_company_dates_idx ON cash_transactions(company_id,due_date,paid_date);
COMMIT;
