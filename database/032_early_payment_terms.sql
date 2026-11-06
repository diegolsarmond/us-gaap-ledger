BEGIN;
ALTER TABLE ledger_invoices ADD COLUMN IF NOT EXISTS early_discount_percentage numeric, ADD COLUMN IF NOT EXISTS discount_days integer;
ALTER TABLE ledger_bills ADD COLUMN IF NOT EXISTS early_discount_percentage numeric, ADD COLUMN IF NOT EXISTS discount_days integer;
ALTER TABLE ledger_invoices_payments ADD COLUMN IF NOT EXISTS discount_amount numeric, ADD COLUMN IF NOT EXISTS cash_functional_amount numeric;
ALTER TABLE ledger_bills_payments ADD COLUMN IF NOT EXISTS discount_amount numeric, ADD COLUMN IF NOT EXISTS cash_functional_amount numeric;
COMMIT;
