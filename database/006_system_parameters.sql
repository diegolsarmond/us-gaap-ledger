BEGIN;
CREATE TABLE IF NOT EXISTS parameter_revision(company_id uuid PRIMARY KEY REFERENCES companies(id),revision integer NOT NULL DEFAULT 0);
DO $$ DECLARE domain text; BEGIN
 FOREACH domain IN ARRAY ARRAY['currencies','taxjurisdictions','paymentterms','costcenters','expensecategories','fiscalperiods'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='audit_parameters' AND tgrelid=('ledger_'||domain)::regclass) THEN
 EXECUTE format('CREATE TRIGGER audit_parameters AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION record_system_audit()', 'ledger_'||domain);
 END IF;
 END LOOP;
END $$;
COMMIT;
