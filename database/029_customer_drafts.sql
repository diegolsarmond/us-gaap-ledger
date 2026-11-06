BEGIN;
SELECT pg_advisory_xact_lock(803003);
ALTER TABLE ledger_customers ADD COLUMN IF NOT EXISTS registration_status text NOT NULL DEFAULT 'Active' CHECK(registration_status IN ('Draft','Active'));
-- Incomplete legacy contacts remain available for completion, but cannot be invoiced.
UPDATE ledger_customers SET registration_status='Draft' WHERE registration_status='Active' AND (
 btrim(company_name)='' OR btrim(email)='' OR btrim(billing_address_street)='' OR btrim(billing_address_city)='' OR btrim(billing_address_country)=''
 OR (NOT shipping_same_as_billing AND (btrim(shipping_address_street)='' OR btrim(shipping_address_city)='' OR btrim(shipping_address_country)=''))
);
COMMIT;
