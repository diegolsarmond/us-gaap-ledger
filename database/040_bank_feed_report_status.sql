BEGIN;

ALTER TABLE ledger_stagingrows
  ADD COLUMN IF NOT EXISTS feed_source_status text
    CHECK (feed_source_status IN ('Posted', 'Pending'));

COMMIT;
