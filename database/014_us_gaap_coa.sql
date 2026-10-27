BEGIN;
-- Optional metadata preserves legacy account payloads without guessing classification.
ALTER TABLE ledger_accounts ADD COLUMN IF NOT EXISTS parent_account_code text
 GENERATED ALWAYS AS (nullif(data->>'parentCode','')) STORED;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='ledger_accounts'::regclass AND conname='ledger_accounts_parent_company_fkey') THEN
  ALTER TABLE ledger_accounts ADD CONSTRAINT ledger_accounts_parent_company_fkey
   FOREIGN KEY(company_id,parent_account_code) REFERENCES ledger_accounts(company_id,id) DEFERRABLE INITIALLY DEFERRED;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='ledger_accounts'::regclass AND conname='ledger_accounts_coa_metadata_check') THEN
  ALTER TABLE ledger_accounts ADD CONSTRAINT ledger_accounts_coa_metadata_check CHECK (
   (NOT data ? 'maturity' OR (jsonb_typeof(data->'maturity')='string' AND data->>'maturity' IN ('Current','Noncurrent','Not Applicable','Unclassified')))
   AND (NOT data ? 'isContra' OR jsonb_typeof(data->'isContra')='boolean')
   AND (NOT data ? 'track1099' OR jsonb_typeof(data->'track1099')='boolean')
   AND (NOT data ? 'subgroup' OR (jsonb_typeof(data->'subgroup')='string' AND length(data->>'subgroup')<=120))
   AND (NOT data ? 'parentCode' OR (jsonb_typeof(data->'parentCode')='string' AND length(data->>'parentCode') BETWEEN 1 AND 120))
   AND (parent_account_code IS NULL OR parent_account_code<>id)
   AND (data->>'maturity' IS NULL OR data->>'maturity'='Unclassified' OR
     CASE WHEN data->>'type' IN ('Asset','Liability') THEN data->>'maturity' IN ('Current','Noncurrent') ELSE data->>'maturity'='Not Applicable' END)
  );
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS ledger_accounts_parent_idx ON ledger_accounts(company_id,parent_account_code);
CREATE OR REPLACE VIEW chart_of_accounts AS
 SELECT company_id,id AS account_code,data->>'name' AS account_name,data->>'type' AS account_type,
 data->>'balanceType' AS normal_balance,data->>'subgroup' AS subgroup,
 coalesce(data->>'maturity','Unclassified') AS maturity,
 (data->>'isContra')::boolean AS is_contra,coalesce((data->>'track1099')::boolean,false) AS track_1099,
 parent_account_code,data->>'description' AS description,position
 FROM ledger_accounts;
COMMIT;
