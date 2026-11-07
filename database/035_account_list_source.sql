BEGIN;

ALTER TABLE ledger_accounts
  ADD COLUMN IF NOT EXISTS source_account_number text,
  ADD COLUMN IF NOT EXISTS source_account_path text,
  ADD COLUMN IF NOT EXISTS source_account_type text,
  ADD COLUMN IF NOT EXISTS source_account_currency text,
  ADD COLUMN IF NOT EXISTS source_account_balance numeric(15,4);

COMMIT;
