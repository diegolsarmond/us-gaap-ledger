BEGIN;

ALTER TABLE ledger_statements
  ADD COLUMN IF NOT EXISTS feed_source_format text
    CHECK (feed_source_format IN ('ledgerx', 'quickbooks-posted', 'quickbooks-review'));

ALTER TABLE ledger_stagingrows
  ADD COLUMN IF NOT EXISTS feed_check_number text,
  ADD COLUMN IF NOT EXISTS feed_source_class text,
  ADD COLUMN IF NOT EXISTS feed_source_location text,
  ADD COLUMN IF NOT EXISTS feed_source_customer text;

COMMIT;
