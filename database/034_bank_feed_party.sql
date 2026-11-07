BEGIN;

-- Preserve the counterparty imported from the statement separately from the operator's choice.
ALTER TABLE ledger_stagingrows ADD COLUMN IF NOT EXISTS feed_payee_id text;
ALTER TABLE ledger_stagingrows ADD COLUMN IF NOT EXISTS feed_party_edited boolean NOT NULL DEFAULT false;

COMMIT;
