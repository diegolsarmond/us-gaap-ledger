-- Cash Flow reads actual cash only from the General Ledger.
--
-- Cash accounts are the bank and cash accounts of the Chart of Accounts; their opening balances
-- are Opening journals. Categories are the counterpart GL accounts. What remains specific to
-- Cash Flow is stored here: forecasts, how GL accounts map to cash flow lines, per-movement
-- classification overrides and the supplemental reconciliation.
--
-- Replaces cash_accounts, cash_transactions and cash_categories. Their rows are not migrated:
-- actuals and opening balances belong in the General Ledger, and planned entries must be
-- re-entered as forecasts against a GL cash account. The statement below refuses to run while
-- any planned entry exists so that none is dropped silently.
BEGIN;

DO $$ BEGIN
  IF to_regclass('cash_transactions') IS NOT NULL
     AND EXISTS (SELECT 1 FROM cash_transactions WHERE status='planned') THEN
    RAISE EXCEPTION 'cash_transactions still has planned entries. Re-enter them as forecasts before running 037.';
  END IF;
END $$;

-- Reconciliations are scoped by GL cash account code instead of a cash_accounts row.
ALTER TABLE cash_flow_reconciliations
  DROP CONSTRAINT IF EXISTS cash_flow_reconciliations_account_id_fkey,
  DROP CONSTRAINT IF EXISTS cash_flow_reconciliations_company_id_period_start_period_en_key;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='cash_flow_reconciliations' AND column_name='account_id') THEN
    DELETE FROM cash_flow_reconciliations WHERE account_id IS NOT NULL;
    ALTER TABLE cash_flow_reconciliations DROP COLUMN account_id;
  END IF;
END $$;
ALTER TABLE cash_flow_reconciliations ADD COLUMN IF NOT EXISTS account_code text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cash_flow_reconciliations_scope_key') THEN
    ALTER TABLE cash_flow_reconciliations ADD CONSTRAINT cash_flow_reconciliations_scope_key
      UNIQUE NULLS NOT DISTINCT (company_id, period_start, period_end, currency, account_code);
  END IF;
END $$;

DROP TABLE IF EXISTS cash_transactions;
DROP TABLE IF EXISTS cash_accounts;
DROP TABLE IF EXISTS cash_categories;
DROP FUNCTION IF EXISTS preserve_cash_forecast();

CREATE TABLE IF NOT EXISTS cash_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  account_code text NOT NULL,
  counterpart_code text NOT NULL,
  description varchar(240) NOT NULL CHECK (length(trim(description)) > 0),
  direction varchar(3) NOT NULL CHECK (direction IN ('in','out')),
  amount numeric(16,2) NOT NULL CHECK (amount > 0),
  expected_date date NOT NULL,
  status varchar(10) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','realized','cancelled')),
  cash_flow_line text NOT NULL,
  variance_note varchar(1000) NOT NULL DEFAULT '',
  -- The first saved plan, kept for forecast vs. actual even after revision or cancellation.
  forecast_amount numeric(16,2) NOT NULL,
  forecast_date date NOT NULL,
  forecast_direction varchar(3) NOT NULL,
  -- Internal transfers are two legs sharing transfer_id; each names the other cash account.
  transfer_id uuid,
  transfer_account_code text,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (company_id, account_code) REFERENCES ledger_accounts(company_id, id),
  FOREIGN KEY (company_id, counterpart_code) REFERENCES ledger_accounts(company_id, id),
  CHECK ((cash_flow_line = 'internal_transfer') = (transfer_id IS NOT NULL)),
  CHECK ((transfer_id IS NULL) = (transfer_account_code IS NULL)),
  CHECK (transfer_account_code IS DISTINCT FROM account_code)
);
CREATE INDEX IF NOT EXISTS cash_forecasts_company_idx ON cash_forecasts(company_id, expected_date);
CREATE UNIQUE INDEX IF NOT EXISTS cash_forecasts_transfer_leg_idx
  ON cash_forecasts(transfer_id, account_code) WHERE transfer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION preserve_cash_forecast() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.forecast_amount := NEW.amount;
    NEW.forecast_date := NEW.expected_date;
    NEW.forecast_direction := NEW.direction;
  ELSE
    IF NEW.account_code <> OLD.account_code THEN
      RAISE EXCEPTION 'A forecast cannot move between accounts. Cancel it and create a new forecast.';
    END IF;
    NEW.forecast_amount := OLD.forecast_amount;
    NEW.forecast_date := OLD.forecast_date;
    NEW.forecast_direction := OLD.forecast_direction;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS preserve_cash_forecast ON cash_forecasts;
CREATE TRIGGER preserve_cash_forecast BEFORE INSERT OR UPDATE ON cash_forecasts
  FOR EACH ROW EXECUTE FUNCTION preserve_cash_forecast();

-- Cash flow line for movements against a GL account, per direction. Unmapped accounts use the
-- default rule by account type (src/lib/cash-flow-classification.ts).
CREATE TABLE IF NOT EXISTS cash_flow_account_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  account_code text NOT NULL,
  inflow_line text NOT NULL,
  outflow_line text NOT NULL,
  UNIQUE (company_id, account_code),
  FOREIGN KEY (company_id, account_code) REFERENCES ledger_accounts(company_id, id) ON DELETE CASCADE
);

-- Classification chosen for one posted cash movement: the cash line of a journal, against one
-- counterpart account (a journal may split one cash line across several counterparts).
CREATE TABLE IF NOT EXISTS cash_flow_line_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  journal_id text NOT NULL,
  line_sequence integer NOT NULL,
  counterpart_code text NOT NULL,
  cash_flow_line text NOT NULL,
  UNIQUE (company_id, journal_id, line_sequence, counterpart_code)
);

DO $$
DECLARE entry record;
BEGIN
  FOR entry IN SELECT * FROM (VALUES
    ('audit_cash_forecasts','cash_forecasts'),
    ('audit_cash_flow_account_lines','cash_flow_account_lines'),
    ('audit_cash_flow_line_overrides','cash_flow_line_overrides')
  ) AS triggers(trigger_name, table_name)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=entry.trigger_name
                   AND tgrelid=to_regclass(entry.table_name) AND NOT tgisinternal) THEN
      EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION record_system_audit()',
        entry.trigger_name, entry.table_name);
    END IF;
  END LOOP;
END $$;

COMMIT;
