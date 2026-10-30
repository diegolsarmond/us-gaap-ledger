BEGIN;
-- Internal transfers are stored as two legs sharing transfer_id. Each leg names the
-- counterpart cash account so a scope holding both accounts can exclude them from activities.
ALTER TABLE cash_transactions
  ADD COLUMN IF NOT EXISTS transfer_id uuid,
  ADD COLUMN IF NOT EXISTS transfer_account_id uuid REFERENCES cash_accounts(id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cash_transactions_transfer_check' AND conrelid='cash_transactions'::regclass) THEN
    ALTER TABLE cash_transactions ADD CONSTRAINT cash_transactions_transfer_check CHECK (
      (cash_flow_line = 'internal_transfer') = (transfer_id IS NOT NULL)
      AND (transfer_id IS NULL) = (transfer_account_id IS NULL)
      AND transfer_account_id IS DISTINCT FROM account_id
    );
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS cash_transactions_transfer_leg_idx
  ON cash_transactions(transfer_id, account_id) WHERE transfer_id IS NOT NULL;
COMMIT;
