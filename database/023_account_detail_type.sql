-- Apply after 018_structured_ledger.sql.
BEGIN;
ALTER TABLE ledger_accounts ADD COLUMN IF NOT EXISTS detail_type text
 CHECK (length(detail_type) <= 200);
CREATE OR REPLACE VIEW chart_of_accounts AS
 SELECT company_id,id AS account_code,name AS account_name,type AS account_type,
 balance_type AS normal_balance,subgroup,coalesce(maturity,'Unclassified') AS maturity,is_contra,
 coalesce(track1099,false) AS track_1099,parent_account_code,description,position,detail_type
 FROM ledger_accounts;
COMMIT;
