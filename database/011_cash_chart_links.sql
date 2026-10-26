BEGIN;
ALTER TABLE cash_accounts ADD COLUMN IF NOT EXISTS gl_account_code text;
ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS gl_account_code text;
-- Deferred checks allow the existing accounting transaction to rewrite a company's
-- ledger rows without temporarily breaking links to unchanged account codes.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cash_accounts_gl_company_fkey' AND conrelid='cash_accounts'::regclass) THEN
    ALTER TABLE cash_accounts ADD CONSTRAINT cash_accounts_gl_company_fkey
      FOREIGN KEY(company_id,gl_account_code) REFERENCES ledger_accounts(company_id,id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cash_transactions_gl_company_fkey' AND conrelid='cash_transactions'::regclass) THEN
    ALTER TABLE cash_transactions ADD CONSTRAINT cash_transactions_gl_company_fkey
      FOREIGN KEY(company_id,gl_account_code) REFERENCES ledger_accounts(company_id,id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS cash_accounts_gl_idx ON cash_accounts(company_id,gl_account_code);
CREATE INDEX IF NOT EXISTS cash_transactions_gl_idx ON cash_transactions(company_id,gl_account_code);
COMMIT;
