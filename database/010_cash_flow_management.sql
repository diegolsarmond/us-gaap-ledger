BEGIN;
ALTER TABLE cash_transactions
  ADD COLUMN IF NOT EXISTS cash_flow_line text NOT NULL DEFAULT 'unclassified',
  ADD COLUMN IF NOT EXISTS variance_note varchar(1000) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS forecast_amount numeric(16,2),
  ADD COLUMN IF NOT EXISTS forecast_date date,
  ADD COLUMN IF NOT EXISTS forecast_direction varchar(3);

-- Existing actuals have no recoverable original forecast. Never invent one.
UPDATE cash_transactions SET forecast_amount=amount, forecast_date=due_date,
  forecast_direction=direction
WHERE status='planned' AND forecast_amount IS NULL;

CREATE OR REPLACE FUNCTION preserve_cash_forecast() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.forecast_amount IS NOT NULL THEN
    IF NEW.account_id <> OLD.account_id THEN
      RAISE EXCEPTION 'A forecasted transaction cannot move between accounts. Cancel it and create a new transaction.';
    END IF;
    NEW.forecast_amount := OLD.forecast_amount;
    NEW.forecast_date := OLD.forecast_date;
    NEW.forecast_direction := OLD.forecast_direction;
  ELSIF NEW.status='planned' THEN
    NEW.forecast_amount := NEW.amount;
    NEW.forecast_date := NEW.due_date;
    NEW.forecast_direction := NEW.direction;
  ELSE
    NEW.forecast_amount := NULL;
    NEW.forecast_date := NULL;
    NEW.forecast_direction := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS preserve_cash_forecast ON cash_transactions;
CREATE TRIGGER preserve_cash_forecast BEFORE INSERT OR UPDATE ON cash_transactions
FOR EACH ROW EXECUTE FUNCTION preserve_cash_forecast();
CREATE TABLE IF NOT EXISTS cash_flow_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  currency varchar(3) NOT NULL CHECK (currency IN ('USD','BRL','EUR')),
  account_id uuid REFERENCES cash_accounts(id),
  inputs jsonb NOT NULL,
  updated_by uuid NOT NULL REFERENCES app_users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (company_id, period_start, period_end, currency, account_id)
);
DROP TRIGGER IF EXISTS audit_cash_flow_reconciliations ON cash_flow_reconciliations;
CREATE TRIGGER audit_cash_flow_reconciliations AFTER INSERT OR UPDATE OR DELETE ON cash_flow_reconciliations
FOR EACH ROW EXECUTE FUNCTION record_system_audit();
COMMIT;
