BEGIN;
SELECT pg_advisory_xact_lock(803003);
CREATE UNIQUE INDEX IF NOT EXISTS customer_global_display_name ON ledger_customers(company_id,lower(btrim(display_name)));
CREATE UNIQUE INDEX IF NOT EXISTS vendor_global_display_name ON ledger_vendors(company_id,lower(btrim(display_name)));
ALTER TABLE ledger_bills_payments ALTER COLUMN bank_account_id TYPE uuid USING nullif(bank_account_id::text,'')::uuid;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='bill_payment_vendor_bank_account' AND conrelid='ledger_bills_payments'::regclass) THEN
  ALTER TABLE ledger_bills_payments ADD CONSTRAINT bill_payment_vendor_bank_account
   FOREIGN KEY(company_id,bank_account_id) REFERENCES ledger_vendors_bankaccounts(company_id,id) DEFERRABLE INITIALLY DEFERRED;
 END IF;
END $$;
COMMIT;
