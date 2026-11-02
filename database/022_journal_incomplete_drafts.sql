BEGIN;
ALTER TABLE journal_entry_lines ALTER COLUMN account_code DROP NOT NULL;
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_description_check;
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='journal_entry_lines'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%debit >%' LOOP
  EXECUTE format('ALTER TABLE journal_entry_lines DROP CONSTRAINT %I',item.conname);
 END LOOP;
END $$;
ALTER TABLE journal_entry_lines DROP CONSTRAINT IF EXISTS journal_draft_amounts;
ALTER TABLE journal_entry_lines ADD CONSTRAINT journal_draft_amounts CHECK(debit>=0 AND credit>=0 AND NOT(debit>0 AND credit>0));
CREATE OR REPLACE FUNCTION check_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='Posted' AND (length(trim(NEW.description))=0 OR (SELECT count(*)<2 OR coalesce(sum(debit-credit),1)<>0 OR coalesce(sum(base_debit-base_credit),1)<>0 OR bool_or(account_code IS NULL OR (debit=0 AND credit=0)) FROM journal_entry_lines WHERE journal_entry_id=NEW.id)) THEN RAISE EXCEPTION 'Journal must have valid lines, an event description and balance in transaction and functional currencies'; END IF;
 RETURN NEW;
END $$;
COMMIT;
