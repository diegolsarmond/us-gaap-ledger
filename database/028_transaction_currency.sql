BEGIN;
SELECT pg_advisory_xact_lock(803003);
DROP VIEW IF EXISTS customer_registration;
DROP VIEW IF EXISTS vendor_registration;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='ledger_customers' AND column_name='currency') THEN
  ALTER TABLE ledger_customers RENAME COLUMN currency TO source_currency;
 END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='ledger_vendors' AND column_name='currency') THEN
  ALTER TABLE ledger_vendors RENAME COLUMN currency TO source_currency;
 END IF;
END $$;
-- Historical source currency is retained for migration provenance, never a trading restriction.
CREATE TABLE IF NOT EXISTS ledger_vendors_bankaccounts (
 company_id uuid NOT NULL, parent_id text NOT NULL, position integer NOT NULL,
 id uuid NOT NULL, label text NOT NULL, currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 bank_name text NOT NULL, account_number text NOT NULL, routing_number text NOT NULL,
 swift_bic text NOT NULL, payment_type text NOT NULL CHECK(payment_type IN ('ACH','Wire')),
 PRIMARY KEY(company_id,parent_id,position), UNIQUE(company_id,id),
 FOREIGN KEY(company_id,parent_id) REFERENCES ledger_vendors(company_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS ledger_customers_customfields (
 company_id uuid NOT NULL, parent_id text NOT NULL, position integer NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 type text NOT NULL CHECK(type IN ('Text','Number','Date','Checkbox')),
 value text NOT NULL CHECK(length(value)<=2000),
 PRIMARY KEY(company_id,parent_id,position),
 FOREIGN KEY(company_id,parent_id) REFERENCES ledger_customers(company_id,id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE ledger_invoices
 ADD COLUMN IF NOT EXISTS customer_id text,
 ADD COLUMN IF NOT EXISTS transaction_currency text NOT NULL DEFAULT 'USD',
 ADD COLUMN IF NOT EXISTS transaction_amount numeric,
 ADD COLUMN IF NOT EXISTS functional_currency text NOT NULL DEFAULT 'USD',
 ADD COLUMN IF NOT EXISTS exchange_rate_value numeric NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS functional_amount numeric,
 ADD COLUMN IF NOT EXISTS exchange_rate_source text NOT NULL DEFAULT 'Legacy USD',
 ADD COLUMN IF NOT EXISTS exchange_rate_date date;
UPDATE ledger_invoices SET transaction_amount=total,functional_amount=total,exchange_rate_date=date WHERE transaction_amount IS NULL;
ALTER TABLE ledger_bills
 ADD COLUMN IF NOT EXISTS transaction_currency text,
 ADD COLUMN IF NOT EXISTS transaction_amount numeric,
 ADD COLUMN IF NOT EXISTS functional_currency text NOT NULL DEFAULT 'USD',
 ADD COLUMN IF NOT EXISTS exchange_rate_value numeric,
 ADD COLUMN IF NOT EXISTS functional_amount numeric,
 ADD COLUMN IF NOT EXISTS exchange_rate_source text NOT NULL DEFAULT 'Legacy / manual',
 ADD COLUMN IF NOT EXISTS exchange_rate_date date;
UPDATE ledger_bills SET transaction_currency=currency,transaction_amount=foreign_amount,exchange_rate_value=fx_rate,functional_amount=usd_amount,exchange_rate_date=date WHERE transaction_amount IS NULL;
ALTER TABLE ledger_projects ADD COLUMN IF NOT EXISTS customer_id text;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['ledger_invoices','ledger_bills'] LOOP
  EXECUTE format('ALTER TABLE %I ALTER COLUMN transaction_currency SET NOT NULL, ALTER COLUMN transaction_amount SET NOT NULL, ALTER COLUMN exchange_rate_value SET NOT NULL, ALTER COLUMN functional_amount SET NOT NULL',t);
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname=t||'_currency_values' AND conrelid=t::regclass) THEN
   EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK(transaction_currency ~ ''^[A-Z]{3}$'' AND functional_currency ~ ''^[A-Z]{3}$'' AND exchange_rate_value>0 AND transaction_amount>=0 AND functional_amount=round(transaction_amount*exchange_rate_value,2))',t,t||'_currency_values');
  END IF;
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (
   company_id uuid NOT NULL,parent_id text NOT NULL,position integer NOT NULL,id text NOT NULL,
   date date NOT NULL,transaction_currency text NOT NULL,transaction_amount numeric NOT NULL CHECK(transaction_amount>0),
   functional_currency text NOT NULL,exchange_rate_value numeric NOT NULL CHECK(exchange_rate_value>0),
   functional_amount numeric NOT NULL,book_amount numeric NOT NULL,realized_gain numeric NOT NULL,
   bank_account_id text,journal_id text NOT NULL,exchange_rate_source text NOT NULL,exchange_rate_date date,
   PRIMARY KEY(company_id,parent_id,position),UNIQUE(company_id,id),
   FOREIGN KEY(company_id,parent_id) REFERENCES %I(company_id,id) DEFERRABLE INITIALLY DEFERRED
  )',t||'_payments',t);
 END LOOP;
END $$;
-- Keep paid legacy documents paid; their original payment journal already exists.
INSERT INTO ledger_invoices_payments(company_id,parent_id,position,id,date,transaction_currency,transaction_amount,functional_currency,exchange_rate_value,functional_amount,book_amount,realized_gain,journal_id,exchange_rate_source)
 SELECT company_id,id,0,'legacy-'||id,coalesce(payment_date,date),transaction_currency,transaction_amount,functional_currency,exchange_rate_value,functional_amount,functional_amount,0,'Legacy payment','Legacy USD'
 FROM ledger_invoices i WHERE status='Paid' AND transaction_amount>0 AND NOT EXISTS(SELECT 1 FROM ledger_invoices_payments p WHERE p.company_id=i.company_id AND p.parent_id=i.id);
INSERT INTO ledger_bills_payments(company_id,parent_id,position,id,date,transaction_currency,transaction_amount,functional_currency,exchange_rate_value,functional_amount,book_amount,realized_gain,journal_id,exchange_rate_source)
 SELECT company_id,id,0,'legacy-'||id,coalesce(payment_date,date),transaction_currency,transaction_amount,functional_currency,coalesce(paid_fx_rate,exchange_rate_value),round(transaction_amount*coalesce(paid_fx_rate,exchange_rate_value),2),functional_amount,coalesce(realized_fx_diff,0),'Legacy payment','Legacy / manual'
 FROM ledger_bills b WHERE status='Paid' AND transaction_amount>0 AND NOT EXISTS(SELECT 1 FROM ledger_bills_payments p WHERE p.company_id=b.company_id AND p.parent_id=b.id);
CREATE OR REPLACE VIEW customer_registration AS SELECT company_id,id,display_name,company_name,billing_address_street AS street_address,billing_address_city AS city,billing_address_state AS state,billing_address_country AS country,billing_address_zip AS zip,phone,email,source_currency,source_open_balance,source_balance_date FROM ledger_customers;
CREATE OR REPLACE VIEW vendor_registration AS SELECT company_id,id,display_name,company_name,street_address,city,state_province AS state,country,zip_code AS zip,phone,email,track1099 AS track_1099,source_currency,source_open_balance,source_balance_date FROM ledger_vendors;
COMMIT;
