BEGIN;
ALTER TABLE cash_forecasts
  ADD COLUMN IF NOT EXISTS document_date date,
  ADD COLUMN IF NOT EXISTS party_id text;
COMMIT;
