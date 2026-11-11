BEGIN;
ALTER TABLE ledger_vendors
  DROP CONSTRAINT vendors_name_check,
  ADD CONSTRAINT vendors_name_check CHECK (length(btrim(display_name)) BETWEEN 1 AND 500);
COMMIT;
