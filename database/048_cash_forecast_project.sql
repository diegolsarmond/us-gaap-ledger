BEGIN;
ALTER TABLE cash_forecasts ADD COLUMN IF NOT EXISTS project_id text;
COMMIT;
