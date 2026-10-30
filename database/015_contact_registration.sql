BEGIN;
-- Keep JSONB as the write contract used by accounting.server.ts.
-- Generated columns expose typed fields without creating a second source of truth.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ledger_customers', 'ledger_vendors'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS source_open_balance numeric
      GENERATED ALWAYS AS ((data->>''sourceOpenBalance'')::numeric) STORED', t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=t::regclass AND conname=t || '_registration_check') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (
        jsonb_typeof(data) = ''object''
        AND jsonb_typeof(data->''displayName'') = ''string''
        AND coalesce(length(btrim(data->>''displayName'')),0) BETWEEN 1 AND 120
        AND (NOT data ? ''sourceOpenBalance'' OR jsonb_typeof(data->''sourceOpenBalance'') IN (''number'',''null''))
        AND (NOT data ? ''sourceBalanceDate'' OR jsonb_typeof(data->''sourceBalanceDate'') = ''null'' OR
          (jsonb_typeof(data->''sourceBalanceDate'') = ''string'' AND
           data->>''sourceBalanceDate'' ~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'' AND
           to_char((data->>''sourceBalanceDate'')::date,''YYYY-MM-DD'') = data->>''sourceBalanceDate''))
      )', t, t || '_registration_check');
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='ledger_customers'::regclass AND conname='ledger_customers_type_check') THEN
    ALTER TABLE ledger_customers ADD CONSTRAINT ledger_customers_type_check CHECK (
      NOT data ? 'customerType' OR
      (jsonb_typeof(data->'customerType')='string' AND length(data->>'customerType')<=120)
    );
  END IF;
END $$;
COMMENT ON COLUMN ledger_customers.source_open_balance IS 'Reference balance from source export; not an opening journal or live receivables balance. NULL means not provided.';
COMMENT ON COLUMN ledger_vendors.source_open_balance IS 'Reference balance from source export; not an opening journal or live payables balance. NULL means not provided.';
CREATE OR REPLACE VIEW customer_registration AS
SELECT company_id,id,position,data->>'displayName' AS display_name,
  data->>'companyName' AS company_name,data->>'customerType' AS customer_type,
  data#>>'{billingAddress,street}' AS street_address,data#>>'{billingAddress,city}' AS city,
  data#>>'{billingAddress,state}' AS state,data#>>'{billingAddress,country}' AS country,
  data#>>'{billingAddress,zip}' AS zip,data->>'phone' AS phone,data->>'email' AS email,
  data->>'currency' AS currency,source_open_balance,
  (data->>'sourceBalanceDate')::date AS source_balance_date,
  coalesce(data->'attachments','[]'::jsonb) AS attachments
FROM ledger_customers;
CREATE OR REPLACE VIEW vendor_registration AS
SELECT company_id,id,position,data->>'displayName' AS display_name,
  data->>'companyName' AS company_name,data->>'streetAddress' AS street_address,
  data->>'city' AS city,data->>'stateProvince' AS state,data->>'country' AS country,
  data->>'zipCode' AS zip,data->>'phone' AS phone,data->>'email' AS email,
  (data->>'track1099')::boolean AS track_1099,data->>'currency' AS currency,
  source_open_balance,(data->>'sourceBalanceDate')::date AS source_balance_date
FROM ledger_vendors;
COMMIT;
