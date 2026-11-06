BEGIN;
SELECT pg_advisory_xact_lock(803003);
ALTER TABLE companies
 ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'US' CHECK (country IN ('US','MX')),
 ADD COLUMN IF NOT EXISTS primary_currency text NOT NULL DEFAULT 'USD' CHECK (primary_currency IN ('USD','MXN')),
 ADD COLUMN IF NOT EXISTS tax_id text NOT NULL DEFAULT '' CHECK (length(tax_id)<=40),
 ADD COLUMN IF NOT EXISTS municipality text NOT NULL DEFAULT '' CHECK (length(municipality)<=120),
 ADD COLUMN IF NOT EXISTS accountant_name text NOT NULL DEFAULT '' CHECK (length(accountant_name)<=200),
 ADD COLUMN IF NOT EXISTS accountant_email text NOT NULL DEFAULT '' CHECK (length(accountant_email)<=254);
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_registration_check;
ALTER TABLE companies ADD CONSTRAINT companies_registration_check CHECK (
 length(name) BETWEEN 2 AND 200 AND name=btrim(name)
 AND length(trade_name)<=200
 AND entity IN ('LLC','Corporation','Partnership','Sole Proprietorship','Nonprofit','S. DE R.L. DE C.V.','Unspecified')
 AND federal_tax_classification IN ('Unspecified','Disregarded Entity','Partnership','C Corporation','S Corporation','Tax Exempt')
 AND length(state) BETWEEN 1 AND 120 AND length(address_state)<=120
 AND (country<>'US' OR (state ~ '^[A-Z]{2}$' AND address_state ~ '^([A-Z]{2})?$'))
 AND ein ~ '^([0-9]{9})?$'
 AND zip ~ '^([0-9]{5}(-[0-9]{4})?)?$'
 AND length(address)<=300 AND length(city)<=120 AND length(phone)<=40 AND length(email)<=254
 AND basis IN ('Accrual','Cash') AND fiscal_year_end_month BETWEEN 1 AND 12
);
COMMIT;
