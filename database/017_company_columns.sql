BEGIN;
-- Company registration moves from the data JSONB document to typed columns.
-- Re-runnable: the backfill and the drop only happen while the legacy column still exists.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS trade_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS entity text,
  ADD COLUMN IF NOT EXISTS federal_tax_classification text NOT NULL DEFAULT 'Unspecified',
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS ein text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_state text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS zip text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS basis text NOT NULL DEFAULT 'Accrual',
  ADD COLUMN IF NOT EXISTS fiscal_year_end_month smallint NOT NULL DEFAULT 12;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='companies'::regclass AND attname='data' AND NOT attisdropped) THEN
    EXECUTE $sql$UPDATE companies SET
      name = btrim(data->>'name'),
      trade_name = coalesce(btrim(data->>'tradeName'), ''),
      entity = data->>'entity',
      federal_tax_classification = coalesce(data->>'federalTaxClassification', 'Unspecified'),
      state = data->>'state',
      ein = regexp_replace(coalesce(data->>'ein', ''), '-', '', 'g'),
      address = coalesce(btrim(data->>'address'), ''),
      city = coalesce(btrim(data->>'city'), ''),
      address_state = coalesce(data->>'addressState', ''),
      zip = coalesce(data->>'zip', ''),
      phone = coalesce(btrim(data->>'phone'), ''),
      email = coalesce(btrim(data->>'email'), ''),
      basis = coalesce(data->>'basis', 'Accrual'),
      fiscal_year_end_month = coalesce((data->>'fiscalYearEndMonth')::smallint, 12)$sql$;
    ALTER TABLE companies DROP COLUMN data;
  END IF;
END $$;
-- Name, entity and state were always required by the application; NOT NULL fails on incomplete legacy rows.
ALTER TABLE companies
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN entity SET NOT NULL,
  ALTER COLUMN state SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='companies_registration_check' AND conrelid='companies'::regclass) THEN
    ALTER TABLE companies ADD CONSTRAINT companies_registration_check CHECK (
      length(name) BETWEEN 2 AND 200 AND name = btrim(name)
      AND length(trade_name) <= 200
      AND entity IN ('LLC','Corporation','Partnership','Sole Proprietorship','Nonprofit')
      AND federal_tax_classification IN ('Unspecified','Disregarded Entity','Partnership','C Corporation','S Corporation','Tax Exempt')
      AND state ~ '^[A-Z]{2}$'
      AND address_state ~ '^([A-Z]{2})?$'
      AND ein ~ '^([0-9]{9})?$'
      AND zip ~ '^([0-9]{5}(-[0-9]{4})?)?$'
      AND length(address) <= 300 AND length(city) <= 120 AND length(phone) <= 40 AND length(email) <= 254
      AND basis IN ('Accrual','Cash')
      AND fiscal_year_end_month BETWEEN 1 AND 12
    );
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS companies_name_idx ON companies(name);
COMMIT;
