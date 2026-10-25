BEGIN;
CREATE TABLE IF NOT EXISTS companies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), data jsonb NOT NULL,
 active boolean NOT NULL DEFAULT true, cost_method text NOT NULL DEFAULT 'FIFO' CHECK(cost_method IN ('FIFO','WeightedAverage')),
 period_closed boolean NOT NULL DEFAULT false, active_period text NOT NULL DEFAULT '', revision integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE access_profiles ADD COLUMN IF NOT EXISTS manage_companies boolean NOT NULL DEFAULT false;
ALTER TABLE access_profiles ADD COLUMN IF NOT EXISTS write_accounting boolean NOT NULL DEFAULT false;
ALTER TABLE access_profiles ADD COLUMN IF NOT EXISTS close_periods boolean NOT NULL DEFAULT false;
ALTER TABLE access_profiles ADD COLUMN IF NOT EXISTS all_companies boolean NOT NULL DEFAULT false;
UPDATE access_profiles SET manage_companies=true,write_accounting=true,close_periods=true,all_companies=true WHERE system_admin;
CREATE TABLE IF NOT EXISTS profile_companies (
 profile_id uuid NOT NULL REFERENCES access_profiles(id), company_id uuid NOT NULL REFERENCES companies(id), PRIMARY KEY(profile_id,company_id)
);
ALTER TABLE system_audit_log ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);
ALTER TABLE cash_accounts ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);
ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);
-- This migration introduces company ownership without guessing ownership of existing rows.
-- Execute 005_reset_legacy_cash.sql once before making these columns mandatory.
CREATE TABLE IF NOT EXISTS accounting_revision (company_id uuid PRIMARY KEY REFERENCES companies(id), revision integer NOT NULL DEFAULT 0);
DO $$
DECLARE domain text;
BEGIN
 FOREACH domain IN ARRAY ARRAY['accounts','journals','inventory','projects','invoices','bills','statements','stagingRows','taxes','auditLogs','currencies','taxJurisdictions','paymentTerms','costCenters','expenseCategories','fiscalPeriods'] LOOP
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I (company_id uuid NOT NULL REFERENCES companies(id), id text NOT NULL, position integer NOT NULL, data jsonb NOT NULL, PRIMARY KEY(company_id,id))', 'ledger_'||lower(domain));
 END LOOP;
END $$;
-- Extracted relationships enforce ownership at the database boundary as well as in the service.
CREATE TABLE IF NOT EXISTS ledger_references (
 company_id uuid NOT NULL REFERENCES companies(id), source_domain text NOT NULL, source_id text NOT NULL,
 account_id text, project_id text, statement_id text,
 FOREIGN KEY(company_id,account_id) REFERENCES ledger_accounts(company_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(company_id,project_id) REFERENCES ledger_projects(company_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(company_id,statement_id) REFERENCES ledger_statements(company_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS ledger_references_company_idx ON ledger_references(company_id);
CREATE INDEX IF NOT EXISTS system_audit_company_idx ON system_audit_log(company_id,occurred_at DESC,id DESC);
CREATE OR REPLACE FUNCTION record_system_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous jsonb; following jsonb; actor uuid; actor_label text; company uuid;
BEGIN
 IF TG_OP <> 'INSERT' THEN previous := to_jsonb(OLD) - 'password_hash'; END IF;
 IF TG_OP <> 'DELETE' THEN following := to_jsonb(NEW) - 'password_hash'; END IF;
 actor := nullif(current_setting('app.actor_id',true),'')::uuid;
 IF actor IS NULL AND TG_TABLE_NAME IN ('cash_accounts','cash_transactions') THEN actor := (coalesce(following,previous)->>'user_id')::uuid; END IF;
 company := (coalesce(following,previous)->>'company_id')::uuid;
 IF TG_TABLE_NAME='companies' THEN company := (coalesce(following,previous)->>'id')::uuid; END IF;
 SELECT name INTO actor_label FROM app_users WHERE id=actor;
 INSERT INTO system_audit_log(actor_id,actor_name,action,entity,target_id,before_data,after_data,company_id)
 VALUES(actor,coalesce(actor_label,'Sistema'),TG_OP,TG_TABLE_NAME,coalesce(following,previous)->>'id',previous,following,company);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='audit_companies' AND tgrelid='companies'::regclass) THEN
 CREATE TRIGGER audit_companies AFTER INSERT OR UPDATE OR DELETE ON companies FOR EACH ROW EXECUTE FUNCTION record_system_audit();
 END IF;
END $$;
COMMIT;
