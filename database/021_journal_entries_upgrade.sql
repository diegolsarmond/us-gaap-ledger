-- Forward compatibility for installations that applied an earlier Journal Entries draft.
-- Preserve every journal and convert draft JSON audit snapshots to structured Action Logs.
BEGIN;
ALTER TABLE accounting_policies ADD COLUMN IF NOT EXISTS opening_date date;
CREATE TABLE IF NOT EXISTS journal_account_rules (
 company_id uuid NOT NULL REFERENCES companies(id), account_code text NOT NULL, active boolean NOT NULL DEFAULT true,
 posting_allowed boolean NOT NULL DEFAULT true, valid_from date, valid_to date, cost_center_required boolean NOT NULL DEFAULT false,
 PRIMARY KEY(company_id,account_code), CHECK(valid_from IS NULL OR valid_to IS NULL OR valid_from<=valid_to)
);
DROP TRIGGER IF EXISTS journal_event_immutable ON journal_events;
ALTER TABLE journal_events ADD COLUMN IF NOT EXISTS audit_event_id bigint REFERENCES system_audit_events(id);
DO $$ DECLARE event record; audit_id bigint; BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='journal_events' AND column_name='snapshot') THEN
  FOR event IN SELECT e.*,u.name AS actor_name,j.company_id FROM journal_events e JOIN app_users u ON u.id=e.actor_id JOIN journal_entries j ON j.id=e.journal_entry_id WHERE e.audit_event_id IS NULL LOOP
   INSERT INTO system_audit_log(occurred_at,actor_id,actor_name,action,entity,target_id,company_id,after_data)
   VALUES(event.occurred_at,event.actor_id,event.actor_name,event.action,'JournalEntry',event.journal_entry_id::text,event.company_id,event.snapshot) RETURNING id INTO audit_id;
   UPDATE journal_events SET audit_event_id=audit_id WHERE id=event.id;
  END LOOP;
  ALTER TABLE journal_events DROP COLUMN snapshot;
 END IF;
END $$;
ALTER TABLE journal_events ALTER COLUMN audit_event_id SET NOT NULL;
CREATE TRIGGER journal_event_immutable BEFORE UPDATE OR DELETE ON journal_events FOR EACH ROW EXECUTE FUNCTION protect_journal_event();
CREATE UNIQUE INDEX IF NOT EXISTS journal_one_opening ON journal_entries(company_id) WHERE status='Posted' AND journal_type='Opening';
CREATE OR REPLACE FUNCTION protect_journal_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM journal_entries WHERE (id=NEW.journal_entry_id OR id=OLD.journal_entry_id) AND status='Posted') THEN RAISE EXCEPTION 'Posted journal lines are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DO $$ DECLARE link record; BEGIN
 FOR link IN SELECT * FROM (VALUES
 ('journal_entries','fiscal_period_id','ledger_fiscalperiods'),
 ('journal_entry_lines','account_code','ledger_accounts'),
 ('journal_entry_lines','cost_center_id','ledger_costcenters'),
 ('journal_entry_lines','project_id','ledger_projects'),
 ('journal_entry_lines','customer_id','ledger_customers'),
 ('journal_entry_lines','vendor_id','ledger_vendors')
 ) AS links(source_table,source_column,target_table) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass(link.source_table) AND confrelid=to_regclass(link.target_table) AND contype='f') THEN
   EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(company_id,%I) REFERENCES %I(company_id,id) DEFERRABLE INITIALLY DEFERRED',link.source_table,link.source_table||'_'||link.source_column||'_scope_fk',link.source_column,link.target_table);
  END IF;
 END LOOP;
END $$;
COMMIT;
